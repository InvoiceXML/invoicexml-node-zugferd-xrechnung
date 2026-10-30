import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  InvoiceXmlError,
  TooManyRequestsError,
  VERSION,
  ZugferdXRechnungClient,
  type EmailMessage,
  type InvoiceDocument,
  type RenderOptions,
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
const fieldNames = (call: Call) => {
  const names: string[] = [];
  form(call).forEach((_, name) => names.push(name));
  return names;
};

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

describe("render", () => {
  it.each([
    ["renderXRechnungToPdf", "xrechnung"],
    ["renderCiiToPdf", "cii"],
  ] as const)("%s sends every option to /v1/render/%s/to/pdf", async (method, route) => {
    const { fetch, calls } = mockFetch(new Response(PDF));
    const pdf = await client(fetch)[method](XML, { language: "FR", logoUrl: "https://example.com/logo.png", includeQrCode: true });

    expect(Array.from(pdf)).toEqual(Array.from(PDF));
    expect(calls[0]!.url).toBe(`https://api.invoicexml.com/v1/render/${route}/to/pdf`);
    const body = form(calls[0]!);
    expect((body.get("file") as File).type).toBe("application/xml");
    expect(body.get("language")).toBe("FR");
    expect(body.get("logoUrl")).toBe("https://example.com/logo.png");
    expect(body.get("includeQrCode")).toBe("true");
  });

  it("omits unset options and sends an explicit includeQrCode false", async () => {
    const { fetch, calls } = mockFetch(new Response(PDF), new Response(PDF));
    await client(fetch).renderCiiToPdf(XML);
    await client(fetch).renderCiiToPdf(XML, { includeQrCode: false });

    expect(fieldNames(calls[0]!)).toEqual(["file"]);
    expect(form(calls[1]!).get("includeQrCode")).toBe("false");
  });
});

describe("convert", () => {
  it.each([
    ["convertZugferdToUbl", "zugferd/to/ubl", PDF],
    ["convertZugferdToCii", "zugferd/to/cii", PDF],
    ["convertXRechnungToUbl", "xrechnung/to/ubl", XML],
    ["convertXRechnungToCii", "xrechnung/to/cii", XML],
    ["convertUblToXRechnung", "ubl/to/xrechnung", XML],
    ["convertCiiToXRechnung", "cii/to/xrechnung", XML],
  ] as const)("%s posts to /v1/convert/%s and returns the XML as text", async (method, route, input) => {
    const { fetch, calls } = mockFetch(new Response(XML), new Response(XML));
    const xml = await client(fetch)[method](input, { validationLanguage: "DE" });
    await client(fetch)[method](input);

    expect(xml).toBe(XML);
    expect(calls[0]!.url).toBe(`https://api.invoicexml.com/v1/convert/${route}`);
    expect(fieldNames(calls[0]!)).toEqual(["file", "validationLanguage"]);
    expect(form(calls[0]!).get("validationLanguage")).toBe("DE");
    expect(fieldNames(calls[1]!)).toEqual(["file"]);
  });

  it.each([
    ["convertCiiToZugferd", "cii/to/zugferd"],
    ["convertUblToZugferd", "ubl/to/zugferd"],
    ["convertXRechnungToZugferd", "xrechnung/to/zugferd"],
  ] as const)("%s posts to /v1/convert/%s and returns the PDF bytes", async (method, route) => {
    const { fetch, calls } = mockFetch(new Response(PDF), new Response(PDF));
    const pdf = await client(fetch)[method](XML, { language: "DE", validationLanguage: "FR" });
    await client(fetch)[method](XML);

    expect(Array.from(pdf)).toEqual(Array.from(PDF));
    expect(calls[0]!.url).toBe(`https://api.invoicexml.com/v1/convert/${route}`);
    expect(form(calls[0]!).get("language")).toBe("DE");
    expect(form(calls[0]!).get("validationLanguage")).toBe("FR");
    expect(fieldNames(calls[1]!)).toEqual(["file"]);
  });

  it("surfaces a failed conversion through InvoiceXmlError", async () => {
    const problem = { title: "No embedded XML", status: 400, errorCode: 4006, errors: [], warnings: [] };
    const { fetch } = mockFetch(jsonResponse(problem, 400));
    const error = await client(fetch).convertZugferdToUbl(PDF).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(InvoiceXmlError);
    expect((error as InvoiceXmlError).errorCode).toBe(4006);
  });
});

