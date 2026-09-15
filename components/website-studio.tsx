"use client";
import { FormEvent, useEffect, useRef, useState } from "react";
import { Code2, Download, History, LoaderCircle, Monitor, Save, Smartphone, Sparkles, Square, Upload } from "lucide-react";
import { downloadText } from "../lib/files";
import type { Project, Settings } from "../lib/workspace";

export default function WebsiteStudio({ project, onChange, onBusy, onNeedKey, configured, apiKey, memories, settings }: { project: Project; onChange: (p: Project) => void; onBusy: (busy: boolean) => void; onNeedKey: () => void; configured: boolean; apiKey: string; memories: string[]; settings: Settings }) {
  const [prompt, setPrompt] = useState(project.prompt); const [html, setHtml] = useState(project.html); const [view, setView] = useState<"preview" | "code">("preview");
  const [mobile, setMobile] = useState(false); const [loading, setLoading] = useState(false); const [error, setError] = useState(""); const [notice, setNotice] = useState("");
  const abort = useRef<AbortController | null>(null); const importRef = useRef<HTMLInputElement>(null); const editingCode = useRef(false);
  useEffect(() => () => abort.current?.abort(), []);
  function save(nextHtml = html, nextPrompt = prompt) {
    if (!nextHtml.trim()) return;
    const versions = project.html && project.html !== nextHtml ? [{ html: project.html, prompt: project.prompt, createdAt: project.updatedAt }, ...(project.versions || [])].slice(0, 8) : project.versions || [];
    onChange({ ...project, html: nextHtml, prompt: nextPrompt, updatedAt: Date.now(), versions }); setNotice("Projekt gespeichert. Frühere Stände findest du unter Versionen.");
  }
  function editHtml(next: string) {
    const content = next.slice(0, 250000);
    const versions = !editingCode.current && project.html ? [{ html: project.html, prompt: project.prompt, createdAt: project.updatedAt }, ...(project.versions || [])].slice(0, 8) : project.versions || [];
    editingCode.current = true; setHtml(content); onChange({ ...project, html: content, versions, updatedAt: Date.now() });
  }
  async function build(event: FormEvent) {
    event.preventDefault(); if (!prompt.trim() || abort.current) return;
    if (!configured && !apiKey) { onNeedKey(); return; }
    const controller = new AbortController(); abort.current = controller;
    setLoading(true); onBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, signal: controller.signal, body: JSON.stringify({ apiKey, mode: "website", memory: settings.memoryEnabled ? memories.join("\n") : "", instructions: settings.instructions, existingHtml: html, messages: [{ role: "user", content: prompt.trim() }] }) });
      const data = await response.json() as { answer?: string; error?: string };
      if (!response.ok || !data.answer) throw new Error(data.error || "Die Webseite konnte nicht erstellt werden.");
      if (!/<(?:!doctype\s+html|html)[\s>]/i.test(data.answer) || !/<\/html\s*>/i.test(data.answer)) throw new Error("Die KI hat keine vollständige HTML-Seite geliefert. Dein bisheriges Projekt bleibt erhalten.");
      setHtml(data.answer); save(data.answer, prompt); setView("preview");
    } catch (cause) { if (controller.signal.aborted) setNotice("Erstellung gestoppt. Dein letzter gespeicherter Stand bleibt erhalten."); else setError(cause instanceof Error ? cause.message : "Die Erstellung ist fehlgeschlagen."); }
    finally { abort.current = null; setLoading(false); onBusy(false); }
  }
  async function importHtml(file?: File) {
    if (!file) return;
    try { if (!/\.html?$/i.test(file.name) || file.size > 250000) throw new Error("Wähle eine HTML-Datei bis 250 KB."); const content = await file.text(); if (!/<(?:!doctype\s+html|html)[\s>]/i.test(content)) throw new Error("Die Datei enthält keine HTML-Webseite."); setHtml(content); save(content, prompt); setView("preview"); } catch (cause) { setError(cause instanceof Error ? cause.message : "Import fehlgeschlagen."); } finally { if (importRef.current) importRef.current.value = ""; }
  }
  const preview = `<!doctype html><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline' https:; img-src https: data: blob:; font-src https: data:; connect-src 'none'; form-action 'none'; base-uri 'none'"><meta name="viewport" content="width=device-width, initial-scale=1">${html.replace(/<!doctype[^>]*>/i, "")}`;
  return <section className="builder-shell website-workspace"><div className="builder-intro"><span className="welcome-kicker">DEINE IDEE. DEINE WEBSEITE.</span><h2>Erstellen. Verfeinern.<br/>Weiterbauen.</h2><p>Beschreibe deine Seite oder ändere ein bestehendes Projekt. Gespeicherte Versionen bleiben zum Wiederherstellen erhalten.</p></div>
    <div className="builder-meta"><label>Projektname<input value={project.name} onChange={(e) => onChange({ ...project, name: e.target.value.slice(0, 80), updatedAt: Date.now() })}/></label><button onClick={() => save()} disabled={!html || loading}><Save size={16}/>Projekt speichern</button><button onClick={() => importRef.current?.click()} disabled={loading}><Upload size={16}/>HTML importieren</button><input ref={importRef} hidden type="file" accept=".html,.htm" onChange={(e) => void importHtml(e.target.files?.[0])}/></div>
    <form className="builder-form" onSubmit={build}><textarea value={prompt} onChange={(e) => { setPrompt(e.target.value); onChange({ ...project, prompt: e.target.value, updatedAt: Date.now() }); }} aria-label="Webseite oder Änderung beschreiben" placeholder={html ? "Was möchtest du an deiner Seite ändern?" : "Erstelle eine moderne Webseite für mein Café mit Speisekarte, Öffnungszeiten und Kontakt …"} maxLength={8000} disabled={loading}/><button disabled={!prompt.trim() || loading}>{loading ? <LoaderCircle size={17} className="image-spinner"/> : <Sparkles size={17}/>} {loading ? "Wird erstellt …" : html ? "Änderung umsetzen" : "Webseite erstellen"}</button>{loading && <button type="button" onClick={() => abort.current?.abort()}><Square size={14}/>Stoppen</button>}</form>
    {error && <p className="panel-error" role="alert">{error}</p>}{notice && <p className="panel-notice" role="status">{notice}</p>}
    {html || view === "code" ? <div className="builder-result"><div className="builder-toolbar"><div><button className={view === "preview" ? "active" : ""} onClick={() => setView("preview")}><Monitor size={15}/>Vorschau</button><button className={view === "code" ? "active" : ""} onClick={() => setView("code")}><Code2 size={15}/>Code bearbeiten</button></div><div><button onClick={() => setMobile((v) => !v)} aria-pressed={mobile}><Smartphone size={15}/>{mobile ? "Desktop" : "Handy"}</button><button onClick={() => downloadText("meine-webseite.html", html, "text/html;charset=utf-8")}><Download size={15}/>HTML laden</button></div></div>{view === "preview" ? <div className={`website-preview ${mobile ? "mobile-preview" : ""}`}><iframe title="Vorschau deiner Webseite" sandbox="allow-scripts" referrerPolicy="no-referrer" srcDoc={preview}/></div> : <><textarea className="html-editor" spellCheck={false} aria-label="HTML-Code bearbeiten" value={html} onChange={(e) => editHtml(e.target.value)} onBlur={() => { editingCode.current = false; }} disabled={loading}/><p className="editor-hint">Codeänderungen werden automatisch auf diesem Gerät gespeichert. Den Stand vor der Bearbeitung findest du unter Versionen.</p></>}
    </div> : <div className="builder-empty"><Code2 size={28}/><p>Deine Webseite erscheint hier. Oder importiere eine vorhandene HTML-Datei.</p></div>}
    {!!project.versions?.length && <details className="version-history"><summary><History size={16}/>Versionen ({project.versions.length})</summary>{project.versions.map((version, i) => <div key={`${version.createdAt}-${i}`}><span>{new Date(version.createdAt).toLocaleString("de-DE")}<small>{version.prompt.slice(0, 90)}</small></span><button disabled={loading} onClick={() => { setHtml(version.html); setPrompt(version.prompt); save(version.html, version.prompt); setView("preview"); }}>Wiederherstellen</button></div>)}</details>}
  </section>;
}
