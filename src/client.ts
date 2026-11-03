import { Http, type ClientOptions } from "./http.js";
import type {
  CiiOptions,
  ConvertOptions,
  ConvertToPdfOptions,
  EmailMessage,
  EmailSendResult,
  EmbedOptions,
  ExtractJsonResult,
  FileInput,
  InvoiceDocument,
  ParsedInvoice,
  RenderOptions,
  TransformOptions,
  UblOptions,
  ValidationReport,
  ValidationReportOptions,
  ValidationResult,
  XRechnungOptions,
  ZugferdOptions,
} from "./types.js";
import { VERSION } from "./version.js";

/**
 * Thin client for the ZUGFeRD and XRechnung endpoints of the InvoiceXML API.
 *
 * Invoices use the EN 16931 shape of the API's InvoiceDocument schema. The API
 * computes totals and the VAT breakdown, builds the XML, and validates every
 * document before delivering it. Use it from server-side code only: the API key
 * must never reach a browser.
 */
export class ZugferdXRechnungClient {
  private readonly http: Http;

  constructor(options: ClientOptions) {
    this.http = new Http(options, `invoicexml-node-zugferd-xrechnung/${VERSION}`);
  }

  /**
   * Creates a ZUGFeRD hybrid invoice: a PDF/A-3 with the EN 16931 CII XML embedded.
   * Throws an `InvoiceXmlError` with the violated rules in `errors` when the
   * invoice would not be compliant.
   */
  async createZugferd(invoice: InvoiceDocument, options?: ZugferdOptions): Promise<Uint8Array> {
    return bytes(await this.http.postJson("/v1/create/zugferd", invoice, options));
  }

  /**
   * Creates an XRechnung 3.0 XML invoice, UBL syntax by default or CII with
   * `{ syntax: "cii" }`. XRechnung requires the Leitweg-ID in `buyerReference`,
   * a seller contact and electronic addresses for both parties.
   */
  async createXRechnung(invoice: InvoiceDocument, options?: XRechnungOptions): Promise<string> {
    return (await this.http.postJson("/v1/create/xrechnung", invoice, options)).text();
  }

  /**
   * Creates a plain UN/CEFACT CII XML invoice with the EN 16931 guideline ID, ready
   * to pass to `embedZugferd` together with your own PDF. Throws an `InvoiceXmlError`
   * with the violated rules in `errors` when the invoice would not be compliant.
   */
  async createCii(invoice: InvoiceDocument, options?: CiiOptions): Promise<string> {
    return (await this.http.postJson("/v1/create/cii", invoice, options)).text();
  }

  /**
   * Creates a UBL XML invoice. `profile` picks the CustomizationID and the rule set
   * the invoice is validated against; "peppol-bis-3" is the default. Throws an
   * `InvoiceXmlError` with the violated rules in `errors` when the invoice would not
   * be compliant.
   */
  async createUbl(invoice: InvoiceDocument, options?: UblOptions): Promise<string> {
    return (await this.http.postJson("/v1/create/ubl", invoice, options)).text();
  }

  /** Validates a ZUGFeRD PDF against the rule set of the profile its embedded XML declares. */
  async validateZugferd(pdf: FileInput): Promise<ValidationResult> {
    return json(await this.http.postFiles("/v1/validate/zugferd", { file: pdf }));
  }

  /** Validates an XRechnung XML (UBL or CII) against EN 16931 and the German BR-DE rules. */
  async validateXRechnung(xml: FileInput): Promise<ValidationResult> {
    return json(await this.http.postFiles("/v1/validate/xrechnung", { file: xml }));
  }

  /**
   * Validates a ZUGFeRD PDF like `validateZugferd` and returns a printable PDF report
   * with the verdict in `valid`. An invalid invoice is a normal result, not an error.
   */
  async validateZugferdReport(pdf: FileInput, options: ValidationReportOptions = {}): Promise<ValidationReport> {
    const fields = { validationLanguage: options.validationLanguage };
    return report(await this.http.postFiles("/v1/validate/zugferd/report", { file: pdf }, fields));
  }

  /**
   * Validates an XRechnung XML like `validateXRechnung` and returns a printable PDF
   * report with the verdict in `valid`. An invalid invoice is a normal result, not an error.
   */
  async validateXRechnungReport(xml: FileInput, options: ValidationReportOptions = {}): Promise<ValidationReport> {
    const fields = { validationLanguage: options.validationLanguage };
    return report(await this.http.postFiles("/v1/validate/xrechnung/report", { file: xml }, fields));
  }

  /**
   * Embeds an existing CII XML into an existing PDF and returns a ZUGFeRD PDF/A-3.
   * The XML is validated before embedding unless `skipValidation` is true.
   */
  async embedZugferd(pdf: FileInput, xml: FileInput, options: EmbedOptions = {}): Promise<Uint8Array> {
    const fields = { skipValidation: options.skipValidation || undefined };
    return bytes(await this.http.postFiles("/v1/embed/zugferd", { pdf, xml }, fields));
  }