describe("validation report", () => {
  const reportResponse = (headers?: Record<string, string>) => new Response(PDF, { headers });

  it.each([
    ["validateZugferdReport", "zugferd", PDF],
    ["validateXRechnungReport", "xrechnung", XML],
  ] as const)("%s posts to /v1/validate/%s/report and returns the file and verdict", async (method, route, input) => {
    const { fetch, calls } = mockFetch(reportResponse({ "X-Invoice-Valid": "true" }));
    const report = await client(fetch)[method](input, { validationLanguage: "DE" });

    expect(report.valid).toBe(true);
    expect(Array.from(report.file)).toEqual(Array.from(PDF));
    expect(calls[0]!.url).toBe(`https://api.invoicexml.com/v1/validate/${route}/report`);
    expect(fieldNames(calls[0]!)).toEqual(["file", "validationLanguage"]);
    expect(form(calls[0]!).get("validationLanguage")).toBe("DE");
  });

  it("returns a failed verdict as a normal result", async () => {
    const { fetch } = mockFetch(reportResponse({ "X-Invoice-Valid": "false" }));
    const report = await client(fetch).validateXRechnungReport(XML);
    expect(report.valid).toBe(false);
    expect(report.file.byteLength).toBe(PDF.byteLength);
  });

  it("returns null when the verdict header is missing and omits unset options", async () => {
    const { fetch, calls } = mockFetch(reportResponse());
    const report = await client(fetch).validateZugferdReport(PDF);
    expect(report.valid).toBeNull();
    expect(fieldNames(calls[0]!)).toEqual(["file"]);
  });

  it("surfaces a malformed file through InvoiceXmlError", async () => {
    const problem = { title: "Malformed XML", status: 400, errorCode: 4003, errors: [], warnings: [] };
    const { fetch } = mockFetch(jsonResponse(problem, 400));
    const error = await client(fetch).validateXRechnungReport("<broken").catch((e: unknown) => e);

    expect(error).toBeInstanceOf(InvoiceXmlError);
    expect((error as InvoiceXmlError).status).toBe(400);
  });
});

