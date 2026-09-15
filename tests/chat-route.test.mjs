import assert from "node:assert/strict";
import test from "node:test";
import { loadRoute, testKey } from "./route-harness.mjs";

function request(body) {
  return new Request("http://localhost/api/chat", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
}

const userMessage = { role: "user", content: "Hallo" };

test("chat uses the replacement model and Gemini 3 parameters with the server key", async () => {
  let sent;
  const route = loadRoute(undefined, async (url, options) => {
    sent = { url, ...options, body: JSON.parse(options.body) };
    return Response.json({ candidates: [{ content: { parts: [{ thought: true, text: "Internal thought" }, { text: "Hallo!" }] } }] });
  });
  const response = await route.POST(request({ messages: [userMessage], memory: "Antworte kurz." }));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { answer: "Hallo!" });
  assert.equal(sent.url, "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent");
  assert.equal(sent.headers["x-goog-api-key"], testKey);
  assert.equal(JSON.stringify(sent.body).includes(testKey), false);
  assert.equal("temperature" in sent.body.generationConfig, false);
  assert.equal("thinkingBudget" in sent.body.generationConfig, false);
  assert.equal(sent.body.generationConfig.thinkingConfig.thinkingLevel, "low");
  assert.match(sent.body.system_instruction.parts[0].text, /Antworte kurz/);
  assert.deepEqual(sent.body.contents, [{ role: "user", parts: [{ text: "Hallo" }] }]);
});

test("follow-up questions keep conversation history and map assistant roles", async () => {
  let contents;
  const route = loadRoute(undefined, async (_url, options) => {
    contents = JSON.parse(options.body).contents;
    return Response.json({ candidates: [{ content: { parts: [{ text: "Acht Pfoten." }] } }] });
  });
  await route.POST(request({ messages: [
    { role: "user", content: "Ich habe zwei Hunde." },
    { role: "assistant", content: "Wie schön." },
    { role: "user", content: "Wie viele Pfoten haben sie?" },
  ] }));
  assert.deepEqual(contents.map((m) => m.role), ["user", "model", "user"]);
  assert.equal(contents[0].parts[0].text, "Ich habe zwei Hunde.");
});

test("model retirement is actionable and credentials stay out of responses and logs", async () => {
  const route = loadRoute(undefined, async () => Response.json({ error: { message: `Model unavailable for ${testKey}`, status: testKey } }, { status: 404 }));
  const response = await route.POST(request({ messages: [userMessage] }));
  const payload = await response.json();
  assert.equal(response.status, 502);
  assert.equal(payload.code, "GEMINI_MODEL_UNAVAILABLE");
  assert.match(payload.error, /gemini-3\.6-flash/);
  assert.equal(JSON.stringify({ payload, logs: route.logs }).includes(testKey), false);
});

test("websites remove fences and never save token-truncated HTML as a success", async () => {
  let finishReason = "STOP";
  const route = loadRoute(undefined, async () => Response.json({ candidates: [{ finishReason, content: { parts: [{ text: "```html\n<!doctype html><html><body>Hallo</body></html>\n```" }] } }] }));
  const first = await route.POST(request({ mode: "website", messages: [userMessage] }));
  assert.equal(first.status, 200);
  assert.equal((await first.json()).answer, "<!doctype html><html><body>Hallo</body></html>");
  finishReason = "MAX_TOKENS";
  const second = await route.POST(request({ mode: "website", messages: [userMessage] }));
  assert.equal(second.status, 502);
  assert.equal("answer" in await second.json(), false);
});

test("configuration exposes only readiness and the selected model", async () => {
  const response = await loadRoute("app/api/config/route.ts").GET();
  assert.deepEqual(await response.json(), { geminiConfigured: true, model: "gemini-3.6-flash" });
  assert.equal(response.headers.get("Cache-Control"), "no-store");
});

test("invalid messages and model-prefill turns fail before reaching Google", async () => {
  const route = loadRoute();
  for (const body of [null, [], { messages: [null] }, { messages: [{ role: "assistant", content: "Incomplete answer" }] }]) {
    assert.equal((await route.POST(request(body))).status, 400);
  }
});
