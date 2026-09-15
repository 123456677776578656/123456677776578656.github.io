export class InputError extends Error { constructor(message: string, public status = 400) { super(message); } }
export function checkOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return;
  const url = new URL(request.url);
  const host = request.headers.get("host") || url.host;
  const protocol = request.headers.get("x-forwarded-proto")?.split(",")[0].trim() || url.protocol.slice(0, -1);
  if (origin !== `${protocol}://${host}`) throw new InputError("Diese Anfrage ist nicht erlaubt.", 403);
}
export async function readJson(request: Request, limit: number): Promise<Record<string, unknown>> {
  if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) throw new InputError("Ungültiger Inhaltstyp.", 415);
  if (Number(request.headers.get("content-length") || 0) > limit) throw new InputError("Die Anfrage ist zu groß.", 413);
  const reader = request.body?.getReader();
  if (!reader) throw new InputError("Die Anfrage ist leer.");
  const chunks: Uint8Array[] = []; let length = 0;
  try { while (true) { const { done, value } = await reader.read(); if (done) break; length += value.byteLength; if (length > limit) { await reader.cancel(); throw new InputError("Die Anfrage ist zu groß. Verwende weniger oder kleinere Anhänge.", 413); } chunks.push(value); } }
  finally { reader.releaseLock(); }
  let parsed: unknown;
  try { parsed = JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { throw new InputError("Die Anfrage konnte nicht gelesen werden."); }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new InputError("Ungültige Anfrage.");
  return parsed as Record<string, unknown>;
}
