import { FILE_ACCEPT, FILE_TYPES, MAX_FILE_BYTES, makeId, type Attachment } from "./workspace";
export async function readAttachment(file: File): Promise<Attachment> {
  if (!file.size || file.size > MAX_FILE_BYTES) throw new Error(`${file.name}: maximal 2 MB pro Datei.`);
  const extension = file.name.toLowerCase().split(".").pop() || "";
  if (!FILE_ACCEPT.split(",").includes(`.${extension}`)) throw new Error(`${file.name}: Dieses Dateiformat wird noch nicht unterstützt.`);
  const mimeType = ({ png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", pdf: "application/pdf", csv: "text/csv", json: "application/json" } as Record<string, string>)[extension] || "text/plain";
  if (!FILE_TYPES.includes(mimeType)) throw new Error("Dieses Dateiformat ist nicht erlaubt.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  if ((mimeType.startsWith("text/") || mimeType === "application/json") && (bytes.length > 200_000 || bytes.includes(0))) throw new Error(`${file.name}: Textdateien dürfen bis zu 200 KB groß sein und müssen als UTF-8 vorliegen.`);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return { id: makeId(), name: file.name.slice(0, 180), mimeType, size: bytes.length, data: btoa(binary) };
}
export function downloadText(name: string, content: string, mimeType = "text/plain;charset=utf-8") {
  const url = URL.createObjectURL(new Blob([content], { type: mimeType }));
  const link = document.createElement("a"); link.href = url; link.download = name; link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
