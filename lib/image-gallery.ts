import { IMAGE_RATIOS, IMAGE_STYLES, type ImageRatio, type ImageStyle } from "./ai-config";

export type SavedImage = {
  id: string;
  prompt: string;
  style: ImageStyle;
  aspectRatio: ImageRatio;
  createdAt: number;
  blob: Blob;
};

const DATABASE = "ki-chat-image-gallery";
const STORE = "images";

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!window.indexedDB) return reject(new Error("Der Browser unterstützt die Bildergalerie nicht."));
    const request = window.indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE, { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("Die Bildergalerie ist in einem anderen Tab geöffnet."));
  });
}

function isSavedImage(value: unknown): value is SavedImage {
  if (!value || typeof value !== "object") return false;
  const image = value as Partial<SavedImage>;
  return typeof image.id === "string" && typeof image.prompt === "string" &&
    typeof image.createdAt === "number" && Number.isFinite(image.createdAt) &&
    IMAGE_RATIOS.some((ratio) => ratio === image.aspectRatio) && IMAGE_STYLES.some((style) => style.id === image.style) &&
    image.blob instanceof Blob && ["image/png", "image/jpeg", "image/webp"].includes(image.blob.type);
}

export async function listSavedImages(): Promise<SavedImage[]> {
  const database = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE, "readonly");
      const request = transaction.objectStore(STORE).getAll();
      transaction.oncomplete = () => resolve((request.result as unknown[]).filter(isSavedImage).sort((a, b) => b.createdAt - a.createdAt));
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  } finally { database.close(); }
}

export async function saveImage(image: SavedImage): Promise<void> {
  const database = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE, "readwrite");
      transaction.objectStore(STORE).put(image);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  } finally { database.close(); }
}

export async function removeImage(id: string): Promise<void> {
  const database = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE, "readwrite");
      transaction.objectStore(STORE).delete(id);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  } finally { database.close(); }
}
