// Loads the built CommonJS output and runs one create and one upload against a fake fetch.
// Runs on every supported Node version in CI: node test/smoke.cjs
const assert = require("node:assert/strict");
const { ZugferdXRechnungClient, TooManyRequestsError } = require("../dist/index.cjs");

(async () => {
  const fetch = async (url) =>
    url.endsWith("/v1/create/xrechnung")
      ? new Response("<Invoice/>")
      : new Response(JSON.stringify({ valid: false, errors: [{ rule: "BR-DE-15", message: "x" }], warnings: [] }));

  const client = new ZugferdXRechnungClient({ apiKey: "smoke", fetch });
  assert.equal(await client.createXRechnung({ invoiceNumber: "1", currency: "EUR", seller: null, buyer: null, lines: [] }), "<Invoice/>");
  assert.equal((await client.validateZugferd(new Uint8Array([37, 80, 68, 70, 45]))).errors[0].rule, "BR-DE-15");
  assert.equal(typeof TooManyRequestsError, "function");
  console.log(`CJS smoke test passed on Node ${process.version}`);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
