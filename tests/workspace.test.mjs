import assert from "node:assert/strict";
import test from "node:test";
import { IDBFactory } from "fake-indexeddb";
import { loadRoute } from "./route-harness.mjs";

function setup(legacy = {}) {
  const indexedDB = new IDBFactory();
  const localStorage = { getItem: (key) => legacy[key] ?? null };
  const storage = loadRoute("lib/workspace-storage.ts", undefined, {}, { indexedDB, localStorage });
  const model = loadRoute("lib/workspace.ts");
  return { storage, model, indexedDB, legacy };
}

test("existing chats, projects and memories migrate without deleting the old storage", async () => {
  const oldMessage = { id: "m1", role: "user", content: "Mein bisheriger Chat" };
  const legacy = { "ki-chat-messages": JSON.stringify([oldMessage]), "ki-chat-projects": JSON.stringify([{ id: "p1", name: "Café", html: "<html>Café</html>", prompt: "Café", updatedAt: 100 }]), "ki-chat-memory": JSON.stringify(["Meine Farbe ist Blau"]) };
  const { storage } = setup(legacy);
  const first = await storage.loadWorkspace();
  assert.equal(first.chats[0].messages[0].content, oldMessage.content);
  assert.equal(first.projects[0].name, "Café");
  assert.equal(first.memories[0], "Meine Farbe ist Blau");
  assert.equal(legacy["ki-chat-messages"], JSON.stringify([oldMessage]));
  const second = await storage.loadWorkspace();
  assert.equal(second.chats.length, 1);
  assert.equal(second.chats[0].id, first.chats[0].id);
});

test("attachments, project history and settings survive saving and reopening", async () => {
  const { storage, model } = setup();
  const data = { ...model.EMPTY_WORKSPACE, settings: { ...model.DEFAULT_SETTINGS, name: "Alex", theme: "dark" }, chats: [{ id: "c1", title: "Datei", updatedAt: 123, messages: [{ id: "m1", role: "user", content: "Analysiere die Datei", attachments: [{ id: "f1", name: "test.csv", mimeType: "text/csv", data: Buffer.from("a,b").toString("base64"), size: 3 }] }] }], projects: [{ id: "p1", name: "Seite", prompt: "Neu", html: "<html>Neu</html>", updatedAt: 124, versions: [{ html: "<html>Alt</html>", prompt: "Alt", createdAt: 122 }] }] };
  await storage.saveWorkspace(data);
  const restored = await storage.loadWorkspace();
  assert.equal(restored.settings.name, "Alex"); assert.equal(restored.settings.theme, "dark");
  assert.equal(restored.chats[0].messages[0].attachments[0].data, Buffer.from("a,b").toString("base64"));
  assert.equal(restored.projects[0].versions[0].html, "<html>Alt</html>");
});

test("backup import validates content, drops secrets and merges as copies without overwriting current data", () => {
  const { model } = setup();
  const current = { ...model.EMPTY_WORKSPACE, settings: { ...model.DEFAULT_SETTINGS, name: "Original" }, chats: [{ id: "c1", title: "Mein Chat", updatedAt: 1, messages: [{ id: "m1", role: "user", content: "Wichtig" }] }] };
  const incoming = model.parseWorkspace({ ...current, apiKey: "do-not-import", settings: { ...current.settings, apiKey: "do-not-import", name: "Import" } });
  assert.equal(JSON.stringify(incoming).includes("do-not-import"), false);
  const merged = model.mergeWorkspace(current, incoming);
  assert.equal(merged.chats.length, 2); assert.notEqual(merged.chats[0].id, "c1"); assert.equal(merged.chats[1].id, "c1");
  assert.equal(merged.settings.name, "Original");
  assert.throws(() => model.parseWorkspace({ version: 99, chats: [], projects: [], memories: [] }));
  assert.throws(() => model.parseWorkspace({ ...current, chats: [current.chats[0], current.chats[0]] }));
});

test("stored assistant links and artifacts are validated before rendering", () => {
  const { model } = setup();
  const result = model.parseWorkspace({ ...model.EMPTY_WORKSPACE, chats: [{ id: "c1", title: "Import", updatedAt: 1, messages: [{ id: "m1", role: "assistant", content: "Antwort", sources: [{ title: "Bad", url: "javascript:alert(1)" }, { title: "Good", url: "https://example.com" }], artifacts: [{ mimeType: "image/svg+xml", data: "PHN2Zz4=" }] }] }] });
  assert.equal(result.chats[0].messages[0].sources.length, 1);
  assert.equal(result.chats[0].messages[0].sources[0].url, "https://example.com/");
  assert.equal(result.chats[0].messages[0].artifacts.length, 0);
});
