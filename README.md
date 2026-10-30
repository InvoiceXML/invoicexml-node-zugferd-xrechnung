# ZUGFeRD and XRechnung for Node.js

[![npm](https://img.shields.io/npm/v/@invoicexml/zugferd-xrechnung)](https://www.npmjs.com/package/@invoicexml/zugferd-xrechnung)
[![tests](https://github.com/InvoiceXML/invoicexml-node-zugferd-xrechnung/actions/workflows/tests.yml/badge.svg)](https://github.com/InvoiceXML/invoicexml-node-zugferd-xrechnung/actions/workflows/tests.yml)
[![license](https://img.shields.io/npm/l/@invoicexml/zugferd-xrechnung)](LICENSE)

Create, validate, embed, render and extract German e-invoices from Node.js and TypeScript: **ZUGFeRD** hybrid PDF/A-3 for B2B and **XRechnung** XML for the public sector, both EN 16931 compliant. A thin, typed client for the [InvoiceXML API](https://www.invoicexml.com) with zero runtime dependencies.

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

You send net prices, quantities and VAT rates. The API computes the totals and the VAT breakdown, builds the CII XML, embeds it in a PDF/A-3 and validates the result against the official rules before returning it. Get an API key with the [30-day free trial](https://www.invoicexml.com/account/signup): 100 credits, no credit card.

## Why InvoiceXML

- **Rule sets updated on their legal effective dates.** New EN 16931, ZUGFeRD and KoSIT XRechnung releases go live server-side on the day they take effect. No package update, no redeploy.
- **Validated before delivery.** Every document you create passes the XSD and Schematron rules before it leaves the API. A non-compliant invoice is refused with the violated rules, so it never reaches your customer.
- **Zero data retention.** Invoices are processed in memory and returned in the same response. Nothing is stored and nothing is used for AI training. When you email an invoice, it goes to our email service for delivery, and we keep no copy.
- **Processing in Frankfurt.** EU-only processing in Frankfurt, Germany, GDPR compliant by design.
- **Integration assistance.** If a rule finding needs a human explanation, write to [support@invoicexml.com](mailto:support@invoicexml.com) and a person who knows the rule sets answers.

## API

| Method | Endpoint | Returns |
| --- | --- | --- |
| `createZugferd(invoice, options?)` | `POST /v1/create/zugferd` | ZUGFeRD PDF/A-3 as `Uint8Array` |
| `createXRechnung(invoice, options?)` | `POST /v1/create/xrechnung` | XRechnung XML as `string` |
| `validateZugferd(pdf)` | `POST /v1/validate/zugferd` | `ValidationResult` |
| `validateXRechnung(xml)` | `POST /v1/validate/xrechnung` | `ValidationResult` |
| `validateZugferdReport(pdf, { validationLanguage? })` | `POST /v1/validate/zugferd/report` | `ValidationReport`: the PDF report in `file`, the verdict in `valid` |
| `validateXRechnungReport(xml, { validationLanguage? })` | `POST /v1/validate/xrechnung/report` | `ValidationReport`: the PDF report in `file`, the verdict in `valid` |
| `embedZugferd(pdf, xml, { skipValidation? })` | `POST /v1/embed/zugferd` | ZUGFeRD PDF/A-3 as `Uint8Array` |
| `emailZugferd(invoice, email, options?)` | `POST /v1/create/zugferd/email` | `EmailSendResult` |
| `emailXRechnung(invoice, email, options?)` | `POST /v1/create/xrechnung/email` | `EmailSendResult` |
| `emailEmbeddedZugferd(pdf, xml, email)` | `POST /v1/embed/zugferd/email` | `EmailSendResult` |
| `renderXRechnungToPdf(xml, { language?, logoUrl?, includeQrCode? })` | `POST /v1/render/xrechnung/to/pdf` | Readable PDF as `Uint8Array` |
| `renderCiiToPdf(xml, { language?, logoUrl?, includeQrCode? })` | `POST /v1/render/cii/to/pdf` | Readable PDF as `Uint8Array` |
| `convertZugferdToUbl(pdf, { validationLanguage? })` | `POST /v1/convert/zugferd/to/ubl` | UBL XML as `string` |
| `convertZugferdToCii(pdf, { validationLanguage? })` | `POST /v1/convert/zugferd/to/cii` | CII XML as `string` |
| `convertXRechnungToUbl(xml, { validationLanguage? })` | `POST /v1/convert/xrechnung/to/ubl` | UBL XML as `string` |
| `convertXRechnungToCii(xml, { validationLanguage? })` | `POST /v1/convert/xrechnung/to/cii` | CII XML as `string` |
| `convertUblToXRechnung(xml, { validationLanguage? })` | `POST /v1/convert/ubl/to/xrechnung` | XRechnung XML as `string` |
| `convertCiiToXRechnung(xml, { validationLanguage? })` | `POST /v1/convert/cii/to/xrechnung` | XRechnung XML as `string` |
| `convertCiiToZugferd(xml, { language?, validationLanguage? })` | `POST /v1/convert/cii/to/zugferd` | ZUGFeRD PDF/A-3 as `Uint8Array` |
| `convertUblToZugferd(xml, { language?, validationLanguage? })` | `POST /v1/convert/ubl/to/zugferd` | ZUGFeRD PDF/A-3 as `Uint8Array` |
| `convertXRechnungToZugferd(xml, { language?, validationLanguage? })` | `POST /v1/convert/xrechnung/to/zugferd` | ZUGFeRD PDF/A-3 as `Uint8Array` |
| `transformToZugferd(pdf, options?)` | `POST /v1/transform/to/zugferd` | ZUGFeRD PDF/A-3 as `Uint8Array`, to be checked by a person |
| `transformToXRechnung(pdf, buyerReference, { validationLanguage? })` | `POST /v1/transform/to/xrechnung` | XRechnung XML as `string`, to be checked by a person |
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
  paymentDetails: { paymentMeansCode: "58", paymentAccountIdentifier: "DE02120300000000202051" },
  lines: [{ quantity: 95, unitCode: "HUR", item: { name: "Softwareentwicklung Fachverfahren" }, priceDetails: { netPrice: 110 }, vatInformation: { rate: 19, categoryCode: "S" } }],
}, { syntax: "cii" });
```

### Send an invoice by email

Create or embed an invoice and email it to your customer in one call. It is built and validated exactly as on the plain method, and only an invoice that passes is sent, as a real email from your own address. The sender must be on a domain added and verified on the Verified email domains page of your dashboard. See the [email guide](https://www.invoicexml.com/docs/api/create/zugferd/email).

```ts
const { messageId } = await client.emailZugferd(invoice, {
  from: "rechnung@spreewerk-solutions.de",
  fromName: "Spreewerk Solutions",
  to: "buchhaltung@main-handel.de",
  cc: ["archiv@spreewerk-solutions.de"],
  subject: "Rechnung RE-2026-1105",
  message: "Guten Tag,\n\nanbei unsere Rechnung.",
});
```

`emailXRechnung` takes the same `email` object and sends the XRechnung XML. `emailEmbeddedZugferd(pdf, xml, email)` packages your own PDF and CII XML first; it always validates, so it has no `skipValidation`.

Only `from` and `to` are required. Left out, the subject is the document type and its number, and the message is a short English text. `cc` and `bcc` hold at most 2 addresses together.

No file comes back: you get `{ status: "accepted", messageId }`. `accepted` means the email was handed over for delivery, not that the recipient's server has received it yet. Keep the `messageId` to ask about a delivery later. No copy of the invoice or of your subject and message is kept.

Refused requests throw an `InvoiceXmlError` and send nothing. `errorCode` 4020 means your plan does not include email delivery ([pricing](https://www.invoicexml.com/pricing)), 4021 that email sending is disabled or paused for your account, and 4022 that the sender's domain is not verified yet. These three are not billed. Error 4002 lists a bad address, a sender domain that is not on your account or too many copies in `errors`.

The client retries a 429 only, which sent nothing. A timeout or a network failure is never retried, because the email may already be on its way, so check before you send it again.

### Validation

Valid and invalid documents both resolve normally, so check `valid`. Each finding carries the rule, its layer (`xsd`, `en16931` or `cius` for the German BR-DE rules), a plain-language message and the affected fields. `report` lists every invoice field with its value and its findings.

```ts
const result = await client.validateXRechnung(await readFile("rechnung.xml"));
if (!result.valid) {
  for (const f of result.errors) console.log(`[${f.rule}] (${f.layer}) ${f.message}`);
}
```

### Validation report

`validateZugferdReport` and `validateXRechnungReport` run the same validation and return a printable PDF report. The verdict is in `valid`, which is `null` if the response carries none. An invalid invoice resolves normally, while a missing or malformed file throws an `InvoiceXmlError`. `validationLanguage` (`"EN"`, `"DE"` or `"FR"`) sets the language of the whole report. See the [ZUGFeRD report](https://www.invoicexml.com/docs/api/validate/zugferd/report) and [XRechnung report](https://www.invoicexml.com/docs/api/validate/xrechnung/report) reference.

```ts
const { file, valid } = await client.validateXRechnungReport(await readFile("rechnung.xml"), { validationLanguage: "DE" });
await writeFile("pruefbericht.pdf", file);
if (valid === false) console.log("The invoice is not compliant, see the report.");
```

### Render

`renderXRechnungToPdf` and `renderCiiToPdf` turn an invoice XML into a readable PDF. Both accept `language` (`"EN"`, `"DE"` or `"FR"`), `logoUrl` and `includeQrCode`, which prints the payment QR code (GiroCode). See the [XRechnung](https://www.invoicexml.com/docs/api/render/xrechnung/to/pdf) and [CII](https://www.invoicexml.com/docs/api/render/cii/to/pdf) reference.

```ts
const pdf = await client.renderXRechnungToPdf(await readFile("rechnung.xml"), { language: "DE", includeQrCode: true });
```

### Convert

Each convert method covers one route between two formats. No AI is involved, and the result is validated before it is returned: a failed conversion throws an `InvoiceXmlError` with the violated rules in `errors`, worded in `validationLanguage` (`"EN"`, `"DE"` or `"FR"`), which every convert method accepts.

- From ZUGFeRD: `convertZugferdToUbl` and `convertZugferdToCii` read the XML embedded in the PDF.
- From XRechnung: `convertXRechnungToUbl` and `convertXRechnungToCii` return plain EN 16931 XML.
- To XRechnung: `convertUblToXRechnung` and `convertCiiToXRechnung` return XRechnung in UBL syntax.
- To ZUGFeRD: `convertCiiToZugferd`, `convertUblToZugferd` and `convertXRechnungToZugferd` return a PDF/A-3 with a PDF rendered from the invoice. They also accept `language` for that PDF.

```ts
const pdf = await client.convertXRechnungToZugferd(await readFile("rechnung.xml"), { language: "DE" });
```

Every route has a reference page, for example [ZUGFeRD to UBL](https://www.invoicexml.com/docs/api/convert/zugferd/to/ubl) and [XRechnung to ZUGFeRD](https://www.invoicexml.com/docs/api/convert/xrechnung/to/zugferd).

### Transform

`transformToZugferd(pdf, options?)` and `transformToXRechnung(pdf, buyerReference, { validationLanguage? })` build an invoice from a plain PDF. AI reads the PDF, so a person must check the result before it is used.

`transformToZugferd` accepts `language` (`"EN"`, `"DE"`, `"FR"` or `"auto"`, the default), `preserveOriginalPdf`, `includeAdvancedProperties` (on by default, so the data read can be checked on the pages) and `validationLanguage`. `transformToXRechnung` needs the Leitweg-ID in `buyerReference`. A 429 on these methods is not retried automatically, so wait for `Retry-After` before calling again if you want to retry. See the [ZUGFeRD](https://www.invoicexml.com/docs/api/transform/to/zugferd) and [XRechnung](https://www.invoicexml.com/docs/api/transform/to/xrechnung) reference.

### Errors and rate limits

Failed requests throw an `InvoiceXmlError` with `status`, `title`, `detail`, a numeric `errorCode` ([error codes](https://www.invoicexml.com/docs/error-handling)) and a `traceId` to quote when contacting support. When a create or embed request is refused because the invoice would not be compliant, `errors` lists the violated rules:

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

On HTTP 429 every call except transform waits for the `Retry-After` delay and retries, up to `maxRetries` times (default 3). After that it throws a `TooManyRequestsError` with `retryAfter` in seconds. A 429 is not billed.

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

- [Documentation](https://www.invoicexml.com/docs)
- [API explorer](https://api.invoicexml.com/v1/scalar/)
- [ZUGFeRD and XRechnung in Node.js, full guide](https://www.invoicexml.com/blog/zugferd-xrechnung-nodejs)
- [Pricing](https://www.invoicexml.com/pricing)

## License

[MIT](LICENSE)
