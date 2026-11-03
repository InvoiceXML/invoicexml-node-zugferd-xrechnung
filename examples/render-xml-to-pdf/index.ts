// Turns any invoice XML into a readable PDF, for approval workflows and archives.
// XRechnung, CII (such as the XML inside a ZUGFeRD invoice) and UBL are all accepted;
// the format is detected from the XML.

import { readFile, writeFile } from "node:fs/promises";
import { InvoiceXmlError, ZugferdXRechnungClient } from "@invoicexml/zugferd-xrechnung";

// Replace these values with your own.
const API_KEY = "YOUR_API_KEY";
const XML_PATH = "invoices/RE-2026-001.xml";
const OUTPUT_PATH = "RE-2026-001-preview.pdf";

const client = new ZugferdXRechnungClient({ apiKey: API_KEY });

try {
  const xml = await readFile(XML_PATH);

  const pdf = await client.renderXmlToPdf(xml, {
    language: "DE",                                 // labels and date formats of the PDF
    includeQrCode: true,                            // optional: a payment QR code for banking apps
    // logoUrl: "https://example.com/logo.png",     // optional: public URL of your logo, printed top left
  });

  await writeFile(OUTPUT_PATH, pdf);
  console.log(`Saved the PDF to ${OUTPUT_PATH}.`);
} catch (error) {
  process.exitCode = 1;
  if ((error as NodeJS.ErrnoException).code === "ENOENT") {
    console.log(`Could not find ${XML_PATH}.`);
    console.log("Set XML_PATH at the top of index.ts to an invoice XML on your machine.");
  } else if (error instanceof InvoiceXmlError) {
    // For example an invalid API key, or a file that is not an invoice XML.
    console.log(`The API refused the request: ${error.message}`);
  } else {
    throw error;
  }
}
