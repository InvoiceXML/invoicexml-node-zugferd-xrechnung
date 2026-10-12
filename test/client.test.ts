import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  InvoiceXmlError,
  TooManyRequestsError,
  VERSION,
  ZugferdXRechnungClient,
  type InvoiceDocument,
} from "../src/index.js";

const invoice: InvoiceDocument = {
  invoiceNumber: "RE-2026-1105",
  issueDate: "2026-07-28",
  currency: "EUR",
  seller: {
    name: "Spreewerk Solutions GmbH",
    vatIdentifier: "DE811234567",
    postalAddress: { line1: "Köpenicker Str. 154", city: "Berlin", postCode: "10997", country: "DE" },
  },
  buyer: {
    name: "Main Handel GmbH",
    postalAddress: { line1: "Zeil 65", city: "Frankfurt am Main", postCode: "60313", country: "DE" },
  },
  paymentDetails: { paymentAccountIdentifier: "DE02120300000000202051" },
  lines: [
    { quantity: 60, item: { name: "SaaS-Lizenz Team" }, priceDetails: { netPrice: 12.5 }, vatInformation: { rate: 19 } },
  ],
};

const PDF = new TextEncoder().encode("%PDF-1.7\n%binary\n");
const XML = '<?xml version="1.0"?><Invoice/>';

interface Call {
  url: string;
  init: RequestInit;
}

function mockFetch(...responses: Response[]) {
  const calls: Call[] = [];
  const fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    const next = responses.shift();
    if (!next) throw new Error("Unexpected request");
    return next;
  });
  return { fetch: fetch as unknown as typeof globalThis.fetch, calls };
}

function client(fetch: typeof globalThis.fetch, extra: Record<string, unknown> = {}) {
  return new ZugferdXRechnungClient({ apiKey: "test-key", fetch, ...extra });
}

const jsonResponse = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });

const headers = (call: Call) => call.init.headers as Record<string, string>;
const form = (call: Call) => call.init.body as FormData;

afterEach(() => {
  vi.useRealTimers();
});

describe("construction", () => {
  it("requires an API key", () => {
    expect(() => new ZugferdXRechnungClient({ apiKey: " " })).toThrow(/API key/);
  });

  it("keeps VERSION in sync with package.json", () => {
    const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
    expect(VERSION).toBe(pkg.version);
  });

  it("honours a custom base URL without a trailing slash", async () => {
    const { fetch, calls } = mockFetch(new Response(PDF));
    await client(fetch, { baseUrl: "https://sandbox.example.test/" }).createZugferd(invoice);
    expect(calls[0]!.url).toBe("https://sandbox.example.test/v1/create/zugferd");
  });
});

