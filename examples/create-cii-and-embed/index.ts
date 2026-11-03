// Builds a CII XML from your invoice data, then embeds it into a PDF you already have.
// Use this when your own system prints the invoice PDF and you want it to become a
// ZUGFeRD invoice. The CII XML declares the EN 16931 profile, so it embeds as it is.

import { readFile, writeFile } from "node:fs/promises";
import { InvoiceXmlError, ZugferdXRechnungClient, type InvoiceDocument } from "@invoicexml/zugferd-xrechnung";

// Replace these values with your own.
const API_KEY = "YOUR_API_KEY";
const PDF_PATH = "invoices/RE-2026-001.pdf"; // the PDF your system printed
const OUTPUT_PATH = "RE-2026-001-zugferd.pdf";

const client = new ZugferdXRechnungClient({ apiKey: API_KEY });

const invoice: InvoiceDocument = {
  invoiceNumber: "RE-2026-001",
  currency: "EUR",
  seller: {
    name: "Muster GmbH",
    vatIdentifier: "DE123456789",
    postalAddress: { city: "Berlin", postCode: "10115", country: "DE" },
  },
  buyer: {
    name: "Kunde AG",
    postalAddress: { city: "Hamburg", postCode: "20095", country: "DE" },
  },
  lines: [
    {
      quantity: 10,
      unitCode: "HUR", // hour
      item: { name: "Consulting" },
      priceDetails: { netPrice: 95.5 },
      vatInformation: { categoryCode: "S", rate: 19 },
    },
  ],
};

try {
  // Read the PDF first, so a wrong path stops the example before any API call.
  const pdf = await readFile(PDF_PATH);

  // 1. Build the CII XML from the invoice data. language words the default texts, such as the payment terms.
  const cii = await client.createCii(invoice, { language: "DE" });

  // 2. Embed the XML into your PDF. The result is a ZUGFeRD PDF/A-3.
  const zugferd = await client.embedZugferd(pdf, cii);

  await writeFile(OUTPUT_PATH, zugferd);
  console.log(`Saved the ZUGFeRD invoice to ${OUTPUT_PATH}.`);
} catch (error) {
  process.exitCode = 1;
  if ((error as NodeJS.ErrnoException).code === "ENOENT") {
    console.log(`Could not find ${PDF_PATH}.`);
    console.log("Set PDF_PATH at the top of index.ts to a PDF on your machine.");
  } else if (error instanceof InvoiceXmlError && error.errors.length > 0) {
    // The invoice data would not produce a compliant invoice. Each finding names the field to fix.
    console.log("The invoice is not compliant:");
    for (const finding of error.errors) console.log(`  [${finding.rule}] ${finding.message} (${finding.fields.join(", ")})`);
  } else if (error instanceof InvoiceXmlError) {
    console.log(`The API refused the request: ${error.message}`);
  } else {
    throw error;
  }
}
