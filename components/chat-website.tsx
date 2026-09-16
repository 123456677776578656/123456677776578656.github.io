"use client";
import { useState } from "react";
import { ChevronDown, Code2, Download, ExternalLink, MessageSquare, Monitor, Smartphone } from "lucide-react";
import { downloadText } from "../lib/files";
import { websitePreview } from "../lib/website";
import type { WebsiteArtifact } from "../lib/workspace";

export default function ChatWebsite({ website, expanded, busy, canOpen, onOpen, onContinue }: { website: WebsiteArtifact; expanded: boolean; busy: boolean; canOpen: boolean; onOpen: () => void; onContinue: () => void }) {
  const [open, setOpen] = useState(expanded);
  const [view, setView] = useState<"preview" | "code">("preview");
  const [mobile, setMobile] = useState(false);
  return <section className="chat-website" aria-label={`Webseite: ${website.name}`}>
    <button className="chat-website-heading" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
      <span className="chat-website-icon"><Code2 size={21}/></span><span><small>DEINE WEBSEITE</small><strong>{website.name}</strong></span><ChevronDown size={18} className={open ? "rotated" : ""}/>
    </button>
    {open && <>
      <div className="chat-website-toolbar"><div role="group" aria-label="Webseitenansicht"><button className={view === "preview" ? "active" : ""} aria-pressed={view === "preview"} onClick={() => setView("preview")}><Monitor size={15}/>Vorschau</button><button className={view === "code" ? "active" : ""} aria-pressed={view === "code"} onClick={() => setView("code")}><Code2 size={15}/>Code</button></div><button aria-label="Handy-Vorschau" aria-pressed={mobile} disabled={view !== "preview"} onClick={() => setMobile((value) => !value)}><Smartphone size={15}/>{mobile ? "Desktop" : "Handy"}</button></div>
      {view === "preview" ? <div className={`chat-website-preview ${mobile ? "is-mobile" : ""}`}><iframe title={`Vorschau: ${website.name}`} sandbox="allow-scripts" referrerPolicy="no-referrer" srcDoc={websitePreview(website.html)}/></div> : <pre className="chat-website-code" tabIndex={0} aria-label="HTML der Webseite"><code>{website.html}</code></pre>}
      <div className="chat-website-actions"><button disabled={busy} onClick={onContinue}><MessageSquare size={15}/>Im Chat weiterbauen</button><button disabled={busy || !canOpen} onClick={onOpen}><ExternalLink size={15}/>Im Studio öffnen</button><button onClick={() => downloadText("meine-webseite.html", website.html, "text/html;charset=utf-8")}><Download size={15}/>HTML laden</button></div>
      <p className="chat-website-note">Dieser Entwurf bleibt im Chat erhalten. Dein aktueller Projektstand steht unter „Meine Projekte“. Die Vorschau veröffentlicht deine Seite noch nicht.</p>
    </>}
  </section>;
}
