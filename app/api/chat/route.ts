import { NextResponse } from "next/server";
import { GEMINI_MODEL } from "../../../lib/ai-config";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";
type Message = { role: "user" | "assistant"; content: string };

function json(body: object, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  try {
    if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) return json({ error: "Ungültiger Inhaltstyp." }, 415);
    const contentLength = Number(request.headers.get("content-length") || 0);
    if (contentLength > 110_000) return json({ error: "Die Anfrage ist zu groß." }, 413);
    const rawBody: unknown = await request.json();
    if (!rawBody || typeof rawBody !== "object" || Array.isArray(rawBody)) return json({ error: "Bitte sende eine gültige Nachricht." }, 400);
    const body = rawBody as { apiKey?: unknown; mode?: unknown; memory?: unknown; messages?: Message[] };
    const apiKey = typeof body.apiKey === "string" ? body.apiKey.trim() : "";
    const geminiKey = process.env.GEMINI_API_KEY?.trim() || "";
    if (!geminiKey && apiKey.length < 20) return json({ error: "Bitte gib einen gültigen API-Schlüssel ein." }, 401);
    const messages = Array.isArray(body.messages) ? body.messages.slice(-12) : [];
    if (!messages.length || messages.some((m) => !m || !["user", "assistant"].includes(m.role) || typeof m.content !== "string" || !m.content.trim() || m.content.length > 8000) || messages[messages.length - 1].role !== "user") return json({ error: "Bitte sende eine gültige Nachricht." }, 400);

    const websiteMode = body.mode === "website";
    const memory = typeof body.memory === "string" ? body.memory.trim().slice(0, 4000) : "";
    const instruction = websiteMode
      ? "Du bist Codex Studio, ein erfahrener Webdesigner. Erstelle anhand der Beschreibung eine vollständige, moderne und responsive Webseite als EINE einzelne HTML-Datei mit eingebettetem CSS und JavaScript. Verwende keine externen Bibliotheken, keine Markdown-Codeblöcke und keine Erklärungen. Antworte ausschließlich mit dem HTML, beginnend mit <!doctype html>."
      : "Du bist ein hilfreicher, präziser Assistent. Antworte standardmäßig auf Deutsch, klar gegliedert und ohne unnötige Wiederholungen.";

    if (geminiKey) {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`, {
        method: "POST",
        headers: { "x-goog-api-key": geminiKey, "Content-Type": "application/json" },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: `${instruction}${memory ? `\n\nDauerhafte Hinweise und Vorlieben des Nutzers:\n${memory}` : ""}` }] },
          contents: messages.map((message) => ({ role: message.role === "assistant" ? "model" : "user", parts: [{ text: message.content }] })),
          generationConfig: {
            maxOutputTokens: websiteMode ? 8192 : 4096,
            thinkingConfig: { thinkingLevel: "low" },
          },
        }),
        signal: AbortSignal.timeout(45_000),
      });
      const data = await response.json() as { candidates?: Array<{ finishReason?: string; content?: { parts?: Array<{ text?: string; thought?: boolean }> } }>; error?: { message?: string; status?: string } };
      if (!response.ok) {
        const detail = typeof data.error?.message === "string" ? data.error.message.split(geminiKey).join("[Schlüssel verborgen]").replace(/AIza[\w-]+/g, "[Schlüssel verborgen]").slice(0, 280) : "";
        console.error("[api/chat] Gemini request failed", { status: response.status, model: GEMINI_MODEL, detail });
        if (response.status === 404) return json({ error: `Google stellt ${GEMINI_MODEL} für dieses Konto nicht bereit. Die Modellkonfiguration muss aktualisiert werden.`, code: "GEMINI_MODEL_UNAVAILABLE" }, 502);
        const error = response.status === 400 ? `Gemini hat die Anfrage abgelehnt.${detail ? ` ${detail}` : ""}` : response.status === 401 || response.status === 403 ? `Der Gemini-Zugriff wurde abgelehnt.${detail ? ` ${detail}` : " Bitte überprüfe den Schlüssel in Vercel."}` : response.status === 429 ? "Das Gemini-Anfragelimit ist erreicht. Bitte versuche es später erneut; dein aktuelles Limit findest du in Google AI Studio." : `Die KI konnte gerade nicht antworten (Fehler ${response.status}).${detail ? ` ${detail}` : ""}`;
        return json({ error }, response.status === 429 ? 429 : response.status === 401 || response.status === 403 ? 401 : 502);
      }
      const candidate = data.candidates?.[0];
      if (websiteMode && candidate?.finishReason === "MAX_TOKENS") return json({ error: "Die Webseite war für eine Antwort zu lang. Beschreibe zuerst eine kleinere Seite; dein gespeichertes Projekt bleibt erhalten." }, 502);
      let answer = candidate?.content?.parts?.filter((part) => !part.thought).map((part) => part.text || "").join("").trim();
      if (websiteMode && answer) answer = answer.replace(/^```(?:html)?\s*/i, "").replace(/\s*```$/, "").trim();
      if (!answer) return json({ error: "Die KI hat keine Antwort geliefert." }, 502);
      return json({ answer });
    }

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [
          { role: "system", content: instruction },
          ...(memory ? [{ role: "system", content: `Dauerhafte Hinweise und Vorlieben des Nutzers:\n${memory}` }] : []),
          ...messages,
        ],
        temperature: 0.7,
        max_tokens: websiteMode ? 5000 : 1600,
      }),
      signal: AbortSignal.timeout(45_000),
    });
    const data = await response.json() as { choices?: Array<{ message?: { content?: string } }>; error?: { message?: string } };
    if (!response.ok) {
      const error = response.status === 401 ? "Der API-Schlüssel wurde nicht akzeptiert. Bitte überprüfe ihn." : response.status === 429 ? "Zu viele Anfragen oder dein Guthaben ist aufgebraucht." : "Die KI konnte gerade nicht antworten. Bitte versuche es erneut.";
      return json({ error }, response.status === 401 ? 401 : response.status === 429 ? 429 : 502);
    }
    let answer = data.choices?.[0]?.message?.content;
    if (websiteMode && answer) answer = answer.replace(/^```(?:html)?\s*/i, "").replace(/\s*```$/, "").trim();
    if (!answer) return json({ error: "Die KI hat keine Antwort geliefert." }, 502);
    return json({ answer });
  } catch (cause) {
    const timedOut = cause instanceof DOMException && cause.name === "TimeoutError";
    return json({ error: timedOut ? "Die Antwort dauert zu lange. Bitte versuche es erneut." : "Die Anfrage konnte nicht verarbeitet werden." }, timedOut ? 504 : 500);
  }
}
