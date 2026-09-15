"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { ArrowUp, Check, Copy, Eye, EyeOff, KeyRound, LockKeyhole, Menu, MessageSquarePlus, Sparkles, Square, Trash2, User, X } from "lucide-react";

type Message = { id: string; role: "user" | "assistant"; content: string };
const STARTERS = ["Erkläre mir ein schwieriges Thema einfach", "Hilf mir, eine professionelle E-Mail zu schreiben", "Erstelle einen Plan für mein nächstes Projekt"];

declare global { interface Document { modelContext?: { registerTool: (tool: Record<string, unknown>, options?: { signal: AbortSignal }) => void | Promise<void> }; } }

function makeMessage(role: Message["role"], content: string): Message {
  return { id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, role, content };
}
function isMessage(value: unknown): value is Message {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<Message>;
  return typeof item.id === "string" && (item.role === "user" || item.role === "assistant") && typeof item.content === "string" && item.content.length <= 8000;
}

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [sidebar, setSidebar] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [keyDraft, setKeyDraft] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [keyDialog, setKeyDialog] = useState(true);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const messagesRef = useRef<Message[]>([]);

  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      const saved = localStorage.getItem("ki-chat-messages");
      if (saved) { try { const parsed: unknown = JSON.parse(saved); if (Array.isArray(parsed)) setMessages(parsed.filter(isMessage).slice(-30)); } catch {} }
      setReady(true);
    });
    return () => { active = false; };
  }, []);
  useEffect(() => { messagesRef.current = messages; if (ready) localStorage.setItem("ki-chat-messages", JSON.stringify(messages)); }, [messages, ready]);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, loading]);
  useEffect(() => { if (!textareaRef.current) return; textareaRef.current.style.height = "0px"; textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 160)}px`; }, [prompt]);

  const ask = useCallback(async (text: string) => {
    const clean = text.trim();
    if (!clean || loading) return;
    if (!apiKey) { setKeyDialog(true); throw new Error("Bitte verbinde zuerst deinen API-Schlüssel."); }
    const next = [...messagesRef.current, makeMessage("user", clean)];
    setMessages(next); setPrompt(""); setError(""); setLoading(true);
    const controller = new AbortController(); abortRef.current = controller;
    try {
      const response = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ apiKey, messages: next.map(({ role, content }) => ({ role, content })) }), signal: controller.signal });
      const data: unknown = await response.json();
      const payload = data && typeof data === "object" ? data as { answer?: unknown; error?: unknown } : {};
      if (!response.ok) throw new Error(typeof payload.error === "string" ? payload.error : "Die Anfrage ist fehlgeschlagen.");
      if (typeof payload.answer !== "string" || !payload.answer.trim()) throw new Error("Die KI hat keine gültige Antwort geliefert.");
      const answer = makeMessage("assistant", payload.answer);
      setMessages((current) => [...current, answer]);
      return answer.content;
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === "AbortError") return;
      setError(cause instanceof Error ? cause.message : "Unbekannter Fehler");
      throw cause;
    } finally { setLoading(false); abortRef.current = null; textareaRef.current?.focus(); }
  }, [apiKey, loading]);

  useEffect(() => {
    if (!document.modelContext?.registerTool) return;
    const controller = new AbortController();
    void Promise.resolve(document.modelContext.registerTool({ name: "ask_ai", title: "KI fragen", description: "Sendet eine Frage an den Assistenten und zeigt die Antwort im sichtbaren Chat.", inputSchema: { type: "object", properties: { prompt: { type: "string", minLength: 1, maxLength: 8000 } }, required: ["prompt"], additionalProperties: false }, annotations: { readOnlyHint: false, untrustedContentHint: true }, async execute(input: unknown) { const value = input as { prompt?: unknown }; if (typeof value?.prompt !== "string" || !value.prompt.trim()) throw new Error("Eine Frage ist erforderlich."); return { answer: await ask(value.prompt) }; } }, { signal: controller.signal })).catch(() => undefined);
    return () => controller.abort();
  }, [ask]);

  function clearChat() { abortRef.current?.abort(); setMessages([]); setError(""); localStorage.removeItem("ki-chat-messages"); setSidebar(false); textareaRef.current?.focus(); }
  function connectKey(event: FormEvent) { event.preventDefault(); const clean = keyDraft.trim(); if (clean.length < 20) { setError("Der API-Schlüssel scheint unvollständig zu sein."); return; } setApiKey(clean); setKeyDraft(""); setShowKey(false); setKeyDialog(false); setError(""); window.setTimeout(() => textareaRef.current?.focus(), 0); }
  function disconnectKey() { abortRef.current?.abort(); setApiKey(""); setKeyDraft(""); setError(""); setKeyDialog(true); setSidebar(false); }
  function submit(event: FormEvent) { event.preventDefault(); void ask(prompt).catch(() => undefined); }
  async function copyMessage(message: Message) { await navigator.clipboard.writeText(message.content); setCopied(message.id); window.setTimeout(() => setCopied(null), 1600); }

  return <main className="app-shell">
    <aside className={`sidebar ${sidebar ? "sidebar-open" : ""}`} aria-label="Seitennavigation">
      <div className="brand"><span className="brand-mark"><Sparkles size={19}/></span><span><strong>KI-Chat</strong><small>Persönlicher Assistent</small></span></div>
      <button className="new-chat" onClick={clearChat}><MessageSquarePlus size={18}/>Neuer Chat</button>
      <div className="sidebar-copy"><span className="eyebrow">DEIN ARBEITSBEREICH</span><p>Gedanken sortieren, Texte verbessern und Ideen weiterentwickeln.</p></div>
      <div className={`sidebar-foot ${apiKey ? "connected" : ""}`}><span className="privacy-dot"/><span>{apiKey ? "Schlüssel für diesen Tab aktiv" : "Schlüssel nicht verbunden"}</span></div>
      <button className="key-change" onClick={() => setKeyDialog(true)}><KeyRound size={15}/>{apiKey ? "Schlüssel wechseln" : "Schlüssel verbinden"}</button>
      <button className="sidebar-close" onClick={() => setSidebar(false)} aria-label="Menü schließen"><X size={20}/></button>
    </aside>
    {sidebar && <button className="backdrop" aria-label="Menü schließen" onClick={() => setSidebar(false)}/>} 

    <section className="chat-shell">
      <header className="topbar">
        <button className="icon-button mobile-menu" onClick={() => setSidebar(true)} aria-label="Menü öffnen"><Menu size={20}/></button>
        <div><h1>Neuer Chat</h1><p><span className={`status-dot ${apiKey ? "" : "offline"}`}/> {apiKey ? "Bereit für deine Frage" : "API-Schlüssel erforderlich"}</p></div>
        <div className="top-actions"><span className="model-pill"><Sparkles size={14}/> GPT-4o</span>{messages.length > 0 && <button className="icon-button" onClick={clearChat} aria-label="Chat löschen" title="Chat löschen"><Trash2 size={18}/></button>}</div>
      </header>

      <div className="conversation" aria-live="polite">
        {messages.length === 0 ? <div className="welcome">
          <span className="welcome-mark"><Sparkles size={30}/></span>
          <span className="welcome-kicker">DEIN KI-ASSISTENT</span>
          <h2>Womit kann ich dir<br/>heute helfen?</h2>
          <p>Frag einfach drauflos — von einer schnellen Erklärung bis zum fertigen Entwurf.</p>
          <div className="starter-grid">{STARTERS.map((starter, index) => <button key={starter} onClick={() => void ask(starter).catch(() => undefined)}><span>0{index + 1}</span>{starter}</button>)}</div>
        </div> : <div className="message-list">
          {messages.map((message) => <article className={`message-row ${message.role}`} key={message.id}>
            <span className="avatar">{message.role === "assistant" ? <Sparkles size={16}/> : <User size={16}/>}</span>
            <div className="message-content"><span className="message-name">{message.role === "assistant" ? "KI-Chat" : "Du"}</span><div className="message-bubble">{message.content}</div>{message.role === "assistant" && <button className="copy-button" onClick={() => void copyMessage(message)}>{copied === message.id ? <Check size={14}/> : <Copy size={14}/>} {copied === message.id ? "Kopiert" : "Kopieren"}</button>}</div>
          </article>)}
          {loading && <article className="message-row assistant"><span className="avatar"><Sparkles size={16}/></span><div className="message-content"><span className="message-name">KI-Chat</span><div className="thinking"><i/><i/><i/></div></div></article>}
          <div ref={endRef}/>
        </div>}
      </div>

      <footer className="composer-wrap">
        {error && <div className="error-banner" role="alert"><span>{error}</span><button onClick={() => setError("")} aria-label="Fehler schließen"><X size={16}/></button></div>}
        <form className="composer" onSubmit={submit}>
          <textarea ref={textareaRef} value={prompt} onChange={(event) => setPrompt(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} placeholder="Nachricht an KI-Chat" aria-label="Deine Nachricht" rows={1} maxLength={8000}/>
          {loading ? <button type="button" className="send-button stop" onClick={() => abortRef.current?.abort()} aria-label="Antwort stoppen"><Square size={15}/></button> : <button className="send-button" disabled={!prompt.trim()} aria-label="Nachricht senden"><ArrowUp size={20}/></button>}
        </form>
        <p className="composer-hint">KI kann Fehler machen. Prüfe wichtige Informationen.</p>
      </footer>
    </section>
    {keyDialog && <div className="key-modal-backdrop" role="presentation">
      <section className="key-dialog" role="dialog" aria-modal="true" aria-labelledby="key-title">
        {apiKey && <button className="key-dialog-close" onClick={() => setKeyDialog(false)} aria-label="Fenster schließen"><X size={19}/></button>}
        <span className="key-dialog-icon"><LockKeyhole size={25}/></span>
        <span className="key-kicker">PRIVATE VERBINDUNG</span>
        <h2 id="key-title">API-Schlüssel eingeben</h2>
        <p>Dein Schlüssel bleibt nur im Arbeitsspeicher dieses Tabs. Er wird nicht im Browser gespeichert und ist nach dem Schließen wieder weg.</p>
        <form onSubmit={connectKey}>
          <label htmlFor="api-key">OpenAI API-Schlüssel</label>
          <div className="key-input-wrap">
            <KeyRound size={17}/>
            <input id="api-key" type={showKey ? "text" : "password"} value={keyDraft} onChange={(event) => setKeyDraft(event.target.value)} placeholder="sk-..." autoComplete="off" autoCapitalize="none" spellCheck={false} autoFocus/>
            <button type="button" onClick={() => setShowKey((value) => !value)} aria-label={showKey ? "Schlüssel verbergen" : "Schlüssel anzeigen"}>{showKey ? <EyeOff size={18}/> : <Eye size={18}/>}</button>
          </div>
          <button className="connect-button" disabled={keyDraft.trim().length < 20}><LockKeyhole size={17}/>Sicher verbinden</button>
        </form>
        <div className="key-note"><Check size={15}/><span>Nur an dein eigenes Backend und OpenAI übertragen</span></div>
        {apiKey && <button className="disconnect-button" onClick={disconnectKey}>Aktuellen Schlüssel entfernen</button>}
      </section>
    </div>}
  </main>;
}
