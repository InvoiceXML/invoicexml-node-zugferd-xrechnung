import { Http, type ClientOptions } from "./http.js";
import type {
  EmbedOptions,
  ExtractJsonResult,
  FileInput,
  InvoiceDocument,
  RenderOptions,
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

  /** Validates a ZUGFeRD PDF against the rule set of the profile its embedded XML declares. */
  async validateZugferd(pdf: FileInput): Promise<ValidationResult> {
    return json(await this.http.postFiles("/v1/validate/zugferd", { file: pdf }));
  }

  /** Validates an XRechnung XML (UBL or CII) against EN 16931 and the German BR-DE rules. */
  async validateXRechnung(xml: FileInput): Promise<ValidationResult> {
    return json(await this.http.postFiles("/v1/validate/xrechnung", { file: xml }));
  }

  /**
   * Embeds an existing CII XML into an existing PDF and returns a ZUGFeRD PDF/A-3.
   * The XML is validated before embedding unless `skipValidation` is true.
   */
  async embedZugferd(pdf: FileInput, xml: FileInput, options: EmbedOptions = {}): Promise<Uint8Array> {
    const fields = { skipValidation: options.skipValidation || undefined };
    return bytes(await this.http.postFiles("/v1/embed/zugferd", { pdf, xml }, fields));
  }

  /** Renders an XRechnung XML (UBL or CII) as a human-readable PDF. */
  async renderXRechnungToPdf(xml: FileInput, options: RenderOptions = {}): Promise<Uint8Array> {
    const fields = { language: options.language, logoUrl: options.logoUrl };
    return bytes(await this.http.postFiles("/v1/render/xrechnung/to/pdf", { file: xml }, fields));
  }

  /**
   * Reads a ZUGFeRD PDF or an XRechnung XML into invoice data. Deterministic:
   * the XML is parsed, no AI is involved.
   */
  async extractJson(file: FileInput): Promise<ExtractJsonResult> {
    return json(await this.http.postFiles("/v1/extract/json", { file }));
  }

  /** Extracts the supporting documents attached to an invoice as a ZIP archive. */
  async extractAttachments(file: FileInput): Promise<Uint8Array> {
    return bytes(await this.http.postFiles("/v1/extract/attachments", { file }));
  }
}

async function bytes(response: Response): Promise<Uint8Array> {
  return new Uint8Array(await response.arrayBuffer());
}

async function json<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}
