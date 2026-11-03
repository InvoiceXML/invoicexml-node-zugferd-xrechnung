// Emails a PDF you already have as a ZUGFeRD invoice, sent from your own address.
// The CII XML is built from your invoice data, then embedded into your PDF and emailed in
// one call. Use this when your own system prints the invoice PDF.
//
// Before running it:
// - Add and verify your sending domain on the Verified email domains page of your dashboard.
//   Until it is verified, the API refuses the call and nothing is sent.
// - The client already retries when the API answers 429, because nothing was sent then.
//   A timeout or a lost connection may still mean the email went out, so check before
//   sending the same invoice again.

import { readFile } from "node:fs/promises";
import {
  InvoiceXmlError,
  ZugferdXRechnungClient,
  type EmailMessage,
  type InvoiceDocument,
} from "@invoicexml/zugferd-xrechnung";

// Replace these values with your own.
const API_KEY = "YOUR_API_KEY";
const PDF_PATH = "invoices/RE-2026-001.pdf"; // the PDF your system printed
const FROM = "invoices@yourcompany.example"; // must be on your verified domain
const TO = "accounting@customer.example";

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

const email: EmailMessage = {
  from: FROM,
  fromName: "Muster GmbH Billing",
  to: TO,
  subject: "Rechnung RE-2026-001",
  message: "Anbei erhalten Sie Ihre Rechnung.",
};

try {
  // Read the PDF first, so a wrong path stops the example before any API call.
  const pdf = await readFile(PDF_PATH);

  // 1. Build the CII XML from the invoice data. language words the default texts, such as the payment terms.
  const cii = await client.createCii(invoice, { language: "DE" });

  // 2. Embed the XML into your PDF and email the ZUGFeRD invoice. Both are validated before anything is sent.
  const sent = await client.emailEmbeddedZugferd(pdf, cii, email);

  // "accepted" means the email was handed over for delivery.
  console.log(`${sent.status}: message id ${sent.messageId}`);
} catch (error) {
  process.exitCode = 1;
  if ((error as NodeJS.ErrnoException).code === "ENOENT") {
    console.log(`Could not find ${PDF_PATH}.`);
    console.log("Set PDF_PATH at the top of index.ts to a PDF on your machine.");
  } else if (error instanceof InvoiceXmlError && error.errorCode === 4022) {
    // 4022: the sender's domain is not verified.
    console.log(`The domain of ${FROM} is not verified yet. Verify it in your dashboard, then run this again.`);
  } else if (error instanceof InvoiceXmlError && error.errors.length > 0) {
    // The invoice or an email field is invalid. Nothing was sent.
    console.log("Nothing was sent. Fix these fields first:");
    for (const finding of error.errors) console.log(`  [${finding.rule}] ${finding.message} (${finding.fields.join(", ")})`);
  } else if (error instanceof InvoiceXmlError) {
    console.log(`The API refused the request: ${error.message}`);
  } else {
    throw error;
  }
}