  /**
   * Creates a ZUGFeRD invoice like `createZugferd` and sends it as a real email
   * from your own verified domain. Returns the message id, not the file. A
   * non-compliant invoice throws an `InvoiceXmlError` and is not sent.
   */
  async emailZugferd(invoice: InvoiceDocument, email: EmailMessage, options?: ZugferdOptions): Promise<EmailSendResult> {
    return json(await this.http.postJson("/v1/create/zugferd/email", invoice, options, normalizeEmail(email)));
  }

  /**
   * Creates an XRechnung like `createXRechnung` and sends it as a real email from
   * your own verified domain. Returns the message id, not the file. A
   * non-compliant invoice throws an `InvoiceXmlError` and is not sent.
   */
  async emailXRechnung(invoice: InvoiceDocument, email: EmailMessage, options?: XRechnungOptions): Promise<EmailSendResult> {
    return json(await this.http.postJson("/v1/create/xrechnung/email", invoice, options, normalizeEmail(email)));
  }

  /**
   * Embeds an existing CII XML into an existing PDF like `embedZugferd` and sends
   * the ZUGFeRD PDF/A-3 as a real email from your own verified domain. Returns the
   * message id, not the file. The XML is always validated before sending.
   */
  async emailEmbeddedZugferd(pdf: FileInput, xml: FileInput, email: EmailMessage): Promise<EmailSendResult> {
    return json(await this.http.postFiles("/v1/embed/zugferd/email", { pdf, xml }, emailFields(email)));
  }

  /**
   * Renders any invoice XML as a human-readable PDF: XRechnung (UBL or CII), CII (such
   * as the XML of a ZUGFeRD invoice) or UBL. The format is detected from the XML.
   */
  async renderXmlToPdf(xml: FileInput, options: RenderOptions = {}): Promise<Uint8Array> {
    const fields = { language: options.language, logoUrl: options.logoUrl, includeQrCode: options.includeQrCode };
    return bytes(await this.http.postFiles("/v1/render/xml/to/pdf", { file: xml }, fields));
  }

  /** Converts a ZUGFeRD PDF into UBL XML. */
  async convertZugferdToUbl(pdf: FileInput, options: ConvertOptions = {}): Promise<string> {
    return this.convertToXml("/v1/convert/zugferd/to/ubl", pdf, options);
  }

  /** Converts a ZUGFeRD PDF into CII XML. */
  async convertZugferdToCii(pdf: FileInput, options: ConvertOptions = {}): Promise<string> {
    return this.convertToXml("/v1/convert/zugferd/to/cii", pdf, options);
  }

  /** Converts an XRechnung XML (UBL or CII) into plain EN 16931 UBL XML. */
  async convertXRechnungToUbl(xml: FileInput, options: ConvertOptions = {}): Promise<string> {
    return this.convertToXml("/v1/convert/xrechnung/to/ubl", xml, options);
  }

  /** Converts an XRechnung XML (UBL or CII) into plain EN 16931 CII XML. */
  async convertXRechnungToCii(xml: FileInput, options: ConvertOptions = {}): Promise<string> {
    return this.convertToXml("/v1/convert/xrechnung/to/cii", xml, options);
  }

  /** Converts a UBL XML into an XRechnung XML in UBL syntax. */
  async convertUblToXRechnung(xml: FileInput, options: ConvertOptions = {}): Promise<string> {
    return this.convertToXml("/v1/convert/ubl/to/xrechnung", xml, options);
  }

  /** Converts a CII XML into an XRechnung XML in UBL syntax. */
  async convertCiiToXRechnung(xml: FileInput, options: ConvertOptions = {}): Promise<string> {
    return this.convertToXml("/v1/convert/cii/to/xrechnung", xml, options);
  }

  /** Converts a CII XML into a ZUGFeRD PDF/A-3 with a PDF rendered from the invoice. */
  async convertCiiToZugferd(xml: FileInput, options: ConvertToPdfOptions = {}): Promise<Uint8Array> {
    return this.convertToPdf("/v1/convert/cii/to/zugferd", xml, options);
  }

  /** Converts a UBL XML into a ZUGFeRD PDF/A-3 with a PDF rendered from the invoice. */
  async convertUblToZugferd(xml: FileInput, options: ConvertToPdfOptions = {}): Promise<Uint8Array> {
    return this.convertToPdf("/v1/convert/ubl/to/zugferd", xml, options);
  }

  /** Converts an XRechnung XML (UBL or CII) into a ZUGFeRD PDF/A-3 with a PDF rendered from the invoice. */
  async convertXRechnungToZugferd(xml: FileInput, options: ConvertToPdfOptions = {}): Promise<Uint8Array> {
    return this.convertToPdf("/v1/convert/xrechnung/to/zugferd", xml, options);
  }

