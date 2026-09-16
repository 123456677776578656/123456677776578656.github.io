import assert from "node:assert/strict";
import test from "node:test";
import { completeWebsite } from "../lib/website.ts";

test("only a complete, bounded HTML document can replace a generated website", () => {
  const html = '<!doctype html><!-- Entwurf --><html lang="de"><head><title>Café</title></head><body>Fertig</body></html>';
  assert.equal(completeWebsite(`\`\`\`html\n${html}\n\`\`\``), html);
  for (const value of ["Hier ist ein Vorschlag: <html></html>", "<!doctype html><html><body>Halbfertig", "<p>Kein Dokument</p>", `<html>${"x".repeat(250000)}</html>`]) assert.throws(() => completeWebsite(value), /bisheriger Stand bleibt erhalten/);
});
