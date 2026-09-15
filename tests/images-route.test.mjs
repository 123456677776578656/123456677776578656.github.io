import assert from "node:assert/strict";
import test from "node:test";
import { loadRoute, testKey } from "./route-harness.mjs";

const routePath = "app/api/images/route.ts";
const png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=";
const valid = { prompt: "Ein Haus am See", aspectRatio: "16:9", style: "photo", billingAcknowledged: true };
const request = (body = valid, headers = {}) => new Request("https://ki-chat.example/api/images", {
  method: "POST", headers: { "Content-Type": "application/json", origin: "https://ki-chat.example", ...headers }, body: JSON.stringify(body),
});
const picture = (overrides = {}) => ({ inlineData: { mimeType: "image/png", data: png }, ...overrides });
const generated = (parts = [picture()]) => Response.json({ candidates: [{ finishReason: "STOP", content: { parts } }] });

test("image generation requires explicit cost acknowledgement before contacting Google", async () => {
  let calls = 0;
  const route = loadRoute(routePath, async () => { calls++; return generated(); });
  for (const billingAcknowledged of [undefined, false, "true", 1]) {
    const response = await route.POST(request({ ...valid, billingAcknowledged }));
    assert.equal(response.status, 428);
    assert.equal((await response.json()).code, "BILLING_ACKNOWLEDGEMENT_REQUIRED");
  }
  assert.equal(calls, 0);
});

test("image endpoint uses the server key, supported generation settings, and returns only the final image bytes", async () => {
  let sent;
  const route = loadRoute(routePath, async (url, options) => {
    sent = { url, ...options, body: JSON.parse(options.body) };
    return generated([picture({ thought: true, inlineData: { mimeType: "image/png", data: "aW50ZXJuYWw=" } }), picture()]);
  });
  const response = await route.POST(request({ ...valid, apiKey: "untrusted-browser-key", memory: "Meine Farbe ist Blau." }));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Content-Type"), "image/png");
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.equal(response.headers.get("X-Content-Type-Options"), "nosniff");
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), Buffer.from(png, "base64"));
  assert.equal(sent.url, "https://generativelanguage.googleapis.com/v1/models/gemini-3.1-flash-lite-image:generateContent");
  assert.equal(sent.headers["x-goog-api-key"], testKey);
  assert.equal(sent.body.contents[0].role, "user");
  assert.match(sent.body.contents[0].parts[0].text, /Meine Farbe ist Blau/);
  assert.deepEqual(sent.body.generationConfig.responseModalities, ["IMAGE"]);
  assert.deepEqual(sent.body.generationConfig.responseFormat, { image: { aspectRatio: "16:9", imageSize: "1K" } });
  assert.equal(sent.body.generationConfig.thinkingConfig.thinkingLevel, "minimal");
  assert.equal(JSON.stringify(sent.body).includes(testKey), false);
  assert.equal(JSON.stringify(sent.body).includes("untrusted-browser-key"), false);
});

test("image editing forwards a validated original image and still requires cost consent", async () => {
  const reference = { id: "original", name: "foto.png", mimeType: "image/png", data: png, size: Buffer.from(png, "base64").length };
  let calls = 0; let sent;
  const route = loadRoute(routePath, async (_url, options) => { calls++; sent = JSON.parse(options.body); return generated(); });
  assert.equal((await route.POST(request({ ...valid, reference, billingAcknowledged: false }))).status, 428);
  assert.equal(calls, 0);
  const response = await route.POST(request({ ...valid, prompt: "Mache den Hintergrund blau", reference }));
  assert.equal(response.status, 200);
  assert.deepEqual(sent.contents[0].parts[0].inlineData, { mimeType: "image/png", data: png });
  assert.match(sent.contents[0].parts[1].text, /Bearbeite das bereitgestellte Bild/);
  assert.match(sent.contents[0].parts[1].text, /Hintergrund blau/);
  assert.equal(calls, 1);
  for (const invalid of [{ ...reference, mimeType: "image/jpeg" }, { ...reference, size: 1 }, { ...reference, data: "cGxhaW4=", size: 5 }, { ...reference, mimeType: "application/pdf" }]) {
    const bad = await route.POST(request({ ...valid, reference: invalid }));
    assert.equal(bad.status, 400); assert.equal((await bad.json()).code, "INVALID_REFERENCE");
  }
  assert.equal(calls, 1);
});

