// Creates a ZUGFeRD invoice that keeps your own PDF layout.
// The API downloads your PDF from a public URL, embeds the XML it generates from the invoice
// data into it, and returns a ZUGFeRD PDF/A-3. Nothing about your PDF's look changes.

import { writeFile } from "node:fs/promises";
import { InvoiceXmlError, ZugferdXRechnungClient, type InvoiceDocument } from "@invoicexml/zugferd-xrechnung";

// Replace these values with your own.
const API_KEY = "YOUR_API_KEY";
const PDF_URL = "https://example.com/invoices/RE-2026-001.pdf"; // public http(s) URL of your PDF
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
  // pdfUrl makes your PDF the visual layer. Without it, the API renders its own invoice layout.
  const zugferd = await client.createZugferd(invoice, { pdfUrl: PDF_URL });

  await writeFile(OUTPUT_PATH, zugferd);
  console.log(`Saved the ZUGFeRD invoice to ${OUTPUT_PATH}.`);
} catch (error) {
  process.exitCode = 1;
  if (error instanceof InvoiceXmlError && error.errors.length > 0) {
    // The invoice data would not produce a compliant ZUGFeRD invoice. Each finding names the field to fix.
    console.log("The invoice is not compliant:");
    for (const finding of error.errors) console.log(`  [${finding.rule}] ${finding.message} (${finding.fields.join(", ")})`);
  } else if (error instanceof InvoiceXmlError) {
    // For example an invalid API key, or a PDF URL the API could not download.
    console.log(`The API refused the request: ${error.message}`);
  } else {
    throw error;
  }
}