describe("transform", () => {
  it("sends every ZUGFeRD option and returns the PDF bytes", async () => {
    const { fetch, calls } = mockFetch(new Response(PDF));
    const pdf = await client(fetch).transformToZugferd(PDF, {
      language: "auto",
      preserveOriginalPdf: true,
      includeAdvancedProperties: true,
      validationLanguage: "DE",
    });

    expect(Array.from(pdf)).toEqual(Array.from(PDF));
    expect(calls[0]!.url).toBe("https://api.invoicexml.com/v1/transform/to/zugferd");
    const body = form(calls[0]!);
    expect((body.get("file") as File).type).toBe("application/pdf");
    expect(body.get("language")).toBe("auto");
    expect(body.get("preserveOriginalPdf")).toBe("true");
    expect(body.get("includeAdvancedProperties")).toBe("true");
    expect(body.get("validationLanguage")).toBe("DE");
  });

  it("omits unset options, so the API defaults apply", async () => {
    const { fetch, calls } = mockFetch(new Response(PDF));
    await client(fetch).transformToZugferd(PDF);
    expect(fieldNames(calls[0]!)).toEqual(["file"]);
  });

  it("really sends includeAdvancedProperties false", async () => {
    const { fetch, calls } = mockFetch(new Response(PDF));
    await client(fetch).transformToZugferd(PDF, { includeAdvancedProperties: false });
    expect(form(calls[0]!).get("includeAdvancedProperties")).toBe("false");
  });

  it("sends the required buyerReference for XRechnung and returns the XML as text", async () => {
    const { fetch, calls } = mockFetch(new Response(XML), new Response(XML));
    const xml = await client(fetch).transformToXRechnung(PDF, "11302-00567-22", { validationLanguage: "DE" });
    await client(fetch).transformToXRechnung(PDF, "11302-00567-22");

    expect(xml).toBe(XML);
    expect(calls[0]!.url).toBe("https://api.invoicexml.com/v1/transform/to/xrechnung");
    expect(form(calls[0]!).get("buyerReference")).toBe("11302-00567-22");
    expect(form(calls[0]!).get("validationLanguage")).toBe("DE");
    expect(fieldNames(calls[1]!)).toEqual(["file", "buyerReference"]);
  });

  it("surfaces a refused invoice through InvoiceXmlError", async () => {
    const problem = { title: "Invoice validation failed", status: 400, errorCode: 4001, errors: [{ rule: "BR-DE-15", message: "x" }], warnings: [] };
    const { fetch } = mockFetch(jsonResponse(problem, 400));
    const error = await client(fetch).transformToXRechnung(PDF, "11302-00567-22").catch((e: unknown) => e);

    expect(error).toBeInstanceOf(InvoiceXmlError);
    expect((error as InvoiceXmlError).errors[0]!.rule).toBe("BR-DE-15");
  });

  it.each([[null], [undefined], [""], ["  "]])("refuses the blank buyerReference %j before any request", async (buyerReference) => {
    const { fetch, calls } = mockFetch();

    await expect(client(fetch).transformToXRechnung(PDF, buyerReference as string)).rejects.toBeInstanceOf(TypeError);
    expect(calls).toHaveLength(0);
  });

  it.each([
    ["zugferd", (c: ZugferdXRechnungClient) => c.transformToZugferd(PDF)],
    ["xrechnung", (c: ZugferdXRechnungClient) => c.transformToXRechnung(PDF, "11302-00567-22")],
  ] as const)("makes one request on a 429 to transform/to/%s and throws TooManyRequestsError", async (route, call) => {
    const { fetch, calls } = mockFetch(jsonResponse({ title: "Too Many Requests" }, 429, { "Retry-After": "7" }));
    const error = await call(client(fetch)).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(TooManyRequestsError);
    expect((error as TooManyRequestsError).status).toBe(429);
    expect((error as TooManyRequestsError).retryAfter).toBe(7);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe(`https://api.invoicexml.com/v1/transform/to/${route}`);
  });
});