test("image endpoint rejects missing server keys, foreign origins and malformed or oversized inputs", async () => {
  let calls = 0;
  const upstream = async () => { calls++; return generated(); };
  assert.equal((await loadRoute(routePath, upstream, {}).POST(request())).status, 503);
  const route = loadRoute(routePath, upstream);
  assert.equal((await route.POST(request(valid, { origin: "https://other.example" }))).status, 403);
  assert.equal((await route.POST(request(valid, { "Content-Type": "text/plain" }))).status, 415);
  for (const body of [null, [], { ...valid, prompt: " " }, { ...valid, prompt: "x".repeat(4001) }, { ...valid, aspectRatio: "4:2" }, { ...valid, style: "invalid" }]) {
    assert.equal((await route.POST(request(body))).status, 400);
  }
  assert.equal((await route.POST(request({ ...valid, unused: "x".repeat(49000) }))).status, 413);
  const malformed = new Request("https://ki-chat.example/api/images", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{" });
  assert.equal((await route.POST(malformed)).status, 400);
  assert.equal(calls, 0);
});

test("legitimate browser requests work behind the Next.js proxy while foreign origins stay blocked", async () => {
  const route = loadRoute(routePath, async () => generated());
  const proxied = (origin) => new Request("http://0.0.0.0:3000/api/images", {
    method: "POST", headers: { host: "ki-chat.example", "x-forwarded-proto": "https", origin, "Content-Type": "application/json" }, body: JSON.stringify(valid),
  });
  assert.equal((await route.POST(proxied("https://ki-chat.example"))).status, 200);
  assert.equal((await route.POST(proxied("https://other.example"))).status, 403);
});

test("billing, quota and model errors are actionable without exposing provider credentials", async () => {
  for (const [status, message, expected, code] of [
    [400, "This model requires a paid tier", 402, "BILLING_REQUIRED"],
    [403, "API key invalid", 403, "IMAGE_ACCESS_DENIED"],
    [429, "Quota exceeded", 429, "IMAGE_QUOTA_EXCEEDED"],
    [404, "Model unavailable", 502, "IMAGE_MODEL_UNAVAILABLE"],
    [500, "Upstream failed", 502, "IMAGE_PROVIDER_ERROR"],
  ]) {
    const route = loadRoute(routePath, async () => Response.json({ error: { message: `${message} ${testKey}` } }, { status }));
    const response = await route.POST(request());
    const payload = await response.json();
    assert.equal(response.status, expected);
    assert.equal(payload.code, code);
    assert.equal(JSON.stringify({ payload, logs: route.logs }).includes(testKey), false);
  }
});

test("text-only, unsafe, incomplete, or non-image outputs never become saved pictures", async () => {
  const cases = [
    [{ candidates: [{ content: { parts: [{ text: "I could not generate this" }] } }] }, 502, "NO_IMAGE_RETURNED"],
    [{ promptFeedback: { blockReason: "SAFETY" } }, 422, "IMAGE_BLOCKED"],
    [{ candidates: [{ finishReason: "IMAGE_SAFETY", content: { parts: [picture()] } }] }, 422, "IMAGE_BLOCKED"],
    [{ candidates: [{ finishReason: "MAX_TOKENS", content: { parts: [picture()] } }] }, 502, "IMAGE_INCOMPLETE"],
    [{ candidates: [{ content: { parts: [picture({ inlineData: { mimeType: "image/svg+xml", data: png } })] } }] }, 502, "NO_IMAGE_RETURNED"],
    [{ candidates: [{ content: { parts: [picture({ inlineData: { mimeType: "image/png", data: Buffer.from("<script>bad</script>").toString("base64") } })] } }] }, 502, "INVALID_IMAGE"],
  ];
  for (const [body, status, code] of cases) {
    const response = await loadRoute(routePath, async () => Response.json(body)).POST(request());
    assert.equal(response.status, status);
    assert.equal((await response.json()).code, code);
  }
});

test("a provider timeout is reported without retrying the paid request", async () => {
  let calls = 0;
  const route = loadRoute(routePath, async () => { calls++; throw new DOMException("timeout", "TimeoutError"); });
  const response = await route.POST(request());
  assert.equal(response.status, 504);
  assert.equal((await response.json()).code, "IMAGE_TIMEOUT");
  assert.equal(calls, 1);
});
