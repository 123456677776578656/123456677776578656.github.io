"use client";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Brain, Check, Code2, Eye, EyeOff, ImagePlus, KeyRound, LoaderCircle, LockKeyhole, Menu, MessageSquare, MessageSquarePlus, Pin, Plus, Search, Settings2, Sparkles, Trash2, X } from "lucide-react";
import { GEMINI_IMAGE_MODEL_LABEL, GEMINI_MODEL_LABEL } from "../lib/ai-config";
import { EMPTY_WORKSPACE, makeId, mergeWorkspace, type Chat, type Project, type Workspace } from "../lib/workspace";
import { loadWorkspace, saveWorkspace } from "../lib/workspace-storage";
import ChatStudio from "../components/chat-studio";
import ImageStudio from "../components/image-studio";
import WebsiteStudio from "../components/website-studio";
import SettingsPanel from "../components/settings-panel";

type Mode = "chat" | "builder" | "images" | "settings";
function freshChat(): Chat { return { id: makeId(), title: "Neuer Chat", messages: [], updatedAt: Date.now() }; }
function freshProject(): Project { return { id: makeId(), name: "Neue Webseite", prompt: "", html: "", updatedAt: Date.now(), versions: [] }; }

export default function Home() {
  const [workspace, setWorkspace] = useState<Workspace>(EMPTY_WORKSPACE);
  const [lastSaved, setLastSaved] = useState<Workspace>(EMPTY_WORKSPACE);
  const [ready, setReady] = useState(false); const [canSave, setCanSave] = useState(false); const [saveStatus, setSaveStatus] = useState<"saved" | "saving" | "error">("saved"); const [storageError, setStorageError] = useState("");
  const savedRef = useRef<Workspace>(EMPTY_WORKSPACE); const saveQueue = useRef<Promise<void>>(Promise.resolve()); const saveRevision = useRef(0);
  const [mode, setMode] = useState<Mode>("chat"); const [sidebar, setSidebar] = useState(false); const [busy, setBusy] = useState(false); const [search, setSearch] = useState("");
  const [activeChatId, setActiveChatId] = useState(""); const [draftChat, setDraftChat] = useState<Chat>({ id: "initial", title: "Neuer Chat", messages: [], updatedAt: 0 });
  const [activeProjectId, setActiveProjectId] = useState(""); const [draftProject, setDraftProject] = useState<Project>({ id: "initial-project", name: "Neue Webseite", html: "", prompt: "", updatedAt: 0 });
  const [memoryDraft, setMemoryDraft] = useState(""); const [memoryVersion, setMemoryVersion] = useState(0); const [notice, setNotice] = useState("");
  const [serverReady, setServerReady] = useState(false); const [configState, setConfigState] = useState("Prüfe Einrichtung …"); const [apiKey, setApiKey] = useState(""); const [keyDraft, setKeyDraft] = useState(""); const [showKey, setShowKey] = useState(false); const [keyDialog, setKeyDialog] = useState(false); const [keyError, setKeyError] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let alive = true;
    void loadWorkspace().then((data) => { if (!alive) return; savedRef.current = data; setLastSaved(data); setWorkspace(data); setCanSave(true); const chat = freshChat(); const project = freshProject(); setDraftChat(chat); setDraftProject(project); setActiveChatId(data.chats.length ? [...data.chats].sort((a, b) => b.updatedAt - a.updatedAt)[0].id : chat.id); setActiveProjectId(data.projects.length ? [...data.projects].sort((a, b) => b.updatedAt - a.updatedAt)[0].id : project.id); })
      .catch(() => { if (alive) { setSaveStatus("error"); setStorageError("Deine gespeicherten Daten konnten nicht geöffnet werden. Deine bisherigen Daten werden nicht überschrieben. Neue Arbeit bleibt vorerst nur in diesem Tab; sichere sie unter Einstellungen als Datei."); const chat = freshChat(); const project = freshProject(); setDraftChat(chat); setDraftProject(project); setActiveChatId(chat.id); setActiveProjectId(project.id); } })
      .finally(() => { if (alive) setReady(true); });
    return () => { alive = false; };
  }, []);
  useEffect(() => {
    let alive = true;
    void fetch("/api/config", { cache: "no-store" }).then((response) => { if (!response.ok) throw new Error(); return response.json(); }).then((data: { geminiConfigured?: boolean }) => { if (alive) { setServerReady(data.geminiConfigured === true); setConfigState(data.geminiConfigured ? "Gemini eingerichtet" : "API-Schlüssel erforderlich"); } }).catch(() => { if (alive) setConfigState("Einrichtung nicht erreichbar"); });
    return () => { alive = false; };
  }, []);
  useEffect(() => {
    if (!ready || !canSave || savedRef.current === workspace) return;
    const revision = ++saveRevision.current;
    const timer = window.setTimeout(() => {
      setSaveStatus("saving");
      saveQueue.current = saveQueue.current.catch(() => undefined).then(async () => {
        try { await saveWorkspace(workspace); savedRef.current = workspace; setLastSaved(workspace); if (saveRevision.current === revision) { setSaveStatus("saved"); setStorageError(""); } }
        catch { setSaveStatus("error"); setStorageError("Dein Browser konnte die Änderungen nicht speichern. Lade unter Einstellungen eine Sicherung herunter, bevor du diese Seite schließt."); }
      });
    }, 400);
    return () => window.clearTimeout(timer);
  }, [workspace, ready, canSave]);
  useEffect(() => { document.documentElement.dataset.theme = workspace.settings.theme; }, [workspace.settings.theme]);
  useEffect(() => { function shortcuts(event: KeyboardEvent) { if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") { event.preventDefault(); setSidebar(true); window.setTimeout(() => searchRef.current?.focus(), 0); } if (event.key === "Escape") { setSidebar(false); setKeyDialog(false); } } window.addEventListener("keydown", shortcuts); return () => window.removeEventListener("keydown", shortcuts); }, []);

  const activeChat = workspace.chats.find((chat) => chat.id === activeChatId) || draftChat;
  const activeProject = workspace.projects.find((project) => project.id === activeProjectId) || draftProject;
  const visibleChats = useMemo(() => { const query = search.toLocaleLowerCase("de").trim(); return workspace.chats.filter((chat) => !query || `${chat.title} ${chat.messages.map((m) => `${m.content} ${(m.attachments || []).map((a) => a.name).join(" ")}`).join(" ")}`.toLocaleLowerCase("de").includes(query)).sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned) || b.updatedAt - a.updatedAt); }, [workspace.chats, search]);
  const updateChat = useCallback((chat: Chat, project?: Project) => { setWorkspace((value) => ({ ...value, chats: value.chats.some((item) => item.id === chat.id) ? value.chats.map((item) => item.id === chat.id ? chat : item) : [...value.chats, chat], projects: !project ? value.projects : value.projects.some((item) => item.id === project.id) ? value.projects.map((item) => item.id === project.id ? project : item) : [...value.projects, project] })); }, []);
  const snapshotChat = useCallback((chat: Chat) => { if (workspace.chats.length >= 500) { setNotice("Bitte sichere und entferne zuerst ältere Chats, bevor du eine weitere Variante erstellst."); return false; } updateChat({ ...chat, id: makeId(), title: `${chat.title.slice(0, 65)} (vor Änderung)`, pinned: false, updatedAt: Date.now() }); return true; }, [updateChat, workspace.chats.length]);
  const updateProject = useCallback((project: Project) => { setWorkspace((value) => ({ ...value, projects: value.projects.some((item) => item.id === project.id) ? value.projects.map((item) => item.id === project.id ? project : item) : [...value.projects, project] })); }, []);
  const needKey = useCallback(() => setKeyDialog(true), []);
  const remember = useCallback((text: string) => { setMemoryDraft(text.slice(0, 500)); setMemoryVersion((v) => v + 1); setMode("settings"); setSidebar(false); }, []);
  function switchMode(next: Mode) { if (busy) return; setMode(next); setSidebar(false); }
  function newChat() { if (busy || workspace.chats.length >= 500) return; const chat = freshChat(); setDraftChat(chat); setActiveChatId(chat.id); switchMode("chat"); }
  function newProject() { if (busy || workspace.projects.length >= 100) return; const project = freshProject(); setDraftProject(project); setActiveProjectId(project.id); switchMode("builder"); }
  function openProject(id: string) { if (busy) return; setActiveProjectId(id); switchMode("builder"); }
  function chatWithProject(project: Project) {
    if (busy) return;
    const existing = [...workspace.chats].filter((chat) => chat.websiteProjectId === project.id).sort((a, b) => b.updatedAt - a.updatedAt)[0];
    if (!existing && workspace.chats.length >= 500) { setNotice("Bitte sichere und entferne zuerst einen älteren Chat."); return; }
    const chat = existing || { ...freshChat(), title: project.name, websiteProjectId: project.id };
    updateChat({ ...chat, websiteMode: true, updatedAt: Date.now() }); setActiveChatId(chat.id); switchMode("chat");
  }
  function deleteChat(chat: Chat) { if (busy || !window.confirm(`„${chat.title}“ von diesem Gerät löschen? Eine heruntergeladene Sicherung bleibt erhalten.`)) return; setWorkspace((value) => ({ ...value, chats: value.chats.filter((item) => item.id !== chat.id) })); if (activeChatId === chat.id) newChat(); }
  function deleteProject(project: Project) { if (busy || !window.confirm(`Projekt „${project.name}“ einschließlich gespeicherter Versionen löschen?`)) return; setWorkspace((value) => ({ ...value, projects: value.projects.filter((item) => item.id !== project.id) })); if (activeProjectId === project.id) newProject(); }
  function connectKey(event: FormEvent) { event.preventDefault(); const key = keyDraft.trim(); if (key.length < 20) { setKeyError("Der API-Schlüssel scheint unvollständig zu sein."); return; } setApiKey(key); setKeyDraft(""); setShowKey(false); setKeyDialog(false); setKeyError(""); }
  function importWorkspace(incoming: Workspace) { const merged = mergeWorkspace(workspace, incoming); setWorkspace(merged); }
  const modeTitle = mode === "builder" ? "Webseitenstudio" : mode === "images" ? "Bilderstudio" : mode === "settings" ? "Einstellungen & Gedächtnis" : "Chat";
  const modelLabel = mode === "images" ? GEMINI_IMAGE_MODEL_LABEL : serverReady ? GEMINI_MODEL_LABEL : apiKey ? "GPT-4o" : "Einrichtung offen";
  const saving = saveStatus === "saving" || (canSave && lastSaved !== workspace);

  if (!ready) return <main className="workspace-loading"><span className="brand-mark"><Sparkles size={26}/></span><h1>KI-Chat</h1><p>Dein Arbeitsplatz wird geöffnet …</p><LoaderCircle className="image-spinner" size={22}/></main>;
  return <main className="app-shell expanded-app">
    <aside className={`sidebar ${sidebar ? "sidebar-open" : ""}`} aria-label="Seitennavigation">
      <div className="brand"><span className="brand-mark"><Sparkles size={20}/></span><span><strong>KI-Chat</strong><small>Dein kreativer Arbeitsplatz</small></span></div>
      <button className="new-chat" onClick={newChat} disabled={busy || workspace.chats.length >= 500}><MessageSquarePlus size={18}/>Neuer Chat<Plus size={15}/></button>
      <div className="mode-switch" aria-label="Arbeitsmodus"><button className={mode === "chat" ? "active" : ""} onClick={() => switchMode("chat")} disabled={busy}><MessageSquare size={16}/>Chats</button><button className={mode === "builder" ? "active" : ""} onClick={() => switchMode("builder")} disabled={busy}><Code2 size={16}/>Codex Studio</button><button className={mode === "images" ? "active" : ""} onClick={() => switchMode("images")} disabled={busy}><ImagePlus size={16}/>Bilder erstellen</button></div>
      <div className="sidebar-search"><Search size={15}/><input ref={searchRef} placeholder="Chats durchsuchen" aria-label="Chats durchsuchen" value={search} onChange={(e) => setSearch(e.target.value)}/><kbd>⌘ K</kbd></div>
      <div className="sidebar-content"><div className="history-heading"><span className="eyebrow">DEINE CHATS</span><span>{workspace.chats.length}</span></div><nav className="chat-history" aria-label="Gespeicherte Chats">{visibleChats.map((chat) => <div className={`history-item ${mode === "chat" && activeChat.id === chat.id ? "active" : ""}`} key={chat.id}><button disabled={busy} className="history-open" onClick={() => { setActiveChatId(chat.id); switchMode("chat"); }}>{chat.pinned ? <Pin size={13}/> : <MessageSquare size={13}/>}<span>{chat.title}</span></button><div className="history-actions"><button disabled={busy} onClick={() => updateChat({ ...chat, pinned: !chat.pinned })} aria-label={chat.pinned ? `${chat.title} lösen` : `${chat.title} anheften`}><Pin size={12}/></button><button disabled={busy} onClick={() => deleteChat(chat)} aria-label={`${chat.title} löschen`}><X size={13}/></button></div></div>)}{!visibleChats.length && <p className="project-empty">{search ? "Keine passenden Chats gefunden." : "Dein nächstes Gespräch wird hier gespeichert."}</p>}</nav>
      <div className="project-nav"><div className="project-nav-head"><span className="eyebrow">MEINE PROJEKTE</span><button onClick={newProject} disabled={busy || workspace.projects.length >= 100} aria-label="Neues Webseitenprojekt"><Plus size={15}/></button></div>{workspace.projects.map((project) => <div className={`project-item ${mode === "builder" && activeProject.id === project.id ? "active" : ""}`} key={project.id}><button disabled={busy} onClick={() => { setActiveProjectId(project.id); switchMode("builder"); }}><span>{project.name || "Unbenanntes Projekt"}</span><small>{new Date(project.updatedAt).toLocaleDateString("de-DE")}</small></button><button disabled={busy} onClick={() => deleteProject(project)} aria-label={`${project.name} löschen`}><X size={13}/></button></div>)}{!workspace.projects.length && <p className="project-empty">Platz für deine Webseiten.</p>}</div></div>
      <button className={`settings-nav ${mode === "settings" ? "active" : ""}`} onClick={() => switchMode("settings")} disabled={busy}><Settings2 size={17}/><span>Einstellungen & Gedächtnis</span><Brain size={14}/></button>
      <div className={`sidebar-foot ${serverReady || apiKey ? "connected" : ""}`}><span className="privacy-dot"/><span>{serverReady ? "Gemini eingerichtet" : apiKey ? "Schlüssel in diesem Tab aktiv" : configState}</span></div>
      {!serverReady && <button className="key-change" onClick={needKey}><KeyRound size={14}/>{apiKey ? "Schlüssel wechseln" : "Schlüssel verbinden"}</button>}
      <button className="sidebar-close" onClick={() => setSidebar(false)} aria-label="Menü schließen"><X size={20}/></button>
    </aside>{sidebar && <button className="backdrop" aria-label="Menü schließen" onClick={() => setSidebar(false)}/>}
    <section className="chat-shell expanded-shell"><header className="topbar"><button className="icon-button mobile-menu" onClick={() => setSidebar(true)} aria-label="Menü öffnen"><Menu size={20}/></button><div className="workspace-heading">{mode === "chat" ? <input className="chat-title-input" aria-label="Chat umbenennen" title="Zum Umbenennen anklicken" value={activeChat.title} onChange={(e) => { const title = e.target.value.slice(0, 100); if (workspace.chats.some((c) => c.id === activeChat.id)) updateChat({ ...activeChat, title }); else setDraftChat({ ...activeChat, title }); }} disabled={busy}/> : <h1>{modeTitle}</h1>}<p className="save-indicator">{saveStatus === "error" ? "Speichern nicht möglich" : saving ? "Wird gespeichert …" : <><Check size={12}/>Auf diesem Gerät gespeichert</>}</p></div><div className="top-actions"><span className="model-pill" title={modelLabel}><Sparkles size={14}/>{modelLabel}</span>{mode === "chat" && activeChat.messages.length > 0 && <button className="icon-button" disabled={busy} onClick={() => deleteChat(activeChat)} aria-label="Aktuellen Chat löschen"><Trash2 size={17}/></button>}</div></header>
      {storageError && <div className="workspace-storage-error" role="alert">{storageError}<button onClick={() => switchMode("settings")} disabled={busy}>Zur Sicherung</button></div>}
      {notice && <div className="workspace-notice" role="status">{notice}<button onClick={() => setNotice("")} aria-label="Hinweis schließen"><X size={14}/></button></div>}
      <div className="workspace-body">
        {mode === "chat" && <ChatStudio key={activeChat.id} chat={activeChat} projects={workspace.projects} configured={serverReady} apiKey={apiKey} settings={workspace.settings} memories={workspace.memories} onChange={updateChat} onSnapshot={snapshotChat} onOpenProject={openProject} onNeedKey={needKey} onRemember={remember} onBusy={setBusy}/>}
        {mode === "builder" && <WebsiteStudio key={activeProject.id} project={activeProject} onChange={updateProject} onChat={() => chatWithProject(activeProject)} onBusy={setBusy} onNeedKey={needKey} configured={serverReady} apiKey={apiKey} memories={workspace.memories} settings={workspace.settings}/>}
        <ImageStudio active={mode === "images"} configured={serverReady} memories={workspace.settings.memoryEnabled ? workspace.memories : []}/>
        {mode === "settings" && <SettingsPanel key={`settings-${memoryVersion}`} workspace={workspace} onSettings={(settings) => setWorkspace((value) => ({ ...value, settings }))} onMemories={(memories) => setWorkspace((value) => ({ ...value, memories }))} onImport={importWorkspace} configured={serverReady} memoryDraft={memoryDraft} onDraftConsumed={() => setMemoryDraft("")}/>}
      </div>
    </section>
    {keyDialog && <div className="key-modal-backdrop"><section className="key-dialog" role="dialog" aria-modal="true" aria-labelledby="key-title"><button className="key-dialog-close" onClick={() => setKeyDialog(false)} aria-label="Fenster schließen"><X size={19}/></button><span className="key-dialog-icon"><LockKeyhole size={25}/></span><span className="key-kicker">PRIVATE VERBINDUNG</span><h2 id="key-title">API-Schlüssel verbinden</h2><p>Für Chat und Webseiten kannst du hier einen OpenAI-Schlüssel verwenden. Er bleibt nur im Arbeitsspeicher dieses Tabs. Dateien, Suche, Analyse und Bilder benötigen den Gemini-Schlüssel auf dem Server.</p><form onSubmit={connectKey}><label htmlFor="api-key">OpenAI API-Schlüssel</label><div className="key-input-wrap"><KeyRound size={17}/><input id="api-key" type={showKey ? "text" : "password"} value={keyDraft} onChange={(e) => setKeyDraft(e.target.value)} placeholder="sk-…" autoComplete="off" autoCapitalize="none" spellCheck={false}/><button type="button" onClick={() => setShowKey((v) => !v)} aria-label={showKey ? "Schlüssel verbergen" : "Schlüssel anzeigen"}>{showKey ? <EyeOff size={18}/> : <Eye size={18}/>}</button></div><button className="connect-button" disabled={keyDraft.trim().length < 20}><LockKeyhole size={17}/>Verbinden</button></form>{keyError && <p role="alert">{keyError}</p>}{apiKey && <button className="disconnect-button" onClick={() => { setApiKey(""); setKeyDialog(false); }}>Schlüssel aus diesem Tab entfernen</button>}</section></div>}
  </main>;
}
