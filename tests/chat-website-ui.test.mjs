import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { JSDOM } from "jsdom";
import { IDBFactory } from "fake-indexeddb";

test("chat websites support preview, follow-up edits, reload, studio handoff and safe branching", { timeout: 30000 }, async () => {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "https://ki-chat.test" });
  const indexedDB = new IDBFactory();
  for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document, navigator: dom.window.navigator, HTMLElement: dom.window.HTMLElement, Element: dom.window.Element, Node: dom.window.Node, MutationObserver: dom.window.MutationObserver, localStorage: dom.window.localStorage, getComputedStyle: dom.window.getComputedStyle, indexedDB, IS_REACT_ACT_ENVIRONMENT: true })) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  dom.window.indexedDB = indexedDB;
  dom.window.matchMedia = (query) => ({ matches: query.includes("pointer: fine"), media: query, addEventListener() {}, removeEventListener() {} });
  dom.window.HTMLElement.prototype.scrollIntoView = () => {};
  const blobs = new Map(); const downloads = [];
  URL.createObjectURL = (blob) => { const url = `blob:test-${blobs.size}`; blobs.set(url, blob); return url; };
  URL.revokeObjectURL = () => {};
  dom.window.HTMLAnchorElement.prototype.click = function () { downloads.push({ name: this.download, url: this.href }); };
  const html = (color) => `<!doctype html><html lang="de"><head><title>Mein Café</title><style>body{background:${color}}</style></head><body><h1>Café ${color}</h1><button onclick="this.textContent='Hallo'">Klick mich</button></body></html>`;
  let answer = html("white"); let pending = false;
  const requests = [];
  globalThis.fetch = async (url, options) => {
    if (url === "/api/config") return Response.json({ geminiConfigured: true });
    assert.equal(url, "/api/chat");
    const body = JSON.parse(options.body); requests.push(body);
    if (body.mode !== "website") return Response.json({ answer: "Eine normale Chat-Antwort." });
    if (pending) return new Promise((resolve, reject) => options.signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true }));
    return Response.json({ answer });
  };
  const { render, screen, within, waitFor, fireEvent, cleanup } = await import("@testing-library/react");
  const user = (await import("@testing-library/user-event")).default.setup({ document: dom.window.document });
  const Home = (await import("../app/page.tsx")).default;
  const { loadWorkspace } = await import("../lib/workspace-storage.ts");
  const send = async (text) => { fireEvent.change(screen.getByRole("textbox", { name: "Deine Nachricht" }), { target: { value: text } }); await user.click(screen.getByRole("button", { name: "Nachricht senden" })); };
  const saved = async (check) => waitFor(async () => check(await loadWorkspace()), { timeout: 4000 });
  try {
    render(React.createElement(Home));
    await user.click(await screen.findByRole("button", { name: "Webseite", exact: true }));
    await send("Erstelle eine Webseite für mein Café");
    const preview = await screen.findByTitle("Vorschau: Mein Café");
    assert.equal(requests[0].mode, "website"); assert.equal(requests[0].stream, false);
    assert.equal(requests[0].webSearch, false); assert.equal(requests[0].analysis, false);
    assert.equal(preview.getAttribute("sandbox"), "allow-scripts");
    assert.match(preview.getAttribute("srcdoc"), /connect-src 'none'/);
    assert.match(preview.getAttribute("srcdoc"), /Café white/);
    const card = screen.getByRole("region", { name: "Webseite: Mein Café" });
    await user.click(within(card).getByRole("button", { name: "Handy-Vorschau" }));
    assert.equal(preview.parentElement.classList.contains("is-mobile"), true);
    await user.click(within(card).getByRole("button", { name: "Code", exact: true }));
    assert.match(screen.getByLabelText("HTML der Webseite").textContent, /onclick/);
    await user.click(within(card).getByRole("button", { name: "HTML laden", exact: true }));
    assert.equal(downloads.at(-1).name, "meine-webseite.html");
    assert.equal(await blobs.get(downloads.at(-1).url).text(), html("white"));
    let projectId;
    await saved((data) => { assert.equal(data.projects.length, 1); projectId = data.projects[0].id; assert.equal(data.chats[0].websiteProjectId, projectId); assert.equal(data.chats[0].messages[1].website.html, html("white")); });

    answer = html("blue"); await send("Mach den Hintergrund blau");
    await saved((data) => { assert.equal(data.projects.length, 1); assert.equal(data.projects[0].id, projectId); assert.equal(data.projects[0].html, html("blue")); assert.equal(data.projects[0].versions[0].html, html("white")); });
    assert.equal(requests.at(-1).existingHtml, html("white"));
    cleanup(); render(React.createElement(Home));
    const restored = await screen.findByTitle("Vorschau: Mein Café");
    assert.match(restored.getAttribute("srcdoc"), /Café blue/);
    assert.equal(screen.getByRole("button", { name: "Webseite", exact: true }).getAttribute("aria-pressed"), "true");
    answer = html("green"); await send("Jetzt bitte grün");
    await saved((data) => assert.equal(data.projects[0].html, html("green")));
    assert.equal(requests.at(-1).existingHtml, html("blue"));

    // A malformed response and a stopped request never replace a complete project.
    answer = "<!doctype html><html><body>Abgeschnitten"; await send("Eine Änderung mit unvollständiger Antwort");
    await screen.findByRole("alert");
    await saved((data) => { assert.equal(data.projects[0].html, html("green")); assert.equal(data.chats[0].messages.filter((m) => m.website).length, 3); });
    pending = true; await send("Eine Änderung zum Stoppen");
    await user.click(await screen.findByRole("button", { name: "Antwort stoppen" }));
    await screen.findByText("Erstellung gestoppt. Dein bisheriger Projektstand bleibt erhalten.");
    await saved((data) => assert.equal(data.projects[0].html, html("green"))); pending = false;

    await user.click(screen.getByRole("button", { name: "Webseitenmodus beenden" }));
    await send("Eine gewöhnliche Frage");
    await screen.findByText("Eine normale Chat-Antwort.");
    assert.equal(requests.at(-1).mode, "chat");

    // Edits made in the existing studio become the basis of the next chat request.
    const latest = screen.getAllByRole("region", { name: "Webseite: Mein Café" }).at(-1);
    await user.click(within(latest).getByRole("button", { name: "Im Studio öffnen" }));
    await user.click(screen.getByRole("button", { name: "Code bearbeiten", exact: true }));
    fireEvent.change(screen.getByRole("textbox", { name: "HTML-Code bearbeiten" }), { target: { value: html("orange") } });
    await user.click(screen.getByRole("button", { name: "Im Chat bearbeiten" }));
    answer = html("purple"); await send("Ändere nur die Farbe");
    await saved((data) => assert.equal(data.projects[0].html, html("purple")));
    assert.equal(requests.at(-1).existingHtml, html("orange"));

    // Regeneration uses the original input, including a manual studio edit.
    answer = html("teal"); await user.click(screen.getByRole("button", { name: "Erneut antworten" }));
    await saved((data) => { assert.equal(data.projects.length, 2); assert.equal(data.projects.find((p) => p.id === projectId).html, html("purple")); });
    assert.equal(requests.at(-1).existingHtml, html("orange"));

    // Editing an earlier request forks the website as well as the conversation.
    const question = within(screen.getByRole("region", { name: "Chat", exact: true })).getByText("Erstelle eine Webseite für mein Café", { exact: true }).closest("article");
    await user.click(within(question).getByRole("button", { name: "Bearbeiten", exact: true }));
    answer = html("pink"); await send("Erstelle stattdessen eine andere Webseite");
    await saved((data) => { assert.equal(data.projects.length, 3); assert.equal(data.projects.find((p) => p.id === projectId).html, html("purple")); const branch = data.chats.find((c) => !c.title.includes("vor Änderung")); assert.notEqual(branch.websiteProjectId, projectId); assert.equal(data.projects.find((p) => p.id === branch.websiteProjectId).html, html("pink")); const original = data.chats.find((c) => c.title.includes("vor Änderung")); assert.equal(original.websiteProjectId, projectId); });
    assert.equal(requests.at(-1).existingHtml, "");
  } finally { cleanup(); dom.window.close(); }
});
