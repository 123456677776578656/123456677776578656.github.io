"use client";
/* eslint-disable @next/next/no-img-element -- User image attachments are local data URLs. */
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { ArrowUp, Brain, Check, Code2, Copy, Download, FileText, Globe, Paperclip, Pencil, RotateCcw, Sparkles, Square, Terminal, User, X } from "lucide-react";
import { chatMarkdown, FILE_ACCEPT, makeId, MAX_CONTEXT_FILE_BYTES, type Attachment, type Chat, type ChatMessage, type Project, type Settings, type WebsiteArtifact } from "../lib/workspace";
import { downloadText, readAttachment } from "../lib/files";
import { readEvents } from "../lib/stream-events";
import { completeWebsite, updateWebsite, websiteName } from "../lib/website";
import MarkdownMessage from "./markdown-message";
import ChatWebsite from "./chat-website";
import { SpeakButton, VoiceInput } from "./voice-controls";

type Props = { chat: Chat; projects: Project[]; configured: boolean; apiKey: string; settings: Settings; memories: string[]; onChange: (chat: Chat, project?: Project) => void; onSnapshot: (chat: Chat) => boolean; onOpenProject: (id: string) => void; onNeedKey: () => void; onRemember: (text: string) => void; onBusy: (busy: boolean) => void };
declare global { interface Document { modelContext?: { registerTool: (tool: Record<string, unknown>, options?: { signal: AbortSignal }) => void | Promise<void> }; } }
export default function ChatStudio({ chat, projects, configured, apiKey, settings, memories, onChange, onSnapshot, onOpenProject, onNeedKey, onRemember, onBusy }: Props) {
  const [prompt, setPrompt] = useState(""); const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [loading, setLoading] = useState(false); const [reading, setReading] = useState(false);
  const [error, setError] = useState(""); const [notice, setNotice] = useState(""); const [copied, setCopied] = useState("");
  const [webSearch, setWebSearch] = useState(false); const [analysis, setAnalysis] = useState(false); const [searchConsent, setSearchConsent] = useState(false);
  const [editing, setEditing] = useState<number | null>(null);
  const textarea = useRef<HTMLTextAreaElement>(null); const fileInput = useRef<HTMLInputElement>(null); const end = useRef<HTMLDivElement>(null);
  const controller = useRef<AbortController | null>(null); const chatRef = useRef(chat); const alive = useRef(true);
  const websiteMode = chat.websiteMode === true;
  const activeWebsite = projects.find((project) => project.id === chat.websiteProjectId);
  const latestWebsite = chat.messages.findLast((message) => message.website)?.website;
  useEffect(() => { chatRef.current = chat; }, [chat]);
  useEffect(() => { alive.current = true; return () => { alive.current = false; controller.current?.abort(); }; }, []);
  useEffect(() => { end.current?.scrollIntoView({ block: "end", behavior: "instant" }); }, [chat.messages.length, loading]);
  useEffect(() => { if (textarea.current) { textarea.current.style.height = "0px"; textarea.current.style.height = `${Math.min(textarea.current.scrollHeight, 170)}px`; } }, [prompt]);
  const commit = useCallback((messages: ChatMessage[], patch: Partial<Chat> = {}, project?: Project) => {
    const previous = chatRef.current;
    const firstQuestion = messages.find((m) => m.role === "user")?.content;
    const updated = { ...previous, ...patch, messages, title: previous.title === "Neuer Chat" && firstQuestion ? firstQuestion.slice(0, 65) : previous.title, updatedAt: Date.now() };
    chatRef.current = updated; onChange(updated, project);
  }, [onChange]);

  const run = useCallback(async (history: ChatMessage[], message: ChatMessage, revision = false) => {
    if (controller.current) return;
    if (history.length > 498) { setError("Dieser Chat ist sehr lang. Starte einen neuen Chat; der bisherige Verlauf bleibt gespeichert."); return; }
    if (!configured && !apiKey) { onNeedKey(); return; }
    const building = message.websiteRequest === true;
    if (!building && webSearch && !searchConsent) { setError("Bestätige bitte zuerst den Kostenhinweis zur Websuche."); return; }
    const source = projects.find((project) => project.id === chatRef.current.websiteProjectId);
    const previousWebsite = history.findLast((item) => item.website)?.website;
    const existingHtml = building ? revision ? message.websiteBase ?? previousWebsite?.html ?? "" : source?.html ?? previousWebsite?.html ?? "" : "";
    const target = building && !revision ? source : undefined;
    if (building && !target && projects.length >= 100) { setError("Deine 100 Projektplätze sind belegt. Sichere und entferne zuerst ein älteres Projekt."); return; }
    if (existingHtml.length > 250000) { setError("Diese Webseite ist zu groß für eine KI-Änderung. Kürze den Code zuerst im Studio."); return; }
    const context = [...history, message].filter((item) => item.content.trim()).slice(-12);
    if (context.flatMap((m) => m.attachments || []).reduce((sum, file) => sum + file.size, 0) > MAX_CONTEXT_FILE_BYTES) { setError("Die Anhänge dieses Gesprächs sind zusammen größer als 3 MB. Starte dafür bitte einen neuen Chat."); return; }
    if (revision && !onSnapshot(chatRef.current)) return;
    const abort = new AbortController(); controller.current = abort;
    const responseId = makeId(); const base = [...history, { ...message, ...(building ? { websiteBase: existingHtml } : {}) }]; let text = "";
    setLoading(true); onBusy(true); setError(""); setNotice(""); setPrompt(""); setAttachments([]); setEditing(null);
    const pending = (): ChatMessage => ({ id: responseId, role: "assistant", content: text });
    commit([...base, pending()], { websiteMode: building });
    try {
      const response = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, signal: AbortSignal.any([abort.signal, AbortSignal.timeout(58000)]), body: JSON.stringify({ apiKey, mode: building ? "website" : "chat", existingHtml, stream: !building, webSearch: !building && webSearch, analysis: !building && analysis, searchConsent, instructions: `${settings.name ? `Nenne mich ${settings.name}.\n` : ""}${settings.instructions}`, tone: settings.tone, memory: settings.memoryEnabled ? memories.join("\n") : "", messages: context.map((m) => ({ role: m.role, content: m.content.slice(0, m.role === "user" ? 12000 : 32000), ...(m.attachments?.length ? { attachments: m.attachments } : {}) })) }) });
      if (!response.ok) { const data = await response.json().catch(() => ({})) as { error?: string }; throw new Error(data.error || "Die Anfrage ist fehlgeschlagen."); }
      if (building) {
        const result = await response.json() as { answer?: string };
        if (typeof result.answer !== "string") throw new Error("Die KI hat keine Webseite geliefert. Bitte versuche es erneut.");
        const html = completeWebsite(result.answer);
        abort.signal.throwIfAborted(); if (!alive.current) return;
        const original: Project = target || { id: makeId(), name: revision && previousWebsite ? `${previousWebsite.name.slice(0, 65)} (Variante)` : websiteName(html, message.content), html: existingHtml, prompt: history.findLast((item) => item.role === "user")?.content || "", updatedAt: Date.now(), versions: [] };
        const project = updateWebsite(original, html, message.content);
        text = existingHtml ? "Deine Änderung ist fertig. Schau dir die neue Version an oder beschreibe, was wir als Nächstes ändern sollen." : "Deine Webseite ist bereit. Du kannst sie hier ausprobieren und mir weitere Änderungen beschreiben.";
        commit([...base, { ...pending(), website: { projectId: project.id, name: project.name, html } }], { websiteMode: true, websiteProjectId: project.id }, project);
      } else if (response.headers.get("content-type")?.includes("text/event-stream") && response.body) {
        let done = false;
        for await (const event of readEvents(response.body)) {
          if (!alive.current) return;
          if (event.type === "delta" && typeof event.text === "string") { text += event.text; commit([...base, pending()]); }
          if (event.type === "error") throw new Error(typeof event.error === "string" ? event.error : "Die Antwort wurde unterbrochen.");
          if (event.type === "done" && typeof event.answer === "string") { const result = event as unknown as Partial<ChatMessage> & { answer: string }; text = result.answer; commit([...base, { ...pending(), sources: result.sources, executions: result.executions, artifacts: result.artifacts, searchHtml: result.searchHtml, warning: result.warning }]); done = true; }
        }
        if (!done) throw new Error("Die Verbindung wurde unterbrochen. Du kannst die Antwort erneut anfordern.");
      } else { const result = await response.json() as { answer?: string }; if (!result.answer) throw new Error("Die KI hat keine Antwort geliefert."); text = result.answer; commit([...base, pending()]); }
      return text;
    } catch (cause) {
      const stopped = abort.signal.aborted;
      const message = stopped ? building ? "Erstellung gestoppt. Dein bisheriger Projektstand bleibt erhalten." : "Antwort gestoppt." : cause instanceof DOMException && cause.name === "TimeoutError" ? "Die Antwort dauert zu lange. Bitte versuche es erneut; dein bisheriger Stand bleibt erhalten." : cause instanceof Error ? cause.message : "Unbekannter Fehler.";
      commit(text ? [...base, { ...pending(), warning: `${message} Diese Antwort ist möglicherweise unvollständig.` }] : base);
      if (alive.current) { if (stopped) setNotice(message); else setError(message); }
    } finally { if (controller.current === abort) controller.current = null; onBusy(false); if (alive.current) { setLoading(false); textarea.current?.focus(); } }
  }, [apiKey, configured, onNeedKey, onBusy, onSnapshot, projects, webSearch, analysis, searchConsent, settings, memories, commit]);

  useEffect(() => {
    if (!document.modelContext?.registerTool) return;
    const abort = new AbortController();
    void Promise.resolve(document.modelContext.registerTool({ name: "ask_ai", title: "KI fragen", description: "Sendet eine Frage im aktuellen Chat. Berücksichtigt die sichtbar aktivierten Werkzeuge und gespeicherten Hinweise, einschließlich Webseitenmodus.", inputSchema: { type: "object", properties: { prompt: { type: "string", minLength: 1, maxLength: 12000 } }, required: ["prompt"], additionalProperties: false }, annotations: { readOnlyHint: false }, async execute(value: unknown) { const input = value as { prompt?: string }; if (typeof input.prompt !== "string" || !input.prompt.trim()) throw new Error("Eine Frage ist erforderlich."); return { answer: await run(chatRef.current.messages, { id: makeId(), role: "user", content: input.prompt.trim(), websiteRequest: chatRef.current.websiteMode === true }) }; } }, { signal: abort.signal })).catch(() => undefined);
    return () => abort.abort();
  }, [run]);

  function submit(event: FormEvent) {
    event.preventDefault(); if (reading || (!prompt.trim() && !attachments.length)) return;
    void run(editing === null ? chatRef.current.messages : chatRef.current.messages.slice(0, editing), { id: makeId(), role: "user", content: prompt.trim() || (websiteMode ? "Erstelle eine Webseite auf Grundlage der angehängten Dateien." : "Bitte analysiere die angehängten Dateien."), websiteRequest: websiteMode, ...(editing !== null ? { websiteBase: chatRef.current.messages[editing].websiteBase } : {}), ...(attachments.length ? { attachments } : {}) }, editing !== null);
  }
  function regenerate() {
    const current = chatRef.current; const index = current.messages.findLastIndex((m) => m.role === "user");
    if (index < 0) return;
    void run(current.messages.slice(0, index), current.messages[index], current.messages.slice(index + 1).some((m) => !!m.content));
  }
  function toggleWebsite(value: boolean) { commit(chatRef.current.messages, { websiteMode: value }); setError(""); textarea.current?.focus(); }
  function continueWebsite(website: WebsiteArtifact) {
    const project = projects.find((item) => item.id === website.projectId);
    if (!project && projects.length >= 100) { setError("Bitte sichere und entferne zuerst ein älteres Projekt."); return; }
    const restored = project || { id: makeId(), name: website.name, html: website.html, prompt: "Aus dem Chat wiederhergestellt", updatedAt: Date.now(), versions: [] };
    commit(chatRef.current.messages, { websiteMode: true, websiteProjectId: restored.id }, restored);
    setEditing(null); setNotice("Beschreibe unten deine nächste Änderung. Wir bearbeiten den aktuellen Projektstand."); textarea.current?.focus();
  }
  async function attach(files: FileList | null) {
    if (!files?.length) return;
    if (attachments.length + files.length > 3) { setError("Du kannst bis zu drei Dateien auf einmal anhängen."); return; }
    setReading(true); setError("");
    try { const added = await Promise.all(Array.from(files).map(readAttachment)); const total = [...attachments, ...added]; if (total.reduce((sum, file) => sum + file.size, 0) > MAX_CONTEXT_FILE_BYTES) throw new Error("Bitte hänge insgesamt höchstens 3 MB an."); setAttachments(total); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Die Datei konnte nicht gelesen werden."); }
    finally { setReading(false); if (fileInput.current) fileInput.current.value = ""; }
  }
  async function copy(message: ChatMessage) { try { await navigator.clipboard.writeText(message.content); setCopied(message.id); window.setTimeout(() => setCopied(""), 1800); } catch { setNotice("Kopieren ist hier nicht erlaubt. Du kannst die Antwort als Datei herunterladen."); } }
  return <section className="chat-workspace" aria-label="Chat">
    <div className="conversation">
      {!chat.messages.length ? <div className="welcome enhanced-welcome"><span className="welcome-mark">{websiteMode ? <Code2 size={30}/> : <Sparkles size={30}/>}</span><span className="welcome-kicker">{websiteMode ? "DEINE IDEE WIRD ZUR WEBSEITE" : "DEIN PERSÖNLICHER ARBEITSPLATZ"}</span><h2>{websiteMode ? "Beschreiben. Anschauen." : settings.name ? `Hallo, ${settings.name}.` : "Eine Idee reicht."}<br/>{websiteMode ? "Gemeinsam weiterbauen." : "Was machen wir heute?"}</h2><p>{websiteMode ? "Sag mir, für wen deine Seite ist und wie sie aussehen soll. Du bekommst eine Vorschau direkt hier im Chat." : "Fragen klären, Dateien verstehen, Texte schreiben oder eine eigene Webseite erstellen."}</p><div className="starter-grid">{(websiteMode ? ["Erstelle eine moderne Webseite für mein Café mit Speisekarte und Öffnungszeiten", "Baue eine Portfolio-Webseite für meine Fotos", "Erstelle eine Landingpage für mein neues Projekt"] : ["Erstelle eine Webseite für mein Café", "Erkläre mir ein schwieriges Thema einfach", "Schreibe eine freundliche, professionelle E-Mail"]).map((item, i) => <button key={item} onClick={() => { if (websiteMode || i === 0) toggleWebsite(true); setPrompt(item); textarea.current?.focus(); }}><span>{i === 0 ? <Code2 size={16}/> : `0${i + 1}`}</span>{item}</button>)}</div><span className="welcome-storage">Chats und Webseiten werden auf diesem Gerät gespeichert.</span></div> : <div className="message-list">
      {chat.messages.map((message, index) => <article className={`message-row ${message.role} ${message.website ? "has-website" : ""}`} key={message.id}><span className="avatar">{message.role === "user" ? <User size={16}/> : message.website ? <Code2 size={16}/> : <Sparkles size={16}/>}</span><div className="message-content"><span className="message-name">{message.role === "user" ? settings.name || "Du" : "KI-Chat"}{message.websiteRequest && <span className="website-request-label"><Code2 size={12}/>Webseite</span>}</span>
        {message.attachments?.length ? <div className="message-attachments">{message.attachments.map((file) => <a key={file.id} href={`data:${file.mimeType};base64,${file.data}`} download={file.name} title="Anhang herunterladen">{file.mimeType.startsWith("image/") ? <img src={`data:${file.mimeType};base64,${file.data}`} alt={file.name}/> : <FileText size={20}/>}<span>{file.name}</span></a>)}</div> : null}
        {message.role === "assistant" ? message.content ? <div className="message-bubble"><MarkdownMessage message={message}/></div> : loading ? <div className="website-thinking"><div className="thinking" aria-label={websiteMode ? "Webseite wird erstellt" : "Antwort wird erstellt"}><i/><i/><i/></div>{websiteMode && <span>Deine Webseite entsteht …</span>}</div> : null : <div className="message-bubble">{message.content}</div>}
        {message.website && <ChatWebsite website={message.website} expanded={message.website === latestWebsite} busy={loading} canOpen={projects.some((project) => project.id === message.website!.projectId)} onOpen={() => onOpenProject(message.website!.projectId)} onContinue={() => continueWebsite(message.website!)}/>}
        {message.content && !loading && <div className="message-actions"><button onClick={() => void copy(message)}>{copied === message.id ? <Check size={14}/> : <Copy size={14}/>} {copied === message.id ? "Kopiert" : "Kopieren"}</button>{message.role === "user" ? <button onClick={() => { setEditing(index); setPrompt(message.content); setAttachments(message.attachments || []); toggleWebsite(message.websiteRequest === true); textarea.current?.focus(); }}><Pencil size={14}/>Bearbeiten</button> : <><SpeakButton text={message.content} onNotice={setNotice}/><button onClick={() => downloadText("antwort.md", message.content, "text/markdown;charset=utf-8")}><Download size={14}/>Speichern</button></>}<button onClick={() => onRemember(message.content)}><Brain size={14}/>Merken</button></div>}
      </div></article>)}
      {!loading && chat.messages.length > 0 && <div className="conversation-actions"><button onClick={regenerate}><RotateCcw size={14}/>Erneut antworten</button><button onClick={() => downloadText("chat.md", chatMarkdown(chat), "text/markdown;charset=utf-8")}><Download size={14}/>Chat exportieren</button></div>}
      <div ref={end}/></div>}
    </div>
    <footer className="composer-wrap">
      {error && <div className="error-banner" role="alert"><span>{error}</span><button onClick={() => setError("")} aria-label="Fehler schließen"><X size={16}/></button></div>}
      {notice && <div className="chat-notice" role="status"><span>{notice}</span><button onClick={() => setNotice("")} aria-label="Hinweis schließen"><X size={14}/></button></div>}
      <form className="advanced-composer" onSubmit={submit}>
        {websiteMode && <div className="website-context"><Code2 size={18}/><span><strong>{activeWebsite?.name || "Neue Webseite im Chat"}</strong><small>{editing !== null ? "Deine Änderung wird als eigene Projektvariante erstellt." : activeWebsite ? "Beschreibe deine Änderung. Der bisherige Stand bleibt als Version erhalten." : "Beschreibe deine Idee. Vorschau und Projekt entstehen direkt hier."}</small></span><button type="button" onClick={() => toggleWebsite(false)} disabled={loading} aria-label="Webseitenmodus beenden"><X size={16}/></button></div>}
        {editing !== null && <div className="editing-notice">Nachricht bearbeiten · Der bisherige Verlauf bleibt als Kopie erhalten.<button type="button" onClick={() => { setEditing(null); setPrompt(""); setAttachments([]); }} aria-label="Bearbeitung abbrechen"><X size={14}/></button></div>}
        {!!attachments.length && <div className="attachment-drafts">{attachments.map((file) => <span key={file.id}><FileText size={14}/>{file.name}<button type="button" onClick={() => setAttachments((items) => items.filter((item) => item.id !== file.id))} aria-label={`${file.name} entfernen`}><X size={13}/></button></span>)}</div>}
        <textarea ref={textarea} value={prompt} onChange={(event) => setPrompt(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing && window.matchMedia("(pointer: fine)").matches) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} placeholder={websiteMode ? activeWebsite ? "Was möchtest du an deiner Webseite ändern?" : "Beschreibe deine Webseite …" : "Frag etwas oder beschreibe deine Idee …"} aria-label="Deine Nachricht" maxLength={12000} rows={1} disabled={loading}/>
        <div className="composer-bottom"><div className="composer-tools"><input ref={fileInput} type="file" accept={FILE_ACCEPT} multiple hidden onChange={(event) => void attach(event.target.files)}/><button type="button" className="composer-tool" onClick={() => fileInput.current?.click()} disabled={!configured || loading || reading} title="PDF, Bilder, CSV und Textdateien anhängen" aria-label="Dateien anhängen"><Paperclip size={18}/></button><VoiceInput disabled={loading} onText={(text) => setPrompt((current) => `${current}${current ? " " : ""}${text}`.slice(0, 12000))} onNotice={setNotice}/><button type="button" className={`composer-tool labeled website-tool ${websiteMode ? "selected" : ""}`} aria-pressed={websiteMode} onClick={() => toggleWebsite(!websiteMode)} disabled={loading} title="Webseiten direkt im Chat erstellen und bearbeiten"><Code2 size={16}/><span>Webseite</span></button><button type="button" className={`composer-tool labeled ${!websiteMode && webSearch ? "selected" : ""}`} aria-pressed={!websiteMode && webSearch} onClick={() => setWebSearch((value) => !value)} disabled={!configured || loading || websiteMode} title="Aktuelle Informationen mit Google suchen"><Globe size={16}/><span>Websuche</span></button><button type="button" className={`composer-tool labeled ${!websiteMode && analysis ? "selected" : ""}`} aria-pressed={!websiteMode && analysis} onClick={() => setAnalysis((value) => !value)} disabled={!configured || loading || websiteMode} title="Rechnen und Daten mit Python analysieren"><Terminal size={16}/><span>Analyse</span></button></div>{loading ? <button type="button" className="send-button stop" onClick={() => controller.current?.abort()} aria-label="Antwort stoppen"><Square size={16}/></button> : <button className="send-button" disabled={reading || (!prompt.trim() && !attachments.length) || (!websiteMode && webSearch && !searchConsent)} aria-label="Nachricht senden"><ArrowUp size={20}/></button>}</div>
        {!websiteMode && webSearch && <label className="search-consent"><input type="checkbox" checked={searchConsent} onChange={(event) => setSearchConsent(event.target.checked)} disabled={loading}/><span>Websuche aktivieren. Google kann dafür zusätzliche Kosten berechnen. <a href="https://ai.google.dev/gemini-api/docs/pricing" target="_blank" rel="noreferrer">Preise</a></span></label>}
      </form>
      <p className="composer-hint">{reading ? "Dateien werden gelesen …" : attachments.length ? "Anhänge werden beim Senden an Google übertragen. Max. 2 MB pro Datei, 3 MB insgesamt." : "KI kann Fehler machen. Lange Gespräche werden für neue Antworten gekürzt."}</p>
    </footer>
  </section>;
}