describe("email", () => {
  const accepted = { status: "accepted", messageId: "msg-1" };
  const required = { from: "rechnung@spreewerk-solutions.example", to: "buchhaltung@main-handel.example" };
  const full = {
    ...required,
    fromName: "Spreewerk Solutions",
    cc: ["archiv@spreewerk-solutions.example", "steuer@spreewerk-solutions.example"],
    bcc: ["kopie@spreewerk-solutions.example"],
    replyTo: "forderungen@spreewerk-solutions.example",
    subject: "Rechnung RE-2026-1105",
    message: "Guten Tag,\n\nanbei unsere Rechnung.",
  };

  it("posts the invoice envelope plus the email object and returns the message id", async () => {
    const { fetch, calls } = mockFetch(jsonResponse(accepted));
    const result = await client(fetch).emailZugferd(invoice, full, { language: "DE" });

    expect(result).toEqual(accepted);
    const call = calls[0]!;
    expect(call.url).toBe("https://api.invoicexml.com/v1/create/zugferd/email");
    expect(call.init.method).toBe("POST");
    expect(headers(call).Authorization).toBe("Bearer test-key");
    expect(headers(call)["Content-Type"]).toBe("application/json");
    expect(JSON.parse(call.init.body as string)).toEqual({ invoice, options: { language: "DE" }, email: full });
  });

  it("omits options and unset email fields from the JSON body", async () => {
    const { fetch, calls } = mockFetch(jsonResponse(accepted));
    await client(fetch).emailZugferd(invoice, { ...required, subject: undefined, cc: undefined });
    expect(JSON.parse(calls[0]!.init.body as string)).toEqual({ invoice, email: required });
  });

  it("sends XRechnung through its own route and passes the syntax option", async () => {
    const { fetch, calls } = mockFetch(jsonResponse(accepted));
    const result = await client(fetch).emailXRechnung(invoice, required, { syntax: "cii" });

    expect(result.messageId).toBe("msg-1");
    expect(calls[0]!.url).toBe("https://api.invoicexml.com/v1/create/xrechnung/email");
    expect(JSON.parse(calls[0]!.init.body as string)).toEqual({ invoice, options: { syntax: "cii" }, email: required });
  });

  it("embeds with pdf and xml parts plus email fields, one part per copy address", async () => {
    const { fetch, calls } = mockFetch(jsonResponse(accepted));
    const result = await client(fetch).emailEmbeddedZugferd(PDF, XML, full);

    expect(result).toEqual(accepted);
    expect(calls[0]!.url).toBe("https://api.invoicexml.com/v1/embed/zugferd/email");
    expect(headers(calls[0]!)["Content-Type"]).toBeUndefined();
    const body = form(calls[0]!);
    expect((body.get("pdf") as File).name).toBe("invoice.pdf");
    expect((body.get("xml") as File).type).toBe("application/xml");
    expect(body.get("email.from")).toBe(full.from);
    expect(body.get("email.fromName")).toBe(full.fromName);
    expect(body.get("email.to")).toBe(full.to);
    expect(body.getAll("email.cc")).toEqual(full.cc);
    expect(body.getAll("email.bcc")).toEqual(full.bcc);
    expect(body.get("email.replyTo")).toBe(full.replyTo);
    expect(body.get("email.subject")).toBe(full.subject);
    expect(body.get("email.message")).toBe(full.message);
  });

  it("omits unset email fields from the form and never sends skipValidation", async () => {
    const { fetch, calls } = mockFetch(jsonResponse(accepted));
    await client(fetch).emailEmbeddedZugferd(PDF, XML, required);
    const names: string[] = [];
    form(calls[0]!).forEach((_, name) => names.push(name));
    expect(names).toEqual(["pdf", "xml", "email.from", "email.to"]);
  });

  it("surfaces an unverified sender domain through InvoiceXmlError", async () => {
    const problem = { title: "Sender domain not verified", status: 400, errorCode: 4022, errors: [], warnings: [] };
    const { fetch, calls } = mockFetch(jsonResponse(problem, 400), jsonResponse(problem, 400));
    const fromJson = await client(fetch).emailZugferd(invoice, required).catch((e: unknown) => e);
    const fromForm = await client(fetch).emailEmbeddedZugferd(PDF, XML, required).catch((e: unknown) => e);

    for (const error of [fromJson, fromForm]) {
      expect(error).toBeInstanceOf(InvoiceXmlError);
      expect((error as InvoiceXmlError).status).toBe(400);
      expect((error as InvoiceXmlError).errorCode).toBe(4022);
    }
    expect(calls).toHaveLength(2);
  });

  it("retries a 429, which sent nothing, with the same form", async () => {
    const { fetch, calls } = mockFetch(jsonResponse({}, 429, { "Retry-After": "0" }), jsonResponse(accepted));
    const result = await client(fetch).emailEmbeddedZugferd(PDF, XML, required);

    expect(result).toEqual(accepted);
    expect(calls).toHaveLength(2);
    expect(calls[1]!.init.body).toBe(calls[0]!.init.body);
  });

  it("does not resend after a 5xx, which could send a second email", async () => {
    const { fetch, calls } = mockFetch(new Response("upstream unavailable", { status: 503 }));
    await expect(client(fetch).emailZugferd(invoice, required)).rejects.toMatchObject({ status: 503 });
    expect(calls).toHaveLength(1);
  });

  it("does not resend after a network failure, which could send a second email", async () => {
    const { fetch, calls } = mockFetch();
    await expect(client(fetch).emailEmbeddedZugferd(PDF, XML, required)).rejects.toThrow("Unexpected request");
    expect(calls).toHaveLength(1);
  });

  it("skips null form fields, so subject null is not sent as the text null", async () => {
    const { fetch, calls } = mockFetch(jsonResponse(accepted));
    await client(fetch).emailEmbeddedZugferd(PDF, XML, { ...required, subject: null, cc: null } as unknown as EmailMessage);
    const names: string[] = [];
    form(calls[0]!).forEach((_, name) => names.push(name));
    expect(names).toEqual(["pdf", "xml", "email.from", "email.to"]);
  });

  it.each(["from", "fromName", "to", "replyTo", "subject", "message"])(
    "refuses a list in %s on both route types before sending",
    async (field) => {
      const { fetch, calls } = mockFetch();
      const email = { ...required, [field]: ["one", "two"] } as unknown as EmailMessage;

      await expect(client(fetch).emailZugferd(invoice, email)).rejects.toThrow(TypeError);
      await expect(client(fetch).emailZugferd(invoice, email)).rejects.toThrow(`email.${field}`);
      await expect(client(fetch).emailEmbeddedZugferd(PDF, XML, email)).rejects.toThrow(TypeError);
      expect(calls).toHaveLength(0);
    },
  );

  it("drops blank copy addresses and trims the rest on both route types", async () => {
    const { fetch, calls } = mockFetch(jsonResponse(accepted), jsonResponse(accepted));
    const email = { ...required, cc: [" ", " archiv@spreewerk-solutions.example "], bcc: [""] };

    await client(fetch).emailZugferd(invoice, email);
    await client(fetch).emailEmbeddedZugferd(PDF, XML, email);

    expect(JSON.parse(calls[0]!.init.body as string).email).toEqual({
      ...required,
      cc: ["archiv@spreewerk-solutions.example"],
    });
    expect(form(calls[1]!).getAll("email.cc")).toEqual(["archiv@spreewerk-solutions.example"]);
    expect(form(calls[1]!).has("email.bcc")).toBe(false);
  });

  it("turns a single copy address from a JavaScript caller into a list on both route types", async () => {
    const { fetch, calls } = mockFetch(jsonResponse(accepted), jsonResponse(accepted));
    const email = { ...required, cc: "archiv@spreewerk-solutions.example" } as unknown as EmailMessage;

    await client(fetch).emailZugferd(invoice, email);
    await client(fetch).emailEmbeddedZugferd(PDF, XML, email);

    expect(JSON.parse(calls[0]!.init.body as string).email.cc).toEqual(["archiv@spreewerk-solutions.example"]);
    expect(form(calls[1]!).getAll("email.cc")).toEqual(["archiv@spreewerk-solutions.example"]);
  });

  it("sends a non-ASCII subject and sender name as UTF-8 on the embed route", async () => {
    const { fetch, calls } = mockFetch(jsonResponse(accepted));
    await client(fetch).emailEmbeddedZugferd(PDF, XML, { ...required, fromName: "Müller & Söhne", subject: "Rechnung für März" });

    const body = await new Response(form(calls[0]!)).text();
    expect(body).toContain('name="email.fromName"\r\n\r\nMüller & Söhne\r\n');
    expect(body).toContain('name="email.subject"\r\n\r\nRechnung für März\r\n');
  });
});

describe("form fields", () => {
  it("skips null values and keeps empty text on non-email routes", async () => {
    const { fetch, calls } = mockFetch(new Response(PDF));
    const options = { language: null, logoUrl: "" } as unknown as RenderOptions;
    await client(fetch).renderXRechnungToPdf(XML, options);

    const body = form(calls[0]!);
    expect(body.has("language")).toBe(false);
    expect(body.get("logoUrl")).toBe("");
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

  it("retries a 429 on render, convert and report calls", async () => {
    const limited = () => jsonResponse({}, 429, { "Retry-After": "0" });
    const { fetch, calls } = mockFetch(limited(), new Response(PDF), limited(), new Response(XML), limited(), new Response(PDF));
    const sdk = client(fetch);

    await sdk.renderCiiToPdf(XML);
    await sdk.convertZugferdToUbl(PDF);
    await sdk.validateZugferdReport(PDF);

    expect(calls.map((call) => new URL(call.url).pathname)).toEqual([
      "/v1/render/cii/to/pdf",
      "/v1/render/cii/to/pdf",
      "/v1/convert/zugferd/to/ubl",
      "/v1/convert/zugferd/to/ubl",
      "/v1/validate/zugferd/report",
      "/v1/validate/zugferd/report",
    ]);
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
