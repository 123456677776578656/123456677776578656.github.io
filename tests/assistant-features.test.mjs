import assert from "node:assert/strict";
import test from "node:test";
import { loadRoute, testKey } from "./route-harness.mjs";

const request = (body, headers = {}) => new Request("https://ki-chat.example/api/chat", { method: "POST", headers: { "Content-Type": "application/json", origin: "https://ki-chat.example", ...headers }, body: JSON.stringify(body) });
const messages = [{ role: "user", content: "Erkläre die Datei." }];
const file = (mimeType, text, name) => { const bytes = Buffer.from(text); return { id: "file-1", name, mimeType, data: bytes.toString("base64"), size: bytes.length }; };
const textReply = (text = "Antwort") => Response.json({ candidates: [{ finishReason: "STOP", content: { parts: [{ text }] } }] });
const frames = (values) => values.map((value) => `data: ${JSON.stringify(value)}\r\n\r\n`).join("");

test("PDF and CSV attachments reach Gemini inline while server credentials stay out of the body", async () => {
  let sent;
  const route = loadRoute(undefined, async (_url, options) => { sent = JSON.parse(options.body); return textReply(); });
  const attachments = [file("application/pdf", "%PDF-1.4\nfixture", "beleg.pdf"), file("text/csv", "Monat,Umsatz\nJanuar,12", "umsatz.csv")];
  const result = await route.POST(request({ messages: [{ ...messages[0], attachments }], memory: "Meine Marke ist Blau", instructions: "Sprich einfach", tone: "short", analysis: true }));
  assert.equal(result.status, 200);
  assert.deepEqual(sent.contents[0].parts.filter((p) => p.inlineData).map((p) => p.inlineData.mimeType), ["application/pdf", "text/csv"]);
  assert.deepEqual(sent.tools, [{ code_execution: {} }]);
  assert.match(sent.system_instruction.parts[0].text, /Sprich einfach/);
  assert.match(sent.system_instruction.parts[0].text, /Meine Marke ist Blau/);
  assert.equal(JSON.stringify(sent).includes(testKey), false);
});

test("attachments with spoofed MIME types or sizes and foreign origins fail before an API call", async () => {
  let calls = 0;
  const route = loadRoute(undefined, async () => { calls++; return textReply(); });
  const malformed = [file("image/png", "<svg>bad</svg>", "bad.png"), { ...file("text/plain", "abc", "text.txt"), size: 12 }, file("application/x-executable", "hello", "app.exe")];
  for (const attachment of malformed) assert.equal((await route.POST(request({ messages: [{ ...messages[0], attachments: [attachment] }] }))).status, 400);
  assert.equal((await route.POST(request({ messages }, { origin: "https://other.example" }))).status, 403);
  assert.equal((await route.POST(request({ messages, webSearch: true }))).status, 428);
  assert.equal(calls, 0);
});

test("search returns real source links and suggestions, excludes unsafe links and preserves Unicode citations", async () => {
  let tools;
  const route = loadRoute(undefined, async (_url, options) => { tools = JSON.parse(options.body).tools; return Response.json({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: "Größe: zwölf Meter." }] }, groundingMetadata: { webSearchQueries: ["Größe"], searchEntryPoint: { renderedContent: "<a href='https://google.com/search?q=test'>Google</a>" }, groundingChunks: [{ web: { uri: "https://example.org/quelle", title: "Quelle" } }, { web: { uri: "javascript:alert(1)", title: "unsafe" } }], groundingSupports: [{ segment: { text: "Größe: zwölf Meter.", endIndex: 20 }, groundingChunkIndices: [0, 1] }] } }] }); });
  const result = await route.POST(request({ messages, webSearch: true, searchConsent: true }));
  const body = await result.json();
  assert.equal(result.status, 200);
  assert.deepEqual(tools, [{ google_search: {} }]);
  assert.deepEqual(body.sources, [{ url: "https://example.org/quelle", title: "Quelle" }]);
  assert.equal(body.answer, "Größe: zwölf Meter. [1](https://example.org/quelle)");
  assert.match(body.searchHtml, /Google/);
  assert.equal(JSON.stringify(body).includes("javascript:"), false);
});

