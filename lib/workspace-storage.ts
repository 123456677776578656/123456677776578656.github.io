import { EMPTY_WORKSPACE, isChatMessage, makeId, parseWorkspace, type Workspace } from "./workspace";
function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("ki-chat-workspace", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("workspace");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("Bitte schließe andere geöffnete Tabs dieser Seite."));
  });
}
export async function saveWorkspace(workspace: Workspace): Promise<void> {
  const db = await database();
  try { await new Promise<void>((resolve, reject) => { const tx = db.transaction("workspace", "readwrite"); tx.objectStore("workspace").put(workspace, "current"); tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error); }); }
  finally { db.close(); }
}
export async function loadWorkspace(): Promise<Workspace> {
  const db = await database();
  let stored: unknown;
  try { stored = await new Promise((resolve, reject) => { const tx = db.transaction("workspace", "readonly"); const read = tx.objectStore("workspace").get("current"); tx.oncomplete = () => resolve(read.result); tx.onerror = () => reject(tx.error); }); }
  finally { db.close(); }
  if (stored) return parseWorkspace(stored);
  // Keep old storage untouched until the new database write has succeeded.
  const legacy = (key: string): unknown => { try { return JSON.parse(localStorage.getItem(key) || "null"); } catch { return null; } };
  const messages = legacy("ki-chat-messages");
  const projects = legacy("ki-chat-projects");
  const memories = legacy("ki-chat-memory");
  const migrated = parseWorkspace({ ...EMPTY_WORKSPACE, chats: Array.isArray(messages) && messages.some(isChatMessage) ? [{ id: makeId(), title: "Bisheriger Chat", updatedAt: Date.now(), messages: messages.filter(isChatMessage) }] : [], projects: Array.isArray(projects) ? projects : [], memories: Array.isArray(memories) ? memories : [] });
  await saveWorkspace(migrated);
  return migrated;
}
