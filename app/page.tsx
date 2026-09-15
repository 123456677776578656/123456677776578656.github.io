"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { ArrowUp, Check, Code2, Copy, Download, Eye, EyeOff, KeyRound, LockKeyhole, Menu, MessageSquarePlus, Monitor, Plus, Save, Sparkles, Square, Trash2, User, X } from "lucide-react";

type Message = { id: string; role: "user" | "assistant"; content: string };
type Project = { id: string; name: string; prompt: string; html: string; updatedAt: number };
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
function isProject(value: unknown): value is Project { if (!value || typeof value !== "object") return false; const p = value as Partial<Project>; return typeof p.id === "string" && typeof p.name === "string" && typeof p.prompt === "string" && typeof p.html === "string" && typeof p.updatedAt === "number"; }

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
  const [keyDialog, setKeyDialog] = useState(false);
  const [serverReady, setServerReady] = useState(false);
  const [mode, setMode] = useState<"chat" | "builder">("chat");
  const [builderPrompt, setBuilderPrompt] = useState("");
  const [generatedHtml, setGeneratedHtml] = useState("");
  const [builderView, setBuilderView] = useState<"preview" | "code">("preview");
  const [projects, setProjects] = useState<Project[]>([]);
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
  const [projectName, setProjectName] = useState("Neue Webseite");
  const [memories, setMemories] = useState<string[]>([]);
  const [memoryDraft, setMemoryDraft] = useState("");
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
      const savedProjects = localStorage.getItem("ki-chat-projects");
      if (savedProjects) { try { const parsed: unknown = JSON.parse(savedProjects); if (Array.isArray(parsed)) setProjects(parsed.filter(isProject).slice(0, 30)); } catch {} }
      const savedMemories = localStorage.getItem("ki-chat-memory");
      if (savedMemories) { try { const parsed: unknown = JSON.parse(savedMemories); if (Array.isArray(parsed)) setMemories(parsed.filter((item): item is string => typeof item === "string").slice(0, 20)); } catch {} }
      setReady(true);
    });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    let active = true;
    void fetch("/api/config", { cache: "no-store" })
      .then((response) => response.json())
      .then((data: { geminiConfigured?: boolean }) => {
        if (!active) return;
        if (data.geminiConfigured) setServerReady(true);
        else setKeyDialog(true);
      })
      .catch(() => { if (active) setKeyDialog(true); });
    return () => { active = false; };
  }, []);
  useEffect(() => { messagesRef.current = messages; if (ready) localStorage.setItem("ki-chat-messages", JSON.stringify(messages)); }, [messages, ready]);
  useEffect(() => { if (ready) localStorage.setItem("ki-chat-projects", JSON.stringify(projects)); }, [projects, ready]);
  useEffect(() => { if (ready) localStorage.setItem("ki-chat-memory", JSON.stringify(memories)); }, [memories, ready]);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, loading]);
  useEffect(() => { if (!textareaRef.current) return; textareaRef.current.style.height = "0px"; textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 160)}px`; }, [prompt]);

  const ask = useCallback(async (text: string) => {
    const clean = text.trim();
    if (!clean || loading) return;
    if (!serverReady && !apiKey) { setKeyDialog(true); throw new Error("Bitte verbinde zuerst deinen API-Schlüssel."); }
    const next = [...messagesRef.current, makeMessage("user", clean)];
    setMessages(next); setPrompt(""); setError(""); setLoading(true);
    const controller = new AbortController(); abortRef.current = controller;
    try {
      const response = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ apiKey, memory: memories.join("\n"), messages: next.map(({ role, content }) => ({ role, content })) }), signal: controller.signal });
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
  }, [apiKey, loading, memories, serverReady]);

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
  async function buildWebsite(event: FormEvent) { event.preventDefault(); const clean = builderPrompt.trim(); if (!clean || loading) return; if (!serverReady && !apiKey) { setKeyDialog(true); return; } setError(""); setLoading(true); try { const response = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ apiKey, mode: "website", memory: memories.join("\n"), messages: [{ role: "user", content: clean }] }) }); const data = await response.json() as { answer?: string; error?: string }; if (!response.ok || !data.answer) throw new Error(data.error || "Die Webseite konnte nicht erstellt werden."); setGeneratedHtml(data.answer); setBuilderView("preview"); saveProject(data.answer, clean); } catch (cause) { setError(cause instanceof Error ? cause.message : "Unbekannter Fehler"); } finally { setLoading(false); } }
  function downloadWebsite() { if (!generatedHtml) return; const url = URL.createObjectURL(new Blob([generatedHtml], { type: "text/html" })); const link = document.createElement("a"); link.href = url; link.download = "meine-webseite.html"; link.click(); URL.revokeObjectURL(url); }
  function saveProject(html = generatedHtml, promptText = builderPrompt) { if (!html) return; const id = currentProjectId || `${Date.now()}-${Math.random().toString(36).slice(2)}`; const fallbackName = promptText.trim().split(/\s+/).slice(0, 5).join(" ") || "Neue Webseite"; const project: Project = { id, name: projectName === "Neue Webseite" ? fallbackName : projectName.trim() || fallbackName, prompt: promptText, html, updatedAt: Date.now() }; setCurrentProjectId(id); setProjectName(project.name); setProjects((items) => [project, ...items.filter((item) => item.id !== id)].slice(0, 30)); }
  function newProject() { setMode("builder"); setCurrentProjectId(null); setProjectName("Neue Webseite"); setBuilderPrompt(""); setGeneratedHtml(""); setError(""); setSidebar(false); }
  function openProject(project: Project) { setMode("builder"); setCurrentProjectId(project.id); setProjectName(project.name); setBuilderPrompt(project.prompt); setGeneratedHtml(project.html); setBuilderView("preview"); setSidebar(false); }
  function deleteProject(id: string) { setProjects((items) => items.filter((item) => item.id !== id)); if (currentProjectId === id) newProject(); }
  function addMemory(event: FormEvent) { event.preventDefault(); const clean = memoryDraft.trim(); if (!clean) return; setMemories((items) => [clean, ...items.filter((item) => item !== clean)].slice(0, 20)); setMemoryDraft(""); }

  return <main className="app-shell">
    <aside className={`sidebar ${sidebar ? "sidebar-open" : ""}`} aria-label="Seitennavigation">
      <div className="brand"><span className="brand-mark"><Sparkles size={19}/></span><span><strong>KI-Chat</strong><small>Persönlicher Assistent</small></span></div>
      <button className="new-chat" onClick={clearChat}><MessageSquarePlus size={18}/>Neuer Chat</button>
      <div className="mode-switch" aria-label="Arbeitsmodus"><button className={mode === "chat" ? "active" : ""} onClick={() => setMode("chat")}><Sparkles size={16}/>KI-Chat</button><button className={mode === "builder" ? "active" : ""} onClick={() => setMode("builder")}><Code2 size={16}/>Codex Studio</button></div>
      <div className="project-nav"><div className="project-nav-head"><span className="eyebrow">MEINE PROJEKTE</span><button onClick={newProject} aria-label="Neues Projekt"><Plus size={15}/></button></div>{projects.length ? projects.map((project) => <div className={`project-item ${currentProjectId === project.id ? "active" : ""}`} key={project.id}><button onClick={() => openProject(project)}><span>{project.name}</span><small>{new Date(project.updatedAt).toLocaleDateString("de-DE")}</small></button><button onClick={() => deleteProject(project.id)} aria-label={`${project.name} löschen`}><X size={13}/></button></div>) : <p className="project-empty">Deine erstellten Seiten erscheinen hier.</p>}</div>
      <div className={`sidebar-foot ${serverReady || apiKey ? "connected" : ""}`}><span className="privacy-dot"/><span>{serverReady ? "Gemini sicher verbunden" : apiKey ? "Schlüssel für diesen Tab aktiv" : "Schlüssel nicht verbunden"}</span></div>
      {!serverReady && <button className="key-change" onClick={() => setKeyDialog(true)}><KeyRound size={15}/>{apiKey ? "Schlüssel wechseln" : "Schlüssel verbinden"}</button>}
      <button className="sidebar-close" onClick={() => setSidebar(false)} aria-label="Menü schließen"><X size={20}/></button>
    </aside>
    {sidebar && <button className="backdrop" aria-label="Menü schließen" onClick={() => setSidebar(false)}/>} 

    <section className="chat-shell">
      <header className="topbar">
        <button className="icon-button mobile-menu" onClick={() => setSidebar(true)} aria-label="Menü öffnen"><Menu size={20}/></button>
        <div><h1>{mode === "chat" ? "Neuer Chat" : "Codex Studio"}</h1><p><span className={`status-dot ${serverReady || apiKey ? "" : "offline"}`}/> {serverReady || apiKey ? (mode === "chat" ? "Bereit für deine Frage" : "Bereit zum Erstellen") : "API-Schlüssel erforderlich"}</p></div>
        <div className="top-actions"><span className="model-pill"><Sparkles size={14}/> {serverReady ? "Gemini 2.5 Flash" : "GPT-4o"}</span>{messages.length > 0 && <button className="icon-button" onClick={clearChat} aria-label="Chat löschen" title="Chat löschen"><Trash2 size={18}/></button>}</div>
      </header>

      {mode === "chat" ? <><div className="conversation" aria-live="polite">
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
      </footer></> : <section className="builder-shell">
        <div className="builder-intro"><span className="welcome-kicker">DEIN WEBSEITEN-BUILDER</span><h2>Beschreiben. Erstellen.<br/>Sofort ansehen.</h2><p>Schreibe, welche Seite du brauchst. Codex Studio erzeugt daraus eine komplette HTML-Webseite.</p></div>
        <div className="builder-meta"><label>Projektname<input value={projectName} onChange={(event) => setProjectName(event.target.value)} maxLength={60}/></label><button onClick={() => saveProject()} disabled={!generatedHtml}><Save size={16}/>Projekt speichern</button></div>
        <form className="builder-form" onSubmit={buildWebsite}><textarea value={builderPrompt} onChange={(event) => setBuilderPrompt(event.target.value)} placeholder="Zum Beispiel: Erstelle eine moderne Webseite für mein Café mit Speisekarte, Öffnungszeiten und Kontakt …" maxLength={4000}/><button disabled={!builderPrompt.trim() || loading}>{loading ? <Square size={16}/> : <Sparkles size={17}/>} {loading ? "Wird erstellt …" : "Webseite erstellen"}</button></form>
        <section className="memory-card"><div><span className="welcome-kicker">GEDÄCHTNIS</span><h3>Was soll sich Codex merken?</h3><p>Zum Beispiel deine Lieblingsfarben, Branche, gewünschte Tonalität oder immer benötigte Bereiche.</p></div><form onSubmit={addMemory}><input value={memoryDraft} onChange={(event) => setMemoryDraft(event.target.value)} placeholder="Meine Markenfarbe ist Dunkelblau …" maxLength={300}/><button disabled={!memoryDraft.trim()}><Plus size={16}/>Merken</button></form>{memories.length > 0 && <div className="memory-list">{memories.map((memory) => <span key={memory}>{memory}<button onClick={() => setMemories((items) => items.filter((item) => item !== memory))} aria-label="Erinnerung löschen"><X size={12}/></button></span>)}</div>}</section>
        {error && <div className="error-banner builder-error" role="alert"><span>{error}</span><button onClick={() => setError("")} aria-label="Fehler schließen"><X size={16}/></button></div>}
        {generatedHtml && <div className="builder-result"><div className="builder-toolbar"><div><button className={builderView === "preview" ? "active" : ""} onClick={() => setBuilderView("preview")}><Monitor size={15}/>Vorschau</button><button className={builderView === "code" ? "active" : ""} onClick={() => setBuilderView("code")}><Code2 size={15}/>Code</button></div><div><button onClick={() => void navigator.clipboard.writeText(generatedHtml)}><Copy size={15}/>Kopieren</button><button onClick={downloadWebsite}><Download size={15}/>HTML laden</button></div></div>{builderView === "preview" ? <iframe title="Vorschau der erstellten Webseite" sandbox="" srcDoc={generatedHtml}/> : <pre><code>{generatedHtml}</code></pre>}</div>}
      </section>}
    </section>
    {keyDialog && !serverReady && <div className="key-modal-backdrop" role="presentation">
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
