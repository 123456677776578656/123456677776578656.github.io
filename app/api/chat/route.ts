import { NextResponse } from "next/server";

export const runtime = "edge";
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
    const body = await request.json() as { apiKey?: unknown; mode?: unknown; memory?: unknown; messages?: Message[] };
    const apiKey = typeof body.apiKey === "string" ? body.apiKey.trim() : "";
    const geminiKey = process.env.GEMINI_API_KEY?.trim() || "";
    if (!geminiKey && apiKey.length < 20) return json({ error: "Bitte gib einen gültigen API-Schlüssel ein." }, 401);
    const messages = Array.isArray(body.messages) ? body.messages.slice(-12) : [];
    if (!messages.length || messages.some((m) => !["user", "assistant"].includes(m.role) || typeof m.content !== "string" || !m.content.trim() || m.content.length > 8000)) return json({ error: "Bitte sende eine gültige Nachricht." }, 400);

    const websiteMode = body.mode === "website";
    const memory = typeof body.memory === "string" ? body.memory.trim().slice(0, 4000) : "";
    const instruction = websiteMode
      ? "Du bist Codex Studio, ein erfahrener Webdesigner. Erstelle anhand der Beschreibung eine vollständige, moderne und responsive Webseite als EINE einzelne HTML-Datei mit eingebettetem CSS und JavaScript. Verwende keine externen Bibliotheken, keine Markdown-Codeblöcke und keine Erklärungen. Antworte ausschließlich mit dem HTML, beginnend mit <!doctype html>."
      : "Du bist ein hilfreicher, präziser Assistent. Antworte standardmäßig auf Deutsch, klar gegliedert und ohne unnötige Wiederholungen.";

    if (geminiKey) {
      const response = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent", {
        method: "POST",
        headers: { "x-goog-api-key": geminiKey, "Content-Type": "application/json" },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: `${instruction}${memory ? `\n\nDauerhafte Hinweise und Vorlieben des Nutzers:\n${memory}` : ""}` }] },
          contents: messages.map((message) => ({ role: message.role === "assistant" ? "model" : "user", parts: [{ text: message.content }] })),
          generationConfig: { temperature: 0.7, maxOutputTokens: websiteMode ? 5000 : 1600 },
        }),
        signal: AbortSignal.timeout(45_000),
      });
      const data = await response.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
      if (!response.ok) {
        const error = response.status === 401 || response.status === 403 ? "Der Gemini-Schlüssel wurde nicht akzeptiert. Bitte überprüfe ihn in Vercel." : response.status === 429 ? "Das kostenlose Gemini-Limit ist erreicht. Bitte versuche es später erneut." : "Die KI konnte gerade nicht antworten. Bitte versuche es erneut.";
        return json({ error }, response.status === 429 ? 429 : response.status === 401 || response.status === 403 ? 401 : 502);
      }
      let answer = data.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("").trim();
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