test("Python output shows the reported failure and omits thought-only code", async () => {
  const route = loadRoute(undefined, async () => Response.json({ candidates: [{ content: { parts: [
    { thought: true, executableCode: { code: "private reasoning" } },
    { executableCode: { language: "PYTHON", code: "print(1/0)" } },
    { codeExecutionResult: { outcome: "OUTCOME_FAILED", output: "ZeroDivisionError" } },
    { text: "Die Berechnung ist fehlgeschlagen." },
  ] } }] }));
  const result = await (await route.POST(request({ messages, analysis: true }))).json();
  assert.deepEqual(result.executions, [{ code: "print(1/0)", output: "ZeroDivisionError", outcome: "OUTCOME_FAILED" }]);
  assert.equal(JSON.stringify(result).includes("private reasoning"), false);
});

test("streaming handles fragmented UTF-8 and SSE boundaries and produces a complete final answer", async () => {
  let sentUrl;
  const source = frames([{ candidates: [{ content: { parts: [{ thought: true, text: "Geheim" }, { text: "Grüße " }] } }] }, { candidates: [{ content: { parts: [{ text: "🌞!" }] }, finishReason: "STOP" }] }]);
  const bytes = new TextEncoder().encode(source);
  const route = loadRoute(undefined, async (url) => { sentUrl = url; return new Response(new ReadableStream({ start(controller) { for (let i = 0; i < bytes.length; i++) controller.enqueue(bytes.slice(i, i + 1)); controller.close(); } }), { headers: { "Content-Type": "text/event-stream" } }); });
  const response = await route.POST(request({ messages, stream: true }));
  assert.match(sentUrl, /streamGenerateContent\?alt=sse$/);
  assert.match(response.headers.get("Content-Type"), /text\/event-stream/);
  const output = await response.text();
  const events = output.trim().split("\n\n").map((line) => JSON.parse(line.slice(6)));
  assert.equal(events.filter((e) => e.type === "delta").map((e) => e.text).join(""), "Grüße 🌞!");
  assert.equal(events.at(-1).type, "done"); assert.equal(events.at(-1).answer, "Grüße 🌞!");
  assert.equal(output.includes("Geheim"), false);
});

test("an interrupted provider stream returns an error rather than claiming completion", async () => {
  const route = loadRoute(undefined, async () => new Response(frames([{ candidates: [{ content: { parts: [{ text: "Halbe Antwort" }] } }] }]), { headers: { "Content-Type": "text/event-stream" } }));
  const output = await (await route.POST(request({ messages, stream: true }))).text();
  assert.match(output, /"type":"error"/);
  assert.equal(output.includes('"type":"done"'), false);
});

test("cancelling the client stream also aborts the upstream provider request", async () => {
  let upstreamSignal;
  const route = loadRoute(undefined, async (_url, options) => { upstreamSignal = options.signal; return new Response(new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode(frames([{ candidates: [{ content: { parts: [{ text: "Anfang" }] } }] }]))); options.signal.addEventListener("abort", () => controller.error(new DOMException("Aborted", "AbortError")), { once: true }); } }), { headers: { "Content-Type": "text/event-stream" } }); });
  const response = await route.POST(request({ messages, stream: true }));
  const reader = response.body.getReader(); await reader.read(); await reader.cancel();
  assert.equal(upstreamSignal.aborted, true);
});

test("website edits include current HTML, custom instructions and memories", async () => {
  let sent;
  const route = loadRoute(undefined, async (_url, options) => { sent = JSON.parse(options.body); return textReply("<!doctype html><html><body>Neu</body></html>"); });
  const result = await route.POST(request({ mode: "website", existingHtml: "<!doctype html><html><body>Mein Café</body></html>", instructions: "Verwende große Schrift", messages }));
  assert.equal(result.status, 200);
  assert.match(sent.contents[0].parts[0].text, /Mein Café/);
  assert.match(sent.system_instruction.parts[0].text, /Verwende große Schrift/);
});
