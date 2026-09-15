"use client";

/* eslint-disable @next/next/no-img-element -- Generated images use local Blob URLs, not a remote image loader. */
import { FormEvent, useEffect, useRef, useState } from "react";
import { ArrowDownToLine, Check, ImagePlus, LoaderCircle, RotateCcw, Sparkles, Square, Trash2 } from "lucide-react";
import { IMAGE_RATIOS, IMAGE_STYLES, type ImageRatio, type ImageStyle } from "../lib/ai-config";
import { listSavedImages, removeImage, saveImage, type SavedImage } from "../lib/image-gallery";

type GalleryImage = SavedImage & { url: string; saved: boolean };
const RATIO_NAMES: Record<ImageRatio, string> = { "1:1": "Quadrat", "16:9": "Querformat", "9:16": "Hochformat" };
const IDEAS = [
  { label: "Ein Ort zum Träumen", prompt: "Ein kleines Haus am See, umgeben von Bergen. Früher Morgen, leichter Nebel über dem Wasser, warme Lichter in den Fenstern. Ruhige, verträumte Stimmung." },
  { label: "Eine neue Markenidee", prompt: "Ein minimalistisches Titelbild für ein kreatives Designstudio. Skulpturale Formen in Lavendel und warmem Orange, weiche Schatten, viel freier Raum für eine spätere Überschrift. Ohne Schrift." },
  { label: "Eine kleine Fantasiewelt", prompt: "Eine winzige gemütliche Buchhandlung im Inneren eines großen Baumstamms. Warme Lichter, geschwungene Regale und eine schlafende Katze. Liebevoll gestaltete Details." },
];

function filename(image: GalleryImage) {
  const extension = image.blob.type === "image/jpeg" ? "jpg" : image.blob.type === "image/webp" ? "webp" : "png";
  return `ki-bild-${image.id}.${extension}`;
}

