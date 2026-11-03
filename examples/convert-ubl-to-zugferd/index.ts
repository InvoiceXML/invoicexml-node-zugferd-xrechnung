// Converts a UBL invoice XML, for example one received over Peppol, into a ZUGFeRD invoice:
// a readable PDF with the invoice data embedded as CII XML.

import { readFile, writeFile } from "node:fs/promises";
import { InvoiceXmlError, ZugferdXRechnungClient } from "@invoicexml/zugferd-xrechnung";

// Replace these values with your own.
const API_KEY = "YOUR_API_KEY";
const UBL_XML_PATH = "invoices/RE-2026-001-ubl.xml";
const OUTPUT_PATH = "RE-2026-001-zugferd.pdf";

const client = new ZugferdXRechnungClient({ apiKey: API_KEY });

try {
  const ubl = await readFile(UBL_XML_PATH);

  // language sets the PDF layout and the default texts added when the UBL has none.
  const zugferd = await client.convertUblToZugferd(ubl, { language: "DE" });

  await writeFile(OUTPUT_PATH, zugferd);
  console.log(`Saved the ZUGFeRD invoice to ${OUTPUT_PATH}.`);
} catch (error) {
  process.exitCode = 1;
  if ((error as NodeJS.ErrnoException).code === "ENOENT") {
    console.log(`Could not find ${UBL_XML_PATH}.`);
    console.log("Set UBL_XML_PATH at the top of index.ts to a UBL invoice XML on your machine.");
  } else if (error instanceof InvoiceXmlError && error.errors.length > 0) {
    // The result would not be a compliant ZUGFeRD invoice. Each finding names the field to fix.
    console.log("The converted invoice would not be compliant:");
    for (const finding of error.errors) console.log(`  [${finding.rule}] ${finding.message} (${finding.fields.join(", ")})`);
  } else if (error instanceof InvoiceXmlError) {
    console.log(`The API refused the request: ${error.message}`);
  } else {
    throw error;
  }
}
