// Shared by the backend and model display so they always use the same version.
export const GEMINI_MODEL = "gemini-3.6-flash";
export const GEMINI_MODEL_LABEL = "Gemini 3.6 Flash";

export const GEMINI_IMAGE_MODEL = "gemini-3.1-flash-lite-image";
export const GEMINI_IMAGE_MODEL_LABEL = "Nano Banana 2 Lite";
export const IMAGE_RATIOS = ["1:1", "16:9", "9:16"] as const;
export type ImageRatio = (typeof IMAGE_RATIOS)[number];
export const IMAGE_STYLES = [
  { id: "auto", label: "Automatisch", instruction: "Wähle einen passenden Bildstil." },
  { id: "photo", label: "Foto", instruction: "Fotorealistische Aufnahme mit natürlichem Licht und feinen Details." },
  { id: "illustration", label: "Illustration", instruction: "Hochwertige Illustration mit klaren Formen und harmonischen Farben." },
  { id: "3d", label: "3D", instruction: "Dreidimensionale Szene mit plastischen Materialien und weichem Studiolicht." },
  { id: "watercolor", label: "Aquarell", instruction: "Handgemalte Aquarellillustration mit sanften Farbverläufen und Papierstruktur." },
] as const;
export type ImageStyle = (typeof IMAGE_STYLES)[number]["id"];
