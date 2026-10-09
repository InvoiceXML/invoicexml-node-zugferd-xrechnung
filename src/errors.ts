import type { Finding } from "./types.js";

/**
 * Thrown when the API answers with an error status. When a create or embed
 * request is refused because the invoice would not be compliant (HTTP 400),
 * `errors` lists the violated rules.
 * Error codes: https://invoicexml.com/docs/error-handling
 */
export class InvoiceXmlError extends Error {
  readonly status: number;
  readonly title: string | null;
  readonly detail: string | null;
  /** Stable numeric error code. */
  readonly errorCode: number | null;
  readonly errors: Finding[];
  readonly warnings: Finding[];
  /** The decoded response body. */
  readonly body: unknown;

  constructor(status: number, body: unknown) {
    const problem = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
    const title = typeof problem.title === "string" ? problem.title : null;
    const detail =
      typeof problem.detail === "string" ? problem.detail : typeof body === "string" && body ? body : null;
    let message = `InvoiceXML API error ${status}`;
    if (title) message += `: ${title}`;
    if (detail && detail !== title) message += ` (${detail})`;
    super(message);
    this.name = "InvoiceXmlError";
    this.status = status;
    this.title = title;
    this.detail = detail;
    this.errorCode = typeof problem.errorCode === "number" ? problem.errorCode : null;
    this.errors = Array.isArray(problem.errors) ? (problem.errors as Finding[]) : [];
    this.warnings = Array.isArray(problem.warnings) ? (problem.warnings as Finding[]) : [];
    this.body = body;
  }
}

/**
 * Thrown on HTTP 429 once the automatic retries are used up. A request answered
 * with 429 was not processed and not billed, so it is safe to resend.
 */
export class TooManyRequestsError extends InvoiceXmlError {
  /** Seconds to wait before retrying, from the Retry-After header. */
  readonly retryAfter: number;

  constructor(body: unknown, retryAfter: number) {
    super(429, body);
    this.name = "TooManyRequestsError";
    this.retryAfter = retryAfter;
  }
}
