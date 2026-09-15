import { safeUrl, type Artifact, type Execution, type Source } from "./workspace";
export type GeminiPart = { thought?: boolean; text?: string; executableCode?: { language?: string; code?: string }; codeExecutionResult?: { outcome?: string; output?: string }; inlineData?: { mimeType?: string; data?: string } };
export type Grounding = { webSearchQueries?: string[]; searchEntryPoint?: { renderedContent?: string }; groundingChunks?: Array<{ web?: { uri?: string; title?: string } }>; groundingSupports?: Array<{ segment?: { endIndex?: number; text?: string }; groundingChunkIndices?: number[] }> };
export type GeminiResponse = { error?: { message?: string }; promptFeedback?: { blockReason?: string }; candidates?: Array<{ finishReason?: string; groundingMetadata?: Grounding; content?: { parts?: GeminiPart[] } }> };
export function assembleAnswer(parts: GeminiPart[], grounding?: Grounding) {
  let answer = parts.filter((part) => !part.thought).map((part) => part.text || "").join("").trim();
  const sources: Source[] = [];
  const sourceByIndex = new Map<number, Source>();
  grounding?.groundingChunks?.slice(0, 20).forEach((chunk, index) => { const url = safeUrl(chunk.web?.uri); if (url) { const source = { title: chunk.web?.title?.slice(0, 240) || new URL(url).hostname, url }; sources.push(source); sourceByIndex.set(index, source); } });
  // Match cited text rather than byte offsets, preserving non-ASCII characters.
  const inserts = new Map<number, Set<string>>();
  for (const support of grounding?.groundingSupports || []) {
    const segment = support.segment?.text;
    if (!segment) continue;
    const start = answer.indexOf(segment); if (start < 0) continue;
    const end = start + segment.length; const links = inserts.get(end) || new Set<string>();
    support.groundingChunkIndices?.forEach((index) => { const source = sourceByIndex.get(index); if (source) links.add(`[${sources.indexOf(source) + 1}](${source.url.replace(/\(/g, "%28").replace(/\)/g, "%29")})`); });
    inserts.set(end, links);
  }
  [...inserts.entries()].sort((a, b) => b[0] - a[0]).forEach(([end, links]) => { answer = answer.slice(0, end) + (links.size ? ` ${[...links].join(" ")}` : "") + answer.slice(end); });
  const executions: Execution[] = []; const artifacts: Artifact[] = [];
  for (const part of parts) {
    if (part.thought) continue;
    if (part.executableCode?.code && executions.length < 10) executions.push({ code: part.executableCode.code.slice(0, 30000), output: "", outcome: "NOT_REPORTED" });
    if (part.codeExecutionResult) { const last = executions[executions.length - 1]; if (last) { last.output = (part.codeExecutionResult.output || "").slice(0, 30000); last.outcome = part.codeExecutionResult.outcome || "NOT_REPORTED"; } }
    const image = part.inlineData;
    if (image?.data && image.mimeType && ["image/png", "image/jpeg", "image/webp"].includes(image.mimeType) && image.data.length <= 1_500_000 && /^[A-Za-z0-9+/]+={0,2}$/.test(image.data) && artifacts.length < 2) artifacts.push({ mimeType: image.mimeType, data: image.data });
  }
  if (!answer && executions.length) answer = executions.every((item) => item.outcome === "OUTCOME_OK") ? "Die Berechnung ist abgeschlossen. Das Ergebnis findest du unter „Python-Ausführung“." : "Die Berechnung wurde nicht vollständig erfolgreich ausgeführt. Details findest du unter „Python-Ausführung“.";
  if (!answer && artifacts.length) answer = "Die erstellte Grafik findest du unter dieser Antwort.";
  return { answer, ...(sources.length ? { sources } : {}), ...(executions.length ? { executions } : {}), ...(artifacts.length ? { artifacts } : {}), ...(grounding?.searchEntryPoint?.renderedContent ? { searchHtml: grounding.searchEntryPoint.renderedContent.slice(0, 40000) } : {}) };
}
