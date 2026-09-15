import { NextResponse } from "next/server";
import { GEMINI_IMAGE_MODEL, IMAGE_RATIOS, IMAGE_STYLES } from "../../../lib/ai-config";
import { isAttachment, MAX_FILE_BYTES } from "../../../lib/workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_BODY_BYTES = 3_000_000;
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

function matchesImage(image: Buffer, mimeType: string) {
  if (mimeType === "image/png") return image.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (mimeType === "image/jpeg") return image[0] === 255 && image[1] === 216 && image[2] === 255;
  return mimeType === "image/webp" && image.toString("ascii", 0, 4) === "RIFF" && image.toString("ascii", 8, 12) === "WEBP";
}

function error(message: string, status: number, code: string) {
  return NextResponse.json({ error: message, code }, { status, headers: { "Cache-Control": "no-store" } });
}

type ImagePart = {
  thought?: boolean;
  inlineData?: { mimeType?: string; data?: string };
  inline_data?: { mime_type?: string; data?: string };
};
type ImageResponse = {
  candidates?: Array<{ finishReason?: string; content?: { parts?: ImagePart[] } }>;
  promptFeedback?: { blockReason?: string };
  error?: { message?: string; status?: string };
};

export async function POST(request: Request) {
  try {
    const origin = request.headers.get("origin");
    if (origin) {
      // Next.js may use its internal bind address in request.url behind a proxy.
      // Browsers cannot override Host; use it to validate the actual public origin.
      const requestUrl = new URL(request.url);
      const host = request.headers.get("host") || requestUrl.host;
      const protocol = request.headers.get("x-forwarded-proto")?.split(",")[0].trim() || requestUrl.protocol.slice(0, -1);
      if (origin !== `${protocol}://${host}`) return error("Diese Anfrage ist nicht erlaubt.", 403, "ORIGIN_MISMATCH");
    }
    if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) return error("Bitte sende eine Bildbeschreibung.", 415, "INVALID_CONTENT_TYPE");
    if (Number(request.headers.get("content-length") || 0) > MAX_BODY_BYTES) return error("Die Bildbeschreibung ist zu groß.", 413, "REQUEST_TOO_LARGE");
    const reader = request.body?.getReader();
    if (!reader) return error("Bitte beschreibe dein Bild.", 400, "INVALID_REQUEST");
    const chunks: Uint8Array[] = [];
    let byteLength = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        byteLength += value.byteLength;
        if (byteLength > MAX_BODY_BYTES) {
          await reader.cancel();
          return error("Die Bildbeschreibung ist zu groß.", 413, "REQUEST_TOO_LARGE");
        }
        chunks.push(value);
      }
    } finally { reader.releaseLock(); }
    let body: unknown;
    try { body = JSON.parse(Buffer.concat(chunks).toString("utf8")); }
    catch { return error("Die Anfrage konnte nicht gelesen werden.", 400, "INVALID_REQUEST"); }
    if (!body || typeof body !== "object" || Array.isArray(body)) return error("Bitte beschreibe dein Bild.", 400, "INVALID_REQUEST");
    const input = body as Record<string, unknown>;
    if (!input.reference && byteLength > 48_000) return error("Die Bildbeschreibung ist zu groß.", 413, "REQUEST_TOO_LARGE");
    let reference: { inlineData: { mimeType: string; data: string } } | undefined;
    if (input.reference !== undefined) {
      if (!isAttachment(input.reference) || !IMAGE_TYPES.has(input.reference.mimeType)) return error("Bitte lade ein PNG-, JPEG- oder WebP-Bild mit höchstens 2 MB hoch.", 400, "INVALID_REFERENCE");
      const original = Buffer.from(input.reference.data, "base64");
      if (original.length !== input.reference.size || original.length > MAX_FILE_BYTES || !matchesImage(original, input.reference.mimeType)) return error("Das hochgeladene Bildformat ist ungültig.", 400, "INVALID_REFERENCE");
      reference = { inlineData: { mimeType: input.reference.mimeType, data: input.reference.data } };
    }
    const prompt = typeof input.prompt === "string" ? input.prompt.trim() : "";
    if (!prompt || prompt.length > 4000) return error("Beschreibe dein Bild mit höchstens 4.000 Zeichen.", 400, "INVALID_PROMPT");
    const aspectRatio = input.aspectRatio ?? "1:1";
    if (!IMAGE_RATIOS.some((ratio) => ratio === aspectRatio)) return error("Bitte wähle ein gültiges Bildformat.", 400, "INVALID_FORMAT");
    const style = IMAGE_STYLES.find((item) => item.id === (input.style ?? "auto"));
    if (!style) return error("Bitte wähle einen gültigen Bildstil.", 400, "INVALID_STYLE");
    // Image generation has no free API tier. Never initiate it without this acknowledgement.
    if (input.billingAcknowledged !== true) return error("Bitte bestätige zuerst den Kostenhinweis für Google-Bilder.", 428, "BILLING_ACKNOWLEDGEMENT_REQUIRED");
    const apiKey = process.env.GEMINI_API_KEY?.trim();
    if (!apiKey) return error("Für Bilder muss der Gemini-Schlüssel auf dem Server eingerichtet sein.", 503, "GEMINI_NOT_CONFIGURED");
    const memory = typeof input.memory === "string" ? input.memory.trim().slice(0, 4000) : "";
    const response = await fetch(`https://generativelanguage.googleapis.com/v1/models/${GEMINI_IMAGE_MODEL}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [...(reference ? [reference] : []), { text: `${reference ? "Bearbeite das bereitgestellte Bild entsprechend der Beschreibung. Erhalte alle nicht ausdrücklich zu ändernden Inhalte. Gib genau ein fertiges Bild zurück." : "Erstelle genau ein fertiges Bild."} ${style.instruction}${memory ? `\nGemerkte Gestaltungswünsche:\n${memory}` : ""}\n\n${reference ? "Gewünschte Änderung" : "Bildbeschreibung"}:\n${prompt}` }] }],
        generationConfig: {
          responseModalities: ["IMAGE"],
          responseFormat: { image: { aspectRatio, imageSize: "1K" } },
          thinkingConfig: { thinkingLevel: "minimal" },
          maxOutputTokens: 4096,
        },
      }),
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(50_000)]),
    });
    const data = await response.json().catch(() => ({})) as ImageResponse;
    if (!response.ok) {
      console.error("[api/images] Google request failed", { status: response.status, model: GEMINI_IMAGE_MODEL });
      if ([400, 402, 403].includes(response.status) && /billing|paid tier|payment|billable/i.test(data.error?.message || "")) return error("Google verlangt für Bilder eine aktive API-Abrechnung. Öffne dein Projekt in Google AI Studio und prüfe dort die Abrechnung.", 402, "BILLING_REQUIRED");
      if (response.status === 401 || response.status === 403) return error("Google erlaubt diesem Schlüssel keine Bilderstellung. Prüfe die Schlüsselberechtigungen und die API-Abrechnung in Google AI Studio.", 403, "IMAGE_ACCESS_DENIED");
      if (response.status === 429) return error("Google hat das Bildkontingent erreicht oder noch kein Kontingent freigegeben. Prüfe API-Abrechnung und Limits in Google AI Studio.", 429, "IMAGE_QUOTA_EXCEEDED");
      if (response.status === 404) return error("Google stellt das Bildmodell für dieses Konto noch nicht bereit. Die Modellfreigabe muss geprüft werden.", 502, "IMAGE_MODEL_UNAVAILABLE");
      return error("Google konnte gerade kein Bild erstellen. Bitte versuche es später erneut.", 502, "IMAGE_PROVIDER_ERROR");
    }
    const candidate = data.candidates?.[0];
    if (data.promptFeedback?.blockReason || ["SAFETY", "IMAGE_SAFETY", "PROHIBITED_CONTENT", "BLOCKLIST", "RECITATION"].includes(candidate?.finishReason || "")) return error("Google konnte zu dieser Beschreibung kein Bild freigeben. Bitte formuliere sie anders.", 422, "IMAGE_BLOCKED");
    if (candidate?.finishReason === "MAX_TOKENS") return error("Google hat das Bild nicht vollständig erstellt. Bitte vereinfache die Beschreibung.", 502, "IMAGE_INCOMPLETE");
    const part = candidate?.content?.parts?.find((item) => !item.thought && (item.inlineData?.data || item.inline_data?.data));
    const mimeType = part?.inlineData?.mimeType || part?.inline_data?.mime_type || "";
    const encoded = part?.inlineData?.data || part?.inline_data?.data || "";
    if (!IMAGE_TYPES.has(mimeType) || !encoded || encoded.length > Math.ceil(MAX_IMAGE_BYTES / 3) * 4 || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) return error("Google hat kein verwendbares Bild geliefert. Bitte ändere die Beschreibung und versuche es erneut.", 502, "NO_IMAGE_RETURNED");
    const image = Buffer.from(encoded, "base64");
    if (image.byteLength > MAX_IMAGE_BYTES || !matchesImage(image, mimeType)) return error("Das zurückgegebene Bildformat ist ungültig.", 502, "INVALID_IMAGE");
    return new Response(new Uint8Array(image), {
      headers: { "Content-Type": mimeType, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "X-Image-Model": GEMINI_IMAGE_MODEL },
    });
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === "TimeoutError") return error("Die Bilderstellung dauert zu lange. Bitte versuche es später erneut.", 504, "IMAGE_TIMEOUT");
    if (request.signal.aborted) return error("Die Anfrage wurde abgebrochen.", 499, "IMAGE_CANCELLED");
    return error("Die Verbindung zu Google ist fehlgeschlagen. Bitte versuche es erneut.", 502, "IMAGE_CONNECTION_FAILED");
  }
}
