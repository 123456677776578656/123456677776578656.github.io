// Handles transport chunks split inside UTF-8 characters or SSE frames.
export async function* readEvents(stream: ReadableStream<Uint8Array>): AsyncGenerator<Record<string, unknown>> {
  const reader = stream.getReader(); const decoder = new TextDecoder(); let buffer = "";
  function parse(frame: string) {
    const data = frame.split("\n").filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trimStart()).join("\n").trim();
    if (!data || data === "[DONE]") return;
    const result: unknown = JSON.parse(data);
    if (!result || typeof result !== "object" || Array.isArray(result)) throw new Error("Ungültige Streaming-Antwort.");
    return result as Record<string, unknown>;
  }
  try {
    while (true) {
      const { done, value } = await reader.read();
      buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });
      buffer = buffer.replace(/\r\n/g, "\n");
      if (buffer.length > 5_000_000) throw new Error("Die Streaming-Antwort ist zu groß.");
      let end;
      while ((end = buffer.indexOf("\n\n")) !== -1) { const event = parse(buffer.slice(0, end)); buffer = buffer.slice(end + 2); if (event) yield event; }
      if (done) { if (buffer.trim()) { const event = parse(buffer); if (event) yield event; } break; }
    }
  } finally { await reader.cancel().catch(() => undefined); reader.releaseLock(); }
}