describe("create", () => {
  it("posts the invoice envelope with bearer auth and returns the PDF bytes", async () => {
    const { fetch, calls } = mockFetch(new Response(PDF, { headers: { "Content-Type": "application/pdf" } }));
    const pdf = await client(fetch).createZugferd(invoice, { language: "DE", brandColor: "#0F766E" });

    expect(pdf).toBeInstanceOf(Uint8Array);
    expect(Array.from(pdf)).toEqual(Array.from(PDF));
    const call = calls[0]!;
    expect(call.url).toBe("https://api.invoicexml.com/v1/create/zugferd");
    expect(call.init.method).toBe("POST");
    expect(headers(call).Authorization).toBe("Bearer test-key");
    expect(headers(call)["Content-Type"]).toBe("application/json");
    expect(headers(call)["User-Agent"]).toBe(`invoicexml-node-zugferd-xrechnung/${VERSION}`);
    expect(JSON.parse(call.init.body as string)).toEqual({
      invoice,
      options: { language: "DE", brandColor: "#0F766E" },
    });
  });

  it("omits options when none are given", async () => {
    const { fetch, calls } = mockFetch(new Response(PDF));
    await client(fetch).createZugferd(invoice);
    expect(JSON.parse(calls[0]!.init.body as string)).toEqual({ invoice });
  });

  it("returns XRechnung XML as text and passes the syntax option", async () => {
    const { fetch, calls } = mockFetch(new Response(XML, { headers: { "Content-Type": "application/xml" } }));
    const xml = await client(fetch).createXRechnung({ ...invoice, buyerReference: "11302-00567-22" }, { syntax: "cii" });

    expect(xml).toBe(XML);
    expect(calls[0]!.url).toBe("https://api.invoicexml.com/v1/create/xrechnung");
    const body = JSON.parse(calls[0]!.init.body as string);
    expect(body.options).toEqual({ syntax: "cii" });
    expect(body.invoice.buyerReference).toBe("11302-00567-22");
  });

  it("throws an InvoiceXmlError carrying the violated rules on 400", async () => {
    const problem = {
      title: "Invoice validation failed",
      detail: "The invoice violates 1 rule.",
      status: 400,
      errorCode: 4001,
      errors: [{ rule: "BR-DE-15", layer: "cius", message: "Buyer reference (Leitweg-ID) is missing.", fields: ["buyerReference"] }],
      warnings: [],
    };
    const { fetch } = mockFetch(jsonResponse(problem, 400));
    const error = await client(fetch).createXRechnung(invoice).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(InvoiceXmlError);
    const e = error as InvoiceXmlError;
    expect(e.status).toBe(400);
    expect(e.errorCode).toBe(4001);
    expect(e.errors[0]!.rule).toBe("BR-DE-15");
    expect(e.errors[0]!.fields).toEqual(["buyerReference"]);
    expect(e.message).toBe("InvoiceXML API error 400: Invoice validation failed (The invoice violates 1 rule.)");
  });

  it("reads a string errorCode and the traceId, and ignores a non-array errors member", async () => {
    const problem = { title: "No embedded XML", status: 400, errorCode: "4006", traceId: "00-abc-01", errors: { xml: ["missing"] } };
    const { fetch } = mockFetch(jsonResponse(problem, 400));
    const e = (await client(fetch).createZugferd(invoice).catch((x: unknown) => x)) as InvoiceXmlError;
    expect(e.errorCode).toBe(4006);
    expect(e.traceId).toBe("00-abc-01");
    expect(e.errors).toEqual([]);
  });

  it("maps a non-JSON error body to the detail", async () => {
    const { fetch } = mockFetch(new Response("upstream unavailable", { status: 502 }));
    const error = (await client(fetch).createZugferd(invoice).catch((e: unknown) => e)) as InvoiceXmlError;
    expect(error.status).toBe(502);
    expect(error.detail).toBe("upstream unavailable");
    expect(error.errors).toEqual([]);
  });

  it("throws on 401", async () => {
    const { fetch } = mockFetch(jsonResponse({ title: "Unauthorized", status: 401 }, 401));
    await expect(client(fetch).createZugferd(invoice)).rejects.toMatchObject({ status: 401, title: "Unauthorized" });
  });
});