export default function ImageStudio({ active, configured, memories }: { active: boolean; configured: boolean; memories: string[] }) {
  const [prompt, setPrompt] = useState("");
  const [style, setStyle] = useState<ImageStyle>("auto");
  const [aspectRatio, setAspectRatio] = useState<ImageRatio>("1:1");
  const [billingAcknowledged, setBillingAcknowledged] = useState(false);
  const [useMemory, setUseMemory] = useState(true);
  const [images, setImages] = useState<GalleryImage[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [galleryReady, setGalleryReady] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [storageNotice, setStorageNotice] = useState("");
  const controllerRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(false);
  const urlsRef = useRef(new Set<string>());
  const promptRef = useRef<HTMLTextAreaElement>(null);
  const selected = images.find((image) => image.id === selectedId);

  useEffect(() => {
    mountedRef.current = true;
    let current = true;
    const urls = urlsRef.current;
    void listSavedImages().then((saved) => {
      if (!current) return;
      const gallery = saved.map((image) => {
        const url = URL.createObjectURL(image.blob);
        urls.add(url);
        return { ...image, url, saved: true };
      });
      setImages((existing) => [...existing, ...gallery.filter((image) => !existing.some((item) => item.id === image.id))]);
      setSelectedId((id) => id ?? gallery[0]?.id ?? null);
    }).catch(() => {
      if (current) setStorageNotice("Die Galerie konnte nicht geöffnet werden. Neue Bilder kannst du trotzdem herunterladen; sie bleiben dann nur bis zum Schließen dieser Seite verfügbar.");
    }).finally(() => { if (current) setGalleryReady(true); });
    return () => {
      current = false;
      mountedRef.current = false;
      controllerRef.current?.abort();
      urls.forEach((url) => URL.revokeObjectURL(url));
      urls.clear();
    };
  }, []);

  async function generate(event: FormEvent) {
    event.preventDefault();
    const description = prompt.trim();
    if (!description || !configured || !billingAcknowledged || controllerRef.current) return;
    const controller = new AbortController();
    controllerRef.current = controller;
    setLoading(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/images", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: description, style, aspectRatio, billingAcknowledged, memory: useMemory ? memories.join("\n") : "" }),
        signal: controller.signal,
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(data.error || "Das Bild konnte nicht erstellt werden. Bitte versuche es später erneut.");
      }
      const blob = await response.blob();
      if (!["image/png", "image/jpeg", "image/webp"].includes(blob.type) || !blob.size) throw new Error("Die Antwort enthält kein verwendbares Bild.");
      if (!mountedRef.current || controller.signal.aborted) return;
      const image: SavedImage = { id: crypto.randomUUID(), prompt: description, style, aspectRatio, createdAt: Date.now(), blob };
      const url = URL.createObjectURL(blob);
      urlsRef.current.add(url);
      setImages((items) => [{ ...image, url, saved: false }, ...items]);
      setSelectedId(image.id);
      try {
        await saveImage(image);
        if (mountedRef.current) {
          setImages((items) => items.map((item) => item.id === image.id ? { ...item, saved: true } : item));
          setNotice("Dein Bild ist fertig und auf diesem Gerät gespeichert.");
        }
      } catch {
        if (mountedRef.current) setStorageNotice("Dein Bild ist fertig, aber der Browser konnte es nicht speichern. Lade es jetzt herunter, damit es beim Schließen der Seite nicht verloren geht.");
      }
    } catch (cause) {
      if (!mountedRef.current) return;
      if (controller.signal.aborted) setNotice("Anfrage abgebrochen. Google kann bereits begonnene Arbeit trotzdem berechnen.");
      else setError(cause instanceof Error ? cause.message : "Die Bilderstellung ist fehlgeschlagen.");
    } finally {
      if (controllerRef.current === controller) controllerRef.current = null;
      if (mountedRef.current) setLoading(false);
    }
  }

  async function deleteImage(image: GalleryImage) {
    try {
      if (image.saved) await removeImage(image.id);
      setImages((items) => items.filter((item) => item.id !== image.id));
      if (selectedId === image.id) setSelectedId(images.find((item) => item.id !== image.id)?.id ?? null);
      URL.revokeObjectURL(image.url); urlsRef.current.delete(image.url);
      setNotice("Bild aus der Galerie entfernt.");
    } catch { setStorageNotice("Das Bild konnte nicht gelöscht werden. Bitte versuche es erneut."); }
  }

  function reuse(image: GalleryImage) {
    setPrompt(image.prompt); setStyle(image.style); setAspectRatio(image.aspectRatio);
    promptRef.current?.focus();
  }

  return <section className="image-studio" hidden={!active} aria-label="Bilderstudio">
    <div className="image-studio-inner">
      <div className="image-intro"><div><span className="welcome-kicker">DEINE IDEEN. IN BILDERN.</span><h2>Mach deine Vorstellung sichtbar.</h2><p>Beschreibe dein Motiv. Wähle einen Stil. Erschaffe etwas Eigenes.</p></div><span className="image-resolution">1K <span>Auflösung</span></span></div>
      <div className="image-workspace">
        <form className="image-form" onSubmit={generate}>
          <div className="image-label-line"><label htmlFor="image-prompt">Was möchtest du sehen?</label><span>{prompt.length}/4000</span></div>
          <textarea ref={promptRef} id="image-prompt" value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="Ein Haus am See im sanften Morgenlicht, mit Bergen im Hintergrund …" maxLength={4000} rows={5} required disabled={loading}/>
          <div className="image-ideas" aria-label="Ideen für dein Bild">{IDEAS.map((idea) => <button type="button" key={idea.label} onClick={() => { setPrompt(idea.prompt); promptRef.current?.focus(); }} disabled={loading}>{idea.label}</button>)}</div>
          <fieldset disabled={loading}><legend>Bildstil</legend><div className="image-style-options">{IMAGE_STYLES.map((item) => <button type="button" key={item.id} aria-pressed={style === item.id} onClick={() => setStyle(item.id)}>{style === item.id && <Check size={13}/>} {item.label}</button>)}</div></fieldset>
          <fieldset disabled={loading}><legend>Format</legend><div className="image-ratio-options">{IMAGE_RATIOS.map((ratio) => <button type="button" key={ratio} aria-pressed={aspectRatio === ratio} onClick={() => setAspectRatio(ratio)}><span className={`ratio-shape ratio-${ratio.replace(":", "-")}`} aria-hidden="true"/><span>{RATIO_NAMES[ratio]}<small>{ratio}</small></span></button>)}</div></fieldset>
          {memories.length > 0 && <label className="image-checkbox"><input type="checkbox" checked={useMemory} onChange={(event) => setUseMemory(event.target.checked)} disabled={loading}/><span>Meine gemerkten Gestaltungswünsche berücksichtigen</span></label>}
          <div className="image-cost"><strong>Google-Bilder sind kostenpflichtig</strong><p>Ca. 0,034 US-Dollar pro Bild, zuzüglich Textkosten. Dafür benötigt dein Google-Projekt eine aktive API-Abrechnung. <a href="https://ai.google.dev/gemini-api/docs/pricing#gemini-3.1-flash-lite-image" target="_blank" rel="noreferrer">Preise ansehen</a></p><label className="image-checkbox"><input type="checkbox" checked={billingAcknowledged} onChange={(event) => setBillingAcknowledged(event.target.checked)} disabled={loading}/><span>Ich möchte kostenpflichtige Bilder erstellen.</span></label></div>
          {!configured && <p className="image-setup">Bilder sind verfügbar, sobald der Gemini-Schlüssel auf dem Server eingerichtet ist.</p>}
          <button className="image-generate" disabled={loading || !prompt.trim() || !configured || !billingAcknowledged || !galleryReady}>{loading ? <LoaderCircle size={18} className="image-spinner"/> : <Sparkles size={18}/>} {loading ? "Dein Bild entsteht …" : "Bild erstellen"}</button>
          {loading && <button type="button" className="image-cancel" onClick={() => controllerRef.current?.abort()}><Square size={12}/>Anfrage abbrechen</button>}
          <p className="image-key-note">Dein vorhandener Gemini-Schlüssel wird sicher auf dem Server verwendet.</p>
          {error && <div className="image-error" role="alert"><p>{error}</p><a href="https://aistudio.google.com/" target="_blank" rel="noreferrer">Google AI Studio öffnen</a></div>}
        </form>
        <div className="image-preview-card" aria-busy={loading}>
          <div className="image-preview-heading"><span><ImagePlus size={16}/>Dein Bild</span><span>{selected ? selected.aspectRatio : aspectRatio}</span></div>
          <div className={`image-preview ${loading ? "image-preview-loading" : ""}`}>
            {selected ? <img src={selected.url} alt={selected.prompt}/> : <div className="image-empty"><div className="image-empty-art" aria-hidden="true"><span/><i/><b/></div><ImagePlus size={26}/><h3>Hier beginnt deine Bildwelt.</h3><p>Dein erstelltes Bild erscheint hier.</p></div>}
            {loading && <div className="image-loading-overlay" role="status"><LoaderCircle size={28} className="image-spinner"/><strong>Aus Worten wird ein Bild</strong><span>Das kann einen Moment dauern.</span></div>}
          </div>
          {selected ? <div className="image-result-details"><p className="image-result-prompt">{selected.prompt}</p><div className="image-result-meta"><span>{selected.saved ? <><Check size={13}/>Auf diesem Gerät gespeichert</> : "Noch nicht dauerhaft gespeichert"}</span><span>{new Date(selected.createdAt).toLocaleDateString("de-DE")}</span></div><div className="image-result-actions"><a className="image-download" href={selected.url} download={filename(selected)}><ArrowDownToLine size={16}/>Bild herunterladen</a><button type="button" onClick={() => reuse(selected)} disabled={loading} title="Beschreibung und Einstellungen übernehmen"><RotateCcw size={15}/>Weiter gestalten</button></div></div> : <p className="image-preview-note">Deine Bilder werden automatisch in deiner Galerie auf diesem Gerät abgelegt.</p>}
        </div>
      </div>
      <p className="image-notice" role="status">{notice}</p>
      {storageNotice && <p className="image-storage-notice" role="alert">{storageNotice}</p>}
      <section className="image-gallery" aria-labelledby="image-gallery-title"><div className="image-gallery-heading"><div><h3 id="image-gallery-title">Meine Bilder <span>{images.length}</span></h3><p>Auf diesem Gerät gespeichert. Lade wichtige Bilder herunter – beim Löschen der Browserdaten geht die Galerie verloren.</p></div></div>
        {!galleryReady ? <p className="image-gallery-empty">Deine Galerie wird geladen …</p> : images.length ? <div className="image-gallery-grid">{images.map((image) => <article className={`image-tile ${selectedId === image.id ? "selected" : ""}`} key={image.id}><button className="image-tile-open" type="button" onClick={() => setSelectedId(image.id)} aria-label={`Bild öffnen: ${image.prompt}`} aria-pressed={selectedId === image.id}><img src={image.url} alt={image.prompt} loading="lazy"/><span>{image.prompt}</span></button><div className="image-tile-actions"><span>{image.saved ? image.aspectRatio : "Nicht gespeichert"}</span><a href={image.url} download={filename(image)} aria-label={`Bild herunterladen: ${image.prompt}`}><ArrowDownToLine size={16}/></a><button type="button" onClick={() => void deleteImage(image)} aria-label={`Bild löschen: ${image.prompt}`}><Trash2 size={15}/></button></div></article>)}</div> : <div className="image-gallery-empty"><ImagePlus size={20}/><span>Platz für deine nächsten Ideen. Dein erstes Bild wird hier gespeichert.</span></div>}
      </section>
    </div>
  </section>;
}
