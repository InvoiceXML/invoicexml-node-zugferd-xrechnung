// Validates incoming invoices: a ZUGFeRD PDF and an XRechnung XML.
// A failed validation is a normal result, not an exception: you get the verdict and every
// finding with the rule, the message and the field it concerns. The example also saves the
// printable validation report PDF for the ZUGFeRD invoice.

import { readFile, writeFile } from "node:fs/promises";
import { InvoiceXmlError, ZugferdXRechnungClient, type ValidationResult } from "@invoicexml/zugferd-xrechnung";

// Replace these values with your own.
const API_KEY = "YOUR_API_KEY";
const ZUGFERD_PDF_PATH = "invoices/incoming-zugferd.pdf";
const XRECHNUNG_XML_PATH = "invoices/incoming-xrechnung.xml";
const REPORT_PATH = "incoming-zugferd-report.pdf";

const client = new ZugferdXRechnungClient({ apiKey: API_KEY });

function print(label: string, result: ValidationResult): void {
  console.log(`${label}: ${result.valid ? "valid" : "not valid"}. ${result.detail}`);

  for (const error of result.errors) console.log(`  error   [${error.rule}] ${error.message} (${error.fields.join(", ")})`);

  // Warnings never make an invoice invalid, but are worth reviewing.
  for (const warning of result.warnings) console.log(`  warning [${warning.rule}] ${warning.message} (${warning.fields.join(", ")})`);
}

try {
  // Read both files first, so a wrong path stops the example before any API call.
  const zugferdPdf = await readFile(ZUGFERD_PDF_PATH);
  const xrechnungXml = await readFile(XRECHNUNG_XML_PATH);

  // 1. Validate a ZUGFeRD PDF against the rules of the profile it declares.
  print("ZUGFeRD PDF", await client.validateZugferd(zugferdPdf));

  // 2. Validate an XRechnung XML, UBL or CII, against EN 16931 and the German XRechnung rules.
  print("XRechnung XML", await client.validateXRechnung(xrechnungXml));

  // 3. The same check as a printable PDF report, for example to send back to a supplier.
  const report = await client.validateZugferdReport(zugferdPdf, { validationLanguage: "DE" });
  await writeFile(REPORT_PATH, report.file);
  console.log(`Saved the validation report to ${REPORT_PATH} (valid: ${report.valid}).`);
} catch (error) {
  process.exitCode = 1;
  if ((error as NodeJS.ErrnoException).code === "ENOENT") {
    console.log(`Could not find ${(error as NodeJS.ErrnoException).path}.`);
    console.log("Set ZUGFERD_PDF_PATH and XRECHNUNG_XML_PATH at the top of index.ts to files on your machine.");
  } else if (error instanceof InvoiceXmlError) {
    // For example an invalid API key, or a file that is not an invoice at all.
    console.log(`The API refused the request: ${error.message}`);
  } else {
    throw error;
  }
}