describe("uploads", () => {
  const verdict = {
    valid: false,
    detail: "1 error.",
    data: { profile: "xrechnung" },
    errors: [{ rule: "BR-DE-15", layer: "cius", line: 3, message: "Leitweg-ID missing.", fields: ["buyerReference"] }],
    warnings: [],
    report: [],
  };

  it("validates a ZUGFeRD PDF as a multipart file labelled application/pdf", async () => {
    const { fetch, calls } = mockFetch(jsonResponse({ ...verdict, valid: true, errors: [] }));
    const result = await client(fetch).validateZugferd(PDF);

    expect(result.valid).toBe(true);
    const call = calls[0]!;
    expect(call.url).toBe("https://api.invoicexml.com/v1/validate/zugferd");
    expect(headers(call)["Content-Type"]).toBeUndefined();
    const file = form(call).get("file") as File;
    expect(file.type).toBe("application/pdf");
    expect(file.name).toBe("document.pdf");
    expect(new Uint8Array(await file.arrayBuffer())).toEqual(PDF);
  });

  it("validates XRechnung XML given as a string and returns the findings", async () => {
    const { fetch, calls } = mockFetch(jsonResponse(verdict));
    const result = await client(fetch).validateXRechnung(XML);

    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatchObject({ rule: "BR-DE-15", layer: "cius" });
    const file = form(calls[0]!).get("file") as File;
    expect(calls[0]!.url).toBe("https://api.invoicexml.com/v1/validate/xrechnung");
    expect(file.type).toBe("application/xml");
    expect(file.name).toBe("document.xml");
    expect(await file.text()).toBe(XML);
  });

  it("keeps the name of a File upload", async () => {
    const { fetch, calls } = mockFetch(jsonResponse(verdict));
    await client(fetch).validateXRechnung(new File([XML], "rechnung.xml", { type: "text/xml" }));
    const file = form(calls[0]!).get("file") as File;
    expect(file.name).toBe("rechnung.xml");
    expect(file.type).toBe("text/xml");
  });

  it("embeds with pdf and xml parts and the skipValidation flag", async () => {
    const { fetch, calls } = mockFetch(new Response(PDF), new Response(PDF));
    await client(fetch).embedZugferd(PDF, Buffer.from(XML), { skipValidation: true });
    await client(fetch).embedZugferd(PDF.buffer as ArrayBuffer, XML);

    const first = form(calls[0]!);
    expect(calls[0]!.url).toBe("https://api.invoicexml.com/v1/embed/zugferd");
    expect((first.get("pdf") as File).name).toBe("invoice.pdf");
    expect((first.get("xml") as File).name).toBe("invoice.xml");
    expect(first.get("skipValidation")).toBe("true");
    expect(form(calls[1]!).has("skipValidation")).toBe(false);
  });

  it("renders XRechnung to PDF with language and logo fields", async () => {
    const { fetch, calls } = mockFetch(new Response(PDF));
    const pdf = await client(fetch).renderXRechnungToPdf(XML, { language: "DE", logoUrl: "https://example.com/logo.png" });

    expect(pdf.byteLength).toBe(PDF.byteLength);
    const body = form(calls[0]!);
    expect(calls[0]!.url).toBe("https://api.invoicexml.com/v1/render/xrechnung/to/pdf");
    expect(body.get("language")).toBe("DE");
    expect(body.get("logoUrl")).toBe("https://example.com/logo.png");
  });

  it("extracts invoice JSON and attachments", async () => {
    const zip = new Uint8Array([0x50, 0x4b, 0x03, 0x04]);
    const { fetch, calls } = mockFetch(jsonResponse({ invoice }), new Response(zip));
    const extracted = await client(fetch).extractJson(PDF);
    const attachments = await client(fetch).extractAttachments(PDF);

    expect(extracted.invoice.invoiceNumber).toBe("RE-2026-1105");
    expect(Array.from(attachments)).toEqual(Array.from(zip));
    expect(calls.map((c) => c.url)).toEqual([
      "https://api.invoicexml.com/v1/extract/json",
      "https://api.invoicexml.com/v1/extract/attachments",
    ]);
  });
});

describe("rate limiting", () => {
  it("waits Retry-After seconds on 429 and retries", async () => {
    vi.useFakeTimers();
    const { fetch, calls } = mockFetch(
      jsonResponse({ title: "Too Many Requests" }, 429, { "Retry-After": "7" }),
      new Response(PDF),
    );
    const pending = client(fetch).createZugferd(invoice);

    await vi.advanceTimersByTimeAsync(6_999);
    expect(calls).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    await expect(pending).resolves.toBeInstanceOf(Uint8Array);
    expect(calls).toHaveLength(2);
    expect(calls[1]!.init.body).toBe(calls[0]!.init.body);
  });

  it("throws TooManyRequestsError once retries are used up", async () => {
    const { fetch, calls } = mockFetch(
      jsonResponse({ title: "Too Many Requests" }, 429, { "Retry-After": "0" }),
      jsonResponse({ title: "Too Many Requests" }, 429, { "Retry-After": "0" }),
    );
    const error = await client(fetch, { maxRetries: 1 }).validateZugferd(PDF).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(TooManyRequestsError);
    expect((error as TooManyRequestsError).retryAfter).toBe(0);
    expect((error as TooManyRequestsError).status).toBe(429);
    expect(calls).toHaveLength(2);
  });

  it("caps an excessive Retry-After", async () => {
    const { fetch } = mockFetch(jsonResponse({}, 429, { "Retry-After": "99999" }));
    const error = (await client(fetch, { maxRetries: 0 }).createZugferd(invoice).catch((e: unknown) => e)) as TooManyRequestsError;
    expect(error.retryAfter).toBe(120);
  });
});
