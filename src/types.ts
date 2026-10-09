import type { components } from "./generated/openapi.js";

type Schemas = components["schemas"];

/** EN 16931 invoice, the `invoice` member of every create request. */
export type InvoiceDocument = Schemas["InvoiceDocument"];

type Options = Schemas["InvoiceOptions"];

/** Language of rendered labels and of the default texts the API fills in. */
export type Language = "en" | "de" | "fr";

/** Options for `createZugferd`. All optional. */
export interface ZugferdOptions {
  /** Language of the rendered PDF and of default texts: "en" (default), "de" or "fr". */
  language?: Language & Options["language"];
  /** Accent colour of the rendered PDF, as "#RRGGBB". */
  brandColor?: Options["brandColor"];
  /** Public PNG or JPEG URL of your logo, printed on the rendered PDF. */
  logoUrl?: Options["logoUrl"];
  /** Public URL of your own PDF to use as the visual layer instead of the built-in template. */
  pdfUrl?: Options["pdfUrl"];
  /** Adds an "Electronic invoice details" section listing the technical fields to the rendered PDF. */
  includeAdvancedProperties?: Options["includeAdvancedProperties"];
}

/** Options for `createXRechnung`. All optional. */
export interface XRechnungOptions {
  /** XML syntax: "ubl" (default) or "cii". Both carry the same rules and are legally equivalent. */
  syntax?: ("ubl" | "cii") & Options["syntax"];
  /** Language of the default texts the API fills in when you leave them empty: "en" (default), "de" or "fr". */
  language?: Language & Options["language"];
}

/** Options for `embedZugferd`. */
export interface EmbedOptions {
  /** Only package the XML, without business-rule validation. Defaults to false. */
  skipValidation?: boolean;
}

/** Options for `renderXRechnungToPdf`. */
export interface RenderOptions {
  /** Language of the labels: "en" (default), "de" or "fr". */
  language?: Language;
  /** Public PNG or JPEG URL of a logo printed on the PDF. */
  logoUrl?: string;
}

/** Response of `extractJson`. `invoice` can be passed straight back to the create methods. */
export interface ExtractJsonResult {
  invoice: InvoiceDocument;
}

/** One validation finding, from a validation result or from a rejected create or embed request. */
export interface Finding {
  /** Rule identifier, for example "BR-DE-15" or "BR-CO-15". */
  rule: string | null;
  /** Rule layer: "xsd", "en16931" or "cius" (the national rules, such as BR-DE). */
  layer?: string | null;
  /** Line in the XML document, when known. */
  line?: number | null;
  /** Plain-language explanation. */
  message: string;
  /** EN 16931 business terms involved, for example ["BT-10"]. */
  btCodes?: string[];
  /** JSON paths of the affected invoice fields, for example ["buyerReference"]. */
  fields?: string[];
  /** Verbatim validator output. */
  raw?: string | null;
}

/** A finding attached to a row of the field report. */
export interface ReportFinding {
  rule: string;
  message: string;
}

/** One row of the field report: an EN 16931 business term with its value and findings. */
export interface ReportRow {
  /** Business term, for example "BT-1". */
  code: string;
  name: string;
  /** Group: "header", "seller", "buyer", "lines", "payment", "totals" or "tax". */
  section: string;
  /** JSON path into the invoice, for example "lines[0].priceDetails.netPrice". */
  path: string;
  value: string | null;
  isValid: boolean;
  errors: ReportFinding[];
  warnings: ReportFinding[];
}

/**
 * Result of a validation call. Valid and invalid documents both answer
 * HTTP 200, so check `valid`.
 */
export interface ValidationResult {
  valid: boolean;
  /** One-sentence summary of the verdict. */
  detail?: string | null;
  /** Verdict details, for example schemaValid, schematronValid, conformanceLevel and profile. */
  data?: Record<string, unknown>;
  /** Rule violations. Empty when valid. */
  errors: Finding[];
  /** Advisory findings that do not fail the document. */
  warnings: Finding[];
  /** Field report, one row per business term. Absent when the document could not be read. */
  report?: ReportRow[] | null;
}

/**
 * A file to upload: the raw bytes (Buffer, Uint8Array, ArrayBuffer), a Blob or
 * File, or the document text as a string (for XML). PDF and XML are detected
 * from the content.
 */
export type FileInput = string | Uint8Array | ArrayBuffer | Blob;