  /**
   * Reads a PDF invoice and returns a ZUGFeRD PDF/A-3. AI reads the PDF, so a person
   * must check the result before it is used. Throws an `InvoiceXmlError` with the
   * violated rules in `errors` when the data read would not be compliant. A 429 on this
   * method is not retried automatically, so wait for `Retry-After` before calling again
   * if you want to retry.
   */
  async transformToZugferd(pdf: FileInput, options: TransformOptions = {}): Promise<Uint8Array> {
    const fields = {
      language: options.language,
      preserveOriginalPdf: options.preserveOriginalPdf,
      includeAdvancedProperties: options.includeAdvancedProperties,
      validationLanguage: options.validationLanguage,
    };
    return bytes(await this.http.postFiles("/v1/transform/to/zugferd", { file: pdf }, fields, { retryRateLimit: false }));
  }

  /**
   * Reads a PDF invoice and returns an XRechnung XML in UBL syntax. AI reads the PDF,
   * so a person must check the result before it is used. `buyerReference` is the
   * Leitweg-ID and replaces any reference found in the PDF. Throws an `InvoiceXmlError`
   * with the violated rules in `errors` when the data read would not be compliant. A 429
   * on this method is not retried automatically, so wait for `Retry-After` before calling
   * again if you want to retry.
   */
  async transformToXRechnung(
    pdf: FileInput,
    buyerReference: string,
    options: Pick<TransformOptions, "validationLanguage"> = {},
  ): Promise<string> {
    if (!buyerReference?.trim()) throw new TypeError("A buyerReference is required.");
    const fields = { buyerReference, validationLanguage: options.validationLanguage };
    return (await this.http.postFiles("/v1/transform/to/xrechnung", { file: pdf }, fields, { retryRateLimit: false })).text();
  }

  /**
   * Reads a ZUGFeRD PDF or an XRechnung XML into invoice data. Deterministic:
   * the XML is parsed, no AI is involved.
   */
  async extractJson(file: FileInput): Promise<ExtractJsonResult> {
    return json(await this.http.postFiles("/v1/extract/json", { file }));
  }

  /**
   * Reads `pdf`, a PDF invoice (typed, scanned or photographed), into invoice data.
   * AI reads the PDF, so a person must check the data before it is used. XML embedded
   * in the PDF is ignored: use `extractJson` to read it. `confidence` scores the read
   * from 0.0 (had to guess) to 1.0 (unambiguous) and `language` is the ISO 639-1 code
   * of the invoice's language; both can be absent. A 429 on this method is not retried
   * automatically, so wait for `Retry-After` before calling again if you want to retry.
   */
  async parseJson(pdf: FileInput): Promise<ParsedInvoice> {
    return json(await this.http.postFiles("/v1/parse/json", { file: pdf }, {}, { retryRateLimit: false }));
  }

  /** Extracts the supporting documents attached to an invoice as a ZIP archive. */
  async extractAttachments(file: FileInput): Promise<Uint8Array> {
    return bytes(await this.http.postFiles("/v1/extract/attachments", { file }));
  }

  private async convertToXml(path: string, file: FileInput, options: ConvertOptions): Promise<string> {
    const fields = { validationLanguage: options.validationLanguage };
    return (await this.http.postFiles(path, { file }, fields)).text();
  }

  private async convertToPdf(path: string, file: FileInput, options: ConvertToPdfOptions): Promise<Uint8Array> {
    const fields = { language: options.language, validationLanguage: options.validationLanguage };
    return bytes(await this.http.postFiles(path, { file }, fields));
  }
}

const SINGLE_VALUE_EMAIL_FIELDS = ["from", "fromName", "to", "replyTo", "subject", "message"] as const;

/**
 * The same rules for the JSON and the form routes, also for JavaScript callers: a
 * list is refused in a single-value field, because a form route would lose all but
 * its first item. `cc` and `bcc` take one address or a list, without blank entries.
 */
function normalizeEmail(email: EmailMessage): EmailMessage {
  for (const field of SINGLE_VALUE_EMAIL_FIELDS) {
    if (Array.isArray(email[field])) {
      throw new TypeError(`email.${field} takes a single value. Only cc and bcc take a list.`);
    }
  }
  const { cc, bcc, ...normalized } = email;
  return { ...normalized, cc: copyAddresses(cc), bcc: copyAddresses(bcc) };
}

function copyAddresses(addresses: string | string[] | null | undefined): string[] | undefined {
  const kept = [addresses]
    .flat()
    .flatMap((address) => (typeof address === "string" && address.trim() ? [address.trim()] : []));
  return kept.length > 0 ? kept : undefined;
}

function emailFields(email: EmailMessage) {
  const normalized = normalizeEmail(email);
  return {
    "email.from": normalized.from,
    "email.fromName": normalized.fromName,
    "email.to": normalized.to,
    "email.cc": normalized.cc,
    "email.bcc": normalized.bcc,
    "email.replyTo": normalized.replyTo,
    "email.subject": normalized.subject,
    "email.message": normalized.message,
  };
}

async function bytes(response: Response): Promise<Uint8Array> {
  return new Uint8Array(await response.arrayBuffer());
}

async function json<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

async function report(response: Response): Promise<ValidationReport> {
  const verdict = response.headers.get("X-Invoice-Valid");
  return { file: await bytes(response), valid: verdict === "true" ? true : verdict === "false" ? false : null };
}
