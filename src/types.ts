import type { components } from "./generated/openapi.js";

type Schemas = components["schemas"];
type Options = Schemas["InvoiceOptions"];

/** EN 16931 invoice, the `invoice` member of every create request. */
export type InvoiceDocument = Schemas["InvoiceDocument"];

/** Language of rendered labels and of the default texts the API fills in. Case-insensitive. */
export type Language = Schemas["PdfLanguage"];

/** Options for `createZugferd`. All optional. */
export interface ZugferdOptions {
  /** Language of the rendered PDF and of default texts: "EN" (default), "DE" or "FR". */
  language?: Options["language"];
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
  /** Language of the default texts the API fills in when you leave them empty: "EN" (default), "DE" or "FR". */
  language?: Options["language"];
}

/** Options for `embedZugferd`. */
export interface EmbedOptions {
  /** Only package the XML, without business-rule validation. Defaults to false. */
  skipValidation?: boolean;
}

/** Options for `renderXRechnungToPdf`. */
export interface RenderOptions {
  /** Language of the labels: "EN" (default), "DE" or "FR". */
  language?: Language;
  /** Public PNG or JPEG URL of a logo printed on the PDF. */
  logoUrl?: string;
}

/** Response of `extractJson`. `invoice` can be passed straight back to the create methods. */
export interface ExtractJsonResult {
  invoice: InvoiceDocument;
}

/**
 * Result of a validation call. Valid and invalid documents both answer
 * HTTP 200, so check `valid`.
 */
export type ValidationResult = Schemas["ValidationResponse"];

/** One validation finding, from a validation result or from a rejected create or embed request. */
export type Finding = Schemas["ValidationFinding"];

/** One row of the field report: an EN 16931 business term with its value and findings. */
export type ReportRow = Schemas["InvoiceReportRow"];

/** A finding attached to a row of the field report. */
export type ReportFinding = Schemas["InvoiceReportFinding"];

/** Error body of every non-2xx response (RFC 7807 problem details). */
export type ProblemDetails = Schemas["ApiProblemDetails"];

/**
 * A file to upload: the raw bytes (Buffer, Uint8Array, ArrayBuffer), a Blob or
 * File, or the document text as a string (for XML). PDF and XML are detected
 * from the content.
 */
export type FileInput = string | Uint8Array | ArrayBuffer | Blob;
