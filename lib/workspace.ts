export type Source = { title: string; url: string };
export type Attachment = { id: string; name: string; mimeType: string; data: string; size: number };
export type Execution = { code: string; output: string; outcome: string };
export type Artifact = { mimeType: string; data: string };
export type WebsiteArtifact = { projectId: string; name: string; html: string };
export type ChatMessage = { id: string; role: "user" | "assistant"; content: string; attachments?: Attachment[]; sources?: Source[]; executions?: Execution[]; artifacts?: Artifact[]; searchHtml?: string; warning?: string; websiteRequest?: boolean; websiteBase?: string; website?: WebsiteArtifact };
export type Chat = { id: string; title: string; messages: ChatMessage[]; updatedAt: number; pinned?: boolean; websiteMode?: boolean; websiteProjectId?: string };
export type ProjectVersion = { html: string; prompt: string; createdAt: number };
export type Project = { id: string; name: string; prompt: string; html: string; updatedAt: number; versions?: ProjectVersion[] };
export type Settings = { name: string; instructions: string; tone: "normal" | "short" | "detailed"; theme: "light" | "dark" | "system"; memoryEnabled: boolean };
export type Workspace = { version: 1; chats: Chat[]; projects: Project[]; memories: string[]; settings: Settings };
export const DEFAULT_SETTINGS: Settings = { name: "", instructions: "", tone: "normal", theme: "light", memoryEnabled: true };
export const EMPTY_WORKSPACE: Workspace = { version: 1, chats: [], projects: [], memories: [], settings: DEFAULT_SETTINGS };
export const MAX_FILE_BYTES = 2 * 1024 * 1024;
export const MAX_CONTEXT_FILE_BYTES = 3 * 1024 * 1024;
export const FILE_TYPES = ["image/png", "image/jpeg", "image/webp", "application/pdf", "text/plain", "text/csv", "application/json"];
export const FILE_ACCEPT = ".png,.jpg,.jpeg,.webp,.pdf,.txt,.md,.csv,.json,.js,.ts,.tsx,.jsx,.py,.html,.css,.sql,.xml,.yaml,.yml";
export function makeId() { return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 11)}`; }
export function safeUrl(value: unknown): string | undefined {
  if (typeof value !== "string" || value.length > 4000) return;
  try { const url = new URL(value); if (["http:", "https:"].includes(url.protocol) && !url.username && !url.password) return url.href; } catch {}
}
export function isAttachment(value: unknown): value is Attachment {
  if (!value || typeof value !== "object") return false;
  const a = value as Attachment;
  return typeof a.id === "string" && typeof a.name === "string" && a.name.length <= 180 && FILE_TYPES.includes(a.mimeType) && typeof a.data === "string" && a.data.length > 0 && a.data.length <= Math.ceil(MAX_FILE_BYTES / 3) * 4 && /^[A-Za-z0-9+/]+={0,2}$/.test(a.data) && Number.isFinite(a.size) && a.size > 0 && a.size <= MAX_FILE_BYTES;
}
export function isChatMessage(value: unknown): value is ChatMessage {
  if (!value || typeof value !== "object") return false;
  const m = value as ChatMessage;
  return typeof m.id === "string" && ["user", "assistant"].includes(m.role) && typeof m.content === "string" && m.content.length <= 100_000 && (!m.attachments || (Array.isArray(m.attachments) && m.attachments.length <= 3 && m.attachments.every(isAttachment)));
}
function cleanMessage(m: ChatMessage): ChatMessage {
  return { id: m.id, role: m.role, content: m.content,
    ...(m.role === "user" && m.attachments?.length ? { attachments: m.attachments.map((a) => ({ id: a.id, name: a.name, mimeType: a.mimeType, data: a.data, size: a.size })) } : {}),
    ...(Array.isArray(m.sources) ? { sources: m.sources.filter((s) => s && typeof s.title === "string" && safeUrl(s.url)).slice(0, 20).map((s) => ({ title: s.title.slice(0, 240), url: safeUrl(s.url)! })) } : {}),
    ...(Array.isArray(m.executions) ? { executions: m.executions.filter((e) => e && typeof e.code === "string" && typeof e.output === "string" && typeof e.outcome === "string").slice(0, 10).map((e) => ({ code: e.code.slice(0, 30000), output: e.output.slice(0, 30000), outcome: e.outcome.slice(0, 60) })) } : {}),
    ...(Array.isArray(m.artifacts) ? { artifacts: m.artifacts.filter((a) => a && ["image/png", "image/jpeg", "image/webp"].includes(a.mimeType) && typeof a.data === "string" && a.data.length <= 1_500_000 && /^[A-Za-z0-9+/]+={0,2}$/.test(a.data)).slice(0, 2).map((a) => ({ mimeType: a.mimeType, data: a.data })) } : {}),
    ...(typeof m.searchHtml === "string" ? { searchHtml: m.searchHtml.slice(0, 40000) } : {}),
    ...(typeof m.warning === "string" ? { warning: m.warning.slice(0, 500) } : {}),
    ...(m.role === "user" && typeof m.websiteRequest === "boolean" ? { websiteRequest: m.websiteRequest } : {}),
    ...(m.role === "user" && typeof m.websiteBase === "string" && m.websiteBase.length <= 250000 ? { websiteBase: m.websiteBase } : {}),
    ...(m.role === "assistant" && m.website && typeof m.website.projectId === "string" && typeof m.website.name === "string" && typeof m.website.html === "string" && m.website.html.length <= 250000 ? { website: { projectId: m.website.projectId, name: m.website.name.slice(0, 100), html: m.website.html } } : {}),
  };
}
export function parseWorkspace(value: unknown): Workspace {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Die Datei enthält keine gültige Sicherung.");
  const data = value as Partial<Workspace>;
  if (data.version !== 1 || !Array.isArray(data.chats) || !Array.isArray(data.projects) || !Array.isArray(data.memories)) throw new Error("Dieses Sicherungsformat wird nicht unterstützt.");
  if (data.chats.length > 500 || data.projects.length > 100 || data.memories.length > 100) throw new Error("Die Sicherung enthält zu viele Einträge.");
  const chats = data.chats.map((chat) => {
    if (!chat || typeof chat.id !== "string" || typeof chat.title !== "string" || !Number.isFinite(chat.updatedAt) || !Array.isArray(chat.messages) || chat.messages.length > 500 || !chat.messages.every(isChatMessage)) throw new Error("Ein gespeicherter Chat ist beschädigt.");
    return { id: chat.id, title: chat.title.slice(0, 100), updatedAt: chat.updatedAt, pinned: chat.pinned === true, messages: chat.messages.map(cleanMessage), ...(chat.websiteMode === true ? { websiteMode: true } : {}), ...(typeof chat.websiteProjectId === "string" ? { websiteProjectId: chat.websiteProjectId } : {}) };
  });
  const projects = data.projects.map((p) => {
    if (!p || typeof p.id !== "string" || typeof p.name !== "string" || typeof p.html !== "string" || p.html.length > 300_000 || typeof p.prompt !== "string" || !Number.isFinite(p.updatedAt)) throw new Error("Ein gespeichertes Projekt ist beschädigt.");
    return { id: p.id, name: p.name.slice(0, 100), html: p.html, prompt: p.prompt.slice(0, 8000), updatedAt: p.updatedAt, versions: Array.isArray(p.versions) ? p.versions.filter((v) => v && typeof v.html === "string" && v.html.length <= 300_000 && typeof v.prompt === "string" && Number.isFinite(v.createdAt)).slice(0, 8).map((v) => ({ html: v.html, prompt: v.prompt.slice(0, 8000), createdAt: v.createdAt })) : [] };
  });
  if (new Set(chats.map((c) => c.id)).size !== chats.length || new Set(projects.map((p) => p.id)).size !== projects.length) throw new Error("Die Sicherung enthält doppelte Kennungen.");
  const s = data.settings;
  const settings: Settings = { name: typeof s?.name === "string" ? s.name.slice(0, 80) : "", instructions: typeof s?.instructions === "string" ? s.instructions.slice(0, 3000) : "", tone: ["normal", "short", "detailed"].includes(s?.tone || "") ? s!.tone : "normal", theme: ["light", "dark", "system"].includes(s?.theme || "") ? s!.theme : "light", memoryEnabled: s?.memoryEnabled !== false };
  return { version: 1, chats, projects, memories: [...new Set(data.memories.filter((m): m is string => typeof m === "string" && m.trim().length > 0).map((m) => m.trim().slice(0, 500)))], settings };
}
export function mergeWorkspace(current: Workspace, incoming: Workspace): Workspace {
  // Import as copies: an imported ID never overwrites an existing conversation or project.
  // Remap even deleted project references so an imported chat cannot edit an unrelated project.
  const projectIds = new Map<string, string>();
  function remap(id: string) { if (!projectIds.has(id)) projectIds.set(id, makeId()); return projectIds.get(id)!; }
  const projects = [...incoming.projects.map((project) => ({ ...project, id: remap(project.id), name: `${project.name} (importiert)` })), ...current.projects];
  const chats = [...incoming.chats.map((chat) => ({ ...chat, id: makeId(), title: `${chat.title} (importiert)`, ...(chat.websiteProjectId ? { websiteProjectId: remap(chat.websiteProjectId) } : {}), messages: chat.messages.map((message) => ({ ...message, ...(message.website ? { website: { ...message.website, projectId: remap(message.website.projectId) } } : {}) })) })), ...current.chats];
  if (chats.length > 500 || projects.length > 100) throw new Error("Zu viele Einträge. Exportiere und entferne zuerst ältere Einträge.");
  return { ...current, chats, projects, memories: [...new Set([...current.memories, ...incoming.memories])].slice(0, 100) };
}
export function chatMarkdown(chat: Chat) {
  return `# ${chat.title}\n\n${chat.messages.map((m) => `## ${m.role === "user" ? "Du" : "KI-Chat"}\n\n${m.content}${m.attachments?.length ? `\n\nAnhänge: ${m.attachments.map((a) => a.name).join(", ")}` : ""}${m.sources?.length ? `\n\nQuellen:\n${m.sources.map((s) => `- [${s.title}](${s.url})`).join("\n")}` : ""}`).join("\n\n---\n\n")}`;
}
