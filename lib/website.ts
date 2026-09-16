import type { Project } from "./workspace";

export function completeWebsite(value: string): string {
  const html = value.replace(/^```(?:html)?\s*/i, "").replace(/\s*```$/, "").trim();
  if (html.length > 250000) throw new Error("Die Webseite ist zu groß. Bitte beschreibe eine kleinere Änderung. Dein bisheriger Stand bleibt erhalten.");
  if (!/^(?:(?:<!doctype\s+html[^>]*>|<!--[\s\S]*?-->)\s*)*<html[\s>]/i.test(html) || !/<\/html\s*>\s*$/i.test(html)) throw new Error("Die KI hat keine vollständige HTML-Seite geliefert. Dein bisheriger Stand bleibt erhalten. Bitte versuche es erneut.");
  return html;
}

// A separate, opaque iframe origin keeps generated JavaScript away from chats and keys.
// The policy is inserted first so generated markup cannot loosen it with another CSP.
export function websitePreview(html: string): string {
  return `<!doctype html><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline' https:; img-src https: data: blob:; font-src https: data:; connect-src 'none'; form-action 'none'; base-uri 'none'; frame-src 'none'; object-src 'none'"><meta name="viewport" content="width=device-width, initial-scale=1">${html.replace(/<!doctype[^>]*>/i, "")}`;
}

export function websiteName(html: string, fallback: string): string {
  const title = /<title\b[^>]*>([\s\S]*?)<\/title\s*>/i.exec(html)?.[1];
  return (title?.replace(/<[^>]*>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').trim() || fallback.trim() || "Meine Webseite").slice(0, 80);
}

export function updateWebsite(project: Project, html: string, prompt: string): Project {
  const versions = project.html && project.html !== html ? [{ html: project.html, prompt: project.prompt, createdAt: project.updatedAt }, ...(project.versions || [])].slice(0, 8) : project.versions || [];
  return { ...project, html, prompt: prompt.slice(0, 8000), updatedAt: Date.now(), versions };
}
