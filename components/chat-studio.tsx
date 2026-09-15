"use client";
/* eslint-disable @next/next/no-img-element -- User image attachments are local data URLs. */
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { ArrowUp, Brain, Check, Copy, Download, FileText, Globe, Paperclip, Pencil, RotateCcw, Sparkles, Square, Terminal, User, X } from "lucide-react";
import { chatMarkdown, FILE_ACCEPT, makeId, MAX_CONTEXT_FILE_BYTES, type Attachment, type Chat, type ChatMessage, type Settings } from "../lib/workspace";
import { downloadText, readAttachment } from "../lib/files";
import { readEvents } from "../lib/stream-events";
import MarkdownMessage from "./markdown-message";
import { SpeakButton, VoiceInput } from "./voice-controls";

type Props = { chat: Chat; configured: boolean; apiKey: string; settings: Settings; memories: string[]; onChange: (chat: Chat) => void; onSnapshot: (chat: Chat) => boolean; onNeedKey: () => void; onRemember: (text: string) => void; onBusy: (busy: boolean) => void };
declare global { interface Document { modelContext?: { registerTool: (tool: Record<string, unknown>, options?: { signal: AbortSignal }) => void | Promise<void> }; } }
export default function ChatStudio({ chat, configured, apiKey, settings, memories, onChange, onSnapshot, onNeedKey, onRemember, onBusy }: Props) {
  const [prompt, setPrompt] = useState(""); const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [loading, setLoading] = useState(false); const [reading, setReading] = useState(false);
  const [error, setError] = useState(""); const [notice, setNotice] = useState(""); const [copied, setCopied] = useState("");
  const [webSearch, setWebSearch] = useState(false); const [analysis, setAnalysis] = useState(false); const [searchConsent, setSearchConsent] = useState(false);
  const [editing, setEditing] = useState<number | null>(null);
  const textarea = useRef<HTMLTextAreaElement>(null); const fileInput = useRef<HTMLInputElement>(null); const end = useRef<HTMLDivElement>(null);
  const controller = useRef<AbortController | null>(null); const chatRef = useRef(chat); const alive = useRef(true);
  useEffect(() => { chatRef.current = chat; }, [chat]);
  useEffect(() => { alive.current = true; return () => { alive.current = false; controller.current?.abort(); }; }, []);
  useEffect(() => { end.current?.scrollIntoView({ block: "end", behavior: "instant" }); }, [chat.messages.length, loading]);
  useEffect(() => { if (textarea.current) { textarea.current.style.height = "0px"; textarea.current.style.height = `${Math.min(textarea.current.scrollHeight, 170)}px`; } }, [prompt]);
  const commit = useCallback((messages: ChatMessage[]) => {
    const previous = chatRef.current;
    const firstQuestion = messages.find((m) => m.role === "user")?.content;
    const updated = { ...previous, messages, title: previous.title === "Neuer Chat" && firstQuestion ? firstQuestion.slice(0, 65) : previous.title, updatedAt: Date.now() };
    chatRef.current = updated; onChange(updated);
  }, [onChange]);

  const run = useCallback(async (history: ChatMessage[], message: ChatMessage) => {
    if (controller.current) return;
    if (history.length >= 500) { setError("Dieser Chat ist sehr lang. Starte einen neuen Chat; der bisherige Verlauf bleibt gespeichert."); return; }
    if (!configured && !apiKey) { onNeedKey(); return; }
    if (webSearch && !searchConsent) { setError("Bestätige bitte zuerst den Kostenhinweis zur Websuche."); return; }
    const context = [...history, message].slice(-12);
    if (context.flatMap((m) => m.attachments || []).reduce((sum, file) => sum + file.size, 0) > MAX_CONTEXT_FILE_BYTES) { setError("Die Anhänge dieses Gesprächs sind zusammen größer als 3 MB. Starte dafür bitte einen neuen Chat."); return; }
    const abort = new AbortController(); controller.current = abort;
    const responseId = makeId(); const base = [...history, message]; let text = "";
    setLoading(true); onBusy(true); setError(""); setNotice(""); setPrompt(""); setAttachments([]); setEditing(null);
    const pending = (): ChatMessage => ({ id: responseId, role: "assistant", content: text });
    commit([...base, pending()]);
    try {
      const response = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, signal: abort.signal, body: JSON.stringify({ apiKey, stream: true, webSearch, analysis, searchConsent, instructions: `${settings.name ? `Nenne mich ${settings.name}.\n` : ""}${settings.instructions}`, tone: settings.tone, memory: settings.memoryEnabled ? memories.join("\n") : "", messages: context.map((m) => ({ role: m.role, content: m.content.slice(0, m.role === "user" ? 12000 : 32000), ...(m.attachments?.length ? { attachments: m.attachments } : {}) })) }) });
      if (!response.ok) { const data = await response.json().catch(() => ({})) as { error?: string }; throw new Error(data.error || "Die Anfrage ist fehlgeschlagen."); }
      if (response.headers.get("content-type")?.includes("text/event-stream") && response.body) {
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
      const message = stopped ? "Antwort gestoppt." : cause instanceof Error ? cause.message : "Unbekannter Fehler.";
      commit(text ? [...base, { ...pending(), warning: `${message} Diese Antwort ist möglicherweise unvollständig.` }] : base);
      if (alive.current) { if (stopped) setNotice(message); else setError(message); }
    } finally { if (controller.current === abort) controller.current = null; onBusy(false); if (alive.current) { setLoading(false); textarea.current?.focus(); } }
  }, [apiKey, configured, onNeedKey, onBusy, webSearch, analysis, searchConsent, settings, memories, commit]);

  useEffect(() => {
    if (!document.modelContext?.registerTool) return;
    const abort = new AbortController();
    void Promise.resolve(document.modelContext.registerTool({ name: "ask_ai", title: "KI fragen", description: "Sendet eine Frage im aktuellen Chat. Berücksichtigt die sichtbar aktivierten Werkzeuge und gespeicherten Hinweise.", inputSchema: { type: "object", properties: { prompt: { type: "string", minLength: 1, maxLength: 12000 } }, required: ["prompt"], additionalProperties: false }, annotations: { readOnlyHint: false }, async execute(value: unknown) { const input = value as { prompt?: string }; if (typeof input.prompt !== "string" || !input.prompt.trim()) throw new Error("Eine Frage ist erforderlich."); return { answer: await run(chatRef.current.messages, { id: makeId(), role: "user", content: input.prompt.trim() }) }; } }, { signal: abort.signal })).catch(() => undefined);
    return () => abort.abort();
  }, [run]);

  function submit(event: FormEvent) {
    event.preventDefault(); if (reading || (!prompt.trim() && !attachments.length)) return;
    if (editing !== null && !onSnapshot(chatRef.current)) return;
    void run(editing === null ? chatRef.current.messages : chatRef.current.messages.slice(0, editing), { id: makeId(), role: "user", content: prompt.trim() || "Bitte analysiere die angehängten Dateien.", ...(attachments.length ? { attachments } : {}) });
  }
  function regenerate() {
    const current = chatRef.current; const index = current.messages.findLastIndex((m) => m.role === "user");
    if (index < 0) return;
    if (current.messages.slice(index + 1).some((m) => m.content) && !onSnapshot(current)) return;
    void run(current.messages.slice(0, index), current.messages[index]);
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
      {!chat.messages.length ? <div className="welcome enhanced-welcome"><span className="welcome-mark"><Sparkles size={30}/></span><span className="welcome-kicker">DEIN PERSÖNLICHER ARBEITSPLATZ</span><h2>{settings.name ? `Hallo, ${settings.name}.` : "Eine Idee reicht."}<br/>Was machen wir heute?</h2><p>Fragen klären, Dateien verstehen, Texte schreiben oder etwas Neues erschaffen.</p><div className="starter-grid">{["Hilf mir, meine nächste Idee zu planen", "Erkläre mir ein schwieriges Thema einfach", "Schreibe eine freundliche, professionelle E-Mail"].map((item, i) => <button key={item} onClick={() => { setPrompt(item); textarea.current?.focus(); }}><span>0{i + 1}</span>{item}</button>)}</div><span className="welcome-storage">Chats werden auf diesem Gerät gespeichert.</span></div> : <div className="message-list">
      {chat.messages.map((message, index) => <article className={`message-row ${message.role}`} key={message.id}><span className="avatar">{message.role === "user" ? <User size={16}/> : <Sparkles size={16}/>}</span><div className="message-content"><span className="message-name">{message.role === "user" ? settings.name || "Du" : "KI-Chat"}</span>
        {message.attachments?.length ? <div className="message-attachments">{message.attachments.map((file) => <a key={file.id} href={`data:${file.mimeType};base64,${file.data}`} download={file.name} title="Anhang herunterladen">{file.mimeType.startsWith("image/") ? <img src={`data:${file.mimeType};base64,${file.data}`} alt={file.name}/> : <FileText size={20}/>}<span>{file.name}</span></a>)}</div> : null}
        {message.role === "assistant" ? message.content ? <div className="message-bubble"><MarkdownMessage message={message}/></div> : loading ? <div className="thinking" aria-label="Antwort wird erstellt"><i/><i/><i/></div> : null : <div className="message-bubble">{message.content}</div>}
        {message.content && !loading && <div className="message-actions"><button onClick={() => void copy(message)}>{copied === message.id ? <Check size={14}/> : <Copy size={14}/>} {copied === message.id ? "Kopiert" : "Kopieren"}</button>{message.role === "user" ? <button onClick={() => { setEditing(index); setPrompt(message.content); setAttachments(message.attachments || []); textarea.current?.focus(); }}><Pencil size={14}/>Bearbeiten</button> : <><SpeakButton text={message.content} onNotice={setNotice}/><button onClick={() => downloadText("antwort.md", message.content, "text/markdown;charset=utf-8")}><Download size={14}/>Speichern</button></>}<button onClick={() => onRemember(message.content)}><Brain size={14}/>Merken</button></div>}
      </div></article>)}
      {!loading && chat.messages.length > 0 && <div className="conversation-actions"><button onClick={regenerate}><RotateCcw size={14}/>Erneut antworten</button><button onClick={() => downloadText("chat.md", chatMarkdown(chat), "text/markdown;charset=utf-8")}><Download size={14}/>Chat exportieren</button></div>}
      <div ref={end}/></div>}
    </div>
    <footer className="composer-wrap">
      {error && <div className="error-banner" role="alert"><span>{error}</span><button onClick={() => setError("")} aria-label="Fehler schließen"><X size={16}/></button></div>}
      {notice && <div className="chat-notice" role="status"><span>{notice}</span><button onClick={() => setNotice("")} aria-label="Hinweis schließen"><X size={14}/></button></div>}
      <form className="advanced-composer" onSubmit={submit}>
        {editing !== null && <div className="editing-notice">Nachricht bearbeiten · Der bisherige Verlauf bleibt als Kopie erhalten.<button type="button" onClick={() => { setEditing(null); setPrompt(""); setAttachments([]); }} aria-label="Bearbeitung abbrechen"><X size={14}/></button></div>}
        {!!attachments.length && <div className="attachment-drafts">{attachments.map((file) => <span key={file.id}><FileText size={14}/>{file.name}<button type="button" onClick={() => setAttachments((items) => items.filter((item) => item.id !== file.id))} aria-label={`${file.name} entfernen`}><X size={13}/></button></span>)}</div>}
        <textarea ref={textarea} value={prompt} onChange={(event) => setPrompt(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing && window.matchMedia("(pointer: fine)").matches) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} placeholder="Frag etwas oder beschreibe deine Idee …" aria-label="Deine Nachricht" maxLength={12000} rows={1} disabled={loading}/>
        <div className="composer-bottom"><div className="composer-tools"><input ref={fileInput} type="file" accept={FILE_ACCEPT} multiple hidden onChange={(event) => void attach(event.target.files)}/><button type="button" className="composer-tool" onClick={() => fileInput.current?.click()} disabled={!configured || loading || reading} title="PDF, Bilder, CSV und Textdateien anhängen" aria-label="Dateien anhängen"><Paperclip size={18}/></button><VoiceInput disabled={loading} onText={(text) => setPrompt((current) => `${current}${current ? " " : ""}${text}`.slice(0, 12000))} onNotice={setNotice}/><button type="button" className={`composer-tool labeled ${webSearch ? "selected" : ""}`} aria-pressed={webSearch} onClick={() => setWebSearch((value) => !value)} disabled={!configured || loading} title="Aktuelle Informationen mit Google suchen"><Globe size={16}/><span>Websuche</span></button><button type="button" className={`composer-tool labeled ${analysis ? "selected" : ""}`} aria-pressed={analysis} onClick={() => setAnalysis((value) => !value)} disabled={!configured || loading} title="Rechnen und Daten mit Python analysieren"><Terminal size={16}/><span>Analyse</span></button></div>{loading ? <button type="button" className="send-button stop" onClick={() => controller.current?.abort()} aria-label="Antwort stoppen"><Square size={16}/></button> : <button className="send-button" disabled={reading || (!prompt.trim() && !attachments.length) || (webSearch && !searchConsent)} aria-label="Nachricht senden"><ArrowUp size={20}/></button>}</div>
        {webSearch && <label className="search-consent"><input type="checkbox" checked={searchConsent} onChange={(event) => setSearchConsent(event.target.checked)} disabled={loading}/><span>Websuche aktivieren. Google kann dafür zusätzliche Kosten berechnen. <a href="https://ai.google.dev/gemini-api/docs/pricing" target="_blank" rel="noreferrer">Preise</a></span></label>}
      </form>
      <p className="composer-hint">{reading ? "Dateien werden gelesen …" : attachments.length ? "Anhänge werden beim Senden an Google übertragen. Max. 2 MB pro Datei, 3 MB insgesamt." : "KI kann Fehler machen. Lange Gespräche werden für neue Antworten gekürzt."}</p>
    </footer>
  </section>;
}
