# ZUGFeRD and XRechnung for Node.js

[![npm](https://img.shields.io/npm/v/@invoicexml/zugferd-xrechnung)](https://www.npmjs.com/package/@invoicexml/zugferd-xrechnung)
[![tests](https://github.com/InvoiceXML/invoicexml-node-zugferd-xrechnung/actions/workflows/tests.yml/badge.svg)](https://github.com/InvoiceXML/invoicexml-node-zugferd-xrechnung/actions/workflows/tests.yml)
[![license](https://img.shields.io/npm/l/@invoicexml/zugferd-xrechnung)](LICENSE)

Create, validate, embed, render and extract German e-invoices from Node.js and TypeScript: **ZUGFeRD** hybrid PDF/A-3 for B2B and **XRechnung** XML for the public sector, both EN 16931 compliant. A thin, typed client for the [InvoiceXML API](https://invoicexml.com) with zero runtime dependencies.

```bash
npm install @invoicexml/zugferd-xrechnung
```

Requires Node.js 18 or later. Works with ESM and CommonJS, and in any runtime with `fetch` and `FormData` (Vercel, Netlify, Cloudflare Workers, Deno, Bun).

## Quick start

```ts
import { writeFile } from "node:fs/promises";
import { ZugferdXRechnungClient, type InvoiceDocument } from "@invoicexml/zugferd-xrechnung";

const client = new ZugferdXRechnungClient({ apiKey: process.env.INVOICEXML_API_KEY! });

const invoice: InvoiceDocument = {
  invoiceNumber: "RE-2026-1105", issueDate: "2026-07-28", currency: "EUR",
  seller: { name: "Spreewerk Solutions GmbH", vatIdentifier: "DE811234567", postalAddress: { line1: "Köpenicker Str. 154", city: "Berlin", postCode: "10997", country: "DE" } },
  buyer: { name: "Main Handel GmbH", postalAddress: { line1: "Zeil 65", city: "Frankfurt am Main", postCode: "60313", country: "DE" } },
  paymentDetails: { paymentAccountIdentifier: "DE02120300000000202051" },
  lines: [{ quantity: 60, item: { name: "SaaS-Lizenz Team" }, priceDetails: { netPrice: 12.5 }, vatInformation: { rate: 19 } }],
};
await writeFile("rechnung.pdf", await client.createZugferd(invoice));
```

You send net prices, quantities and VAT rates. The API computes the totals and the VAT breakdown, builds the CII XML, embeds it in a PDF/A-3 and validates the result against the official rules before returning it. Get an API key with the [30-day free trial](https://invoicexml.com/account/signup): 100 credits, no credit card.

## Why InvoiceXML

- **Rule sets updated on their legal effective dates.** New EN 16931, ZUGFeRD and KoSIT XRechnung releases go live server-side on the day they take effect. No package update, no redeploy.
- **Validated before delivery.** Every document you create passes the XSD and Schematron rules before it leaves the API. A non-compliant invoice is refused with the violated rules, so it never reaches your customer.
- **Zero data retention.** Invoices are processed in memory and returned in the same response. Nothing is stored and nothing is used for AI training.
- **Processing in Frankfurt.** EU-only processing in Frankfurt, Germany, GDPR compliant by design.
- **Integration assistance.** If a rule finding needs a human explanation, write to [support@invoicexml.com](mailto:support@invoicexml.com) and a person who knows the rule sets answers.

## API

| Method | Endpoint | Returns |
| --- | --- | --- |
| `createZugferd(invoice, options?)` | `POST /v1/create/zugferd` | ZUGFeRD PDF/A-3 as `Uint8Array` |
| `createXRechnung(invoice, options?)` | `POST /v1/create/xrechnung` | XRechnung XML as `string` |
| `validateZugferd(pdf)` | `POST /v1/validate/zugferd` | `ValidationResult` |
| `validateXRechnung(xml)` | `POST /v1/validate/xrechnung` | `ValidationResult` |
| `embedZugferd(pdf, xml, { skipValidation? })` | `POST /v1/embed/zugferd` | ZUGFeRD PDF/A-3 as `Uint8Array` |
| `renderXRechnungToPdf(xml, { language?, logoUrl? })` | `POST /v1/render/xrechnung/to/pdf` | Readable PDF as `Uint8Array` |
| `extractJson(file)` | `POST /v1/extract/json` | `{ invoice }`, ready to pass back to a create method |
| `extractAttachments(file)` | `POST /v1/extract/attachments` | Supporting documents as a ZIP `Uint8Array` |

Files can be a `Buffer`, `Uint8Array`, `ArrayBuffer`, `Blob` or `File`, or the XML as a string. PDF and XML are detected from the content.

The `InvoiceDocument` type is generated from the [OpenAPI schema](https://api.invoicexml.com/v1/openapi), so your editor completes every EN 16931 field. Browse the schema in the [API explorer](https://api.invoicexml.com/v1/scalar/).

### Create options

`createZugferd` accepts `language` (`"EN"`, `"DE"` or `"FR"`), `brandColor` (`"#RRGGBB"`), `logoUrl`, `pdfUrl` (your own PDF as the visual layer) and `includeAdvancedProperties`.

`createXRechnung` accepts `syntax` (`"ubl"`, the default, or `"cii"`) and `language`.

### XRechnung

XRechnung uses the same invoice shape. It also needs the Leitweg-ID in `buyerReference` (rule BR-DE-15), a seller contact and electronic addresses for both parties:

```ts
const xml = await client.createXRechnung({
  invoiceNumber: "RE-2026-1106", issueDate: "2026-07-28", dueDate: "2026-08-27", currency: "EUR",
  buyerReference: "11302-00567-22",
  invoicingPeriod: { startDate: "2026-07-01", endDate: "2026-07-31" },
  seller: {
    name: "Spreewerk Solutions GmbH", vatIdentifier: "DE811234567",
    postalAddress: { line1: "Köpenicker Str. 154", city: "Berlin", postCode: "10997", country: "DE" },
    contact: { name: "Lena Hoffmann", phone: "+49 30 5557890", email: "rechnung@spreewerk-solutions.de" },
    electronicAddress: { identifier: "DE811234567", schemeId: "0204" },
  },
  buyer: {
    name: "Bezirksamt Friedrichshain-Kreuzberg von Berlin",
    postalAddress: { line1: "Frankfurter Allee 35", city: "Berlin", postCode: "10247", country: "DE" },
    electronicAddress: { identifier: "11302-00567-22", schemeId: "0204" },
  },
  paymentDetails: { paymentMeansCode: 58, paymentAccountIdentifier: "DE02120300000000202051" },
  lines: [{ quantity: 95, unitCode: "HUR", item: { name: "Softwareentwicklung Fachverfahren" }, priceDetails: { netPrice: 110 }, vatInformation: { rate: 19, categoryCode: "S" } }],
}, { syntax: "cii" });
```

### Validation

Valid and invalid documents both resolve normally, so check `valid`. Each finding carries the rule, its layer (`xsd`, `en16931` or `cius` for the German BR-DE rules), a plain-language message and the affected fields. `report` lists every invoice field with its value and its findings.

```ts
const result = await client.validateXRechnung(await readFile("rechnung.xml"));
if (!result.valid) {
  for (const f of result.errors) console.log(`[${f.rule}] (${f.layer}) ${f.message}`);
}
```

### Errors and rate limits

Failed requests throw an `InvoiceXmlError` with `status`, `title`, `detail`, a numeric `errorCode` ([error codes](https://invoicexml.com/docs/error-handling)) and a `traceId` to quote when contacting support. When a create or embed request is refused because the invoice would not be compliant, `errors` lists the violated rules:

```ts
import { InvoiceXmlError } from "@invoicexml/zugferd-xrechnung";

try {
  await client.createXRechnung(invoice);
} catch (e) {
  if (e instanceof InvoiceXmlError && e.status === 400) {
    for (const f of e.errors) console.log(`[${f.rule}] ${f.message}`);
  } else throw e;
}
```

On HTTP 429 the client waits for the `Retry-After` delay and retries, up to `maxRetries` times (default 3). After that it throws a `TooManyRequestsError` with `retryAfter` in seconds. A request answered with 429 was not processed and not billed.

### Client options

```ts
new ZugferdXRechnungClient({
  apiKey: process.env.INVOICEXML_API_KEY!, // required
  maxRetries: 3,                          // 429 retries, 0 disables
  timeoutMs: 120_000,                     // per request
  fetch: customFetch,                     // optional fetch implementation
});
```

Keep the API key on the server. Never call the API from browser code, where the key would be visible to anyone.

## Links

- [Documentation](https://invoicexml.com/docs)
- [API explorer](https://api.invoicexml.com/v1/scalar/)
- [ZUGFeRD and XRechnung in Node.js, full guide](https://invoicexml.com/blog/zugferd-xrechnung-nodejs)
- [Pricing](https://invoicexml.com/pricing)

## License

[MIT](LICENSE)
