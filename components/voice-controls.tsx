"use client";
import { useEffect, useRef, useState } from "react";
import { Mic, MicOff, Volume2, VolumeX } from "lucide-react";

type Recognition = { lang: string; continuous: boolean; interimResults: boolean; onresult: ((event: { results: { [index: number]: { [index: number]: { transcript: string }; isFinal: boolean }; length: number }; resultIndex: number }) => void) | null; onerror: ((event: { error: string }) => void) | null; onend: (() => void) | null; start(): void; stop(): void; abort(): void };
type SpeechWindow = Window & { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
export function VoiceInput({ onText, disabled, onNotice }: { onText: (text: string) => void; disabled: boolean; onNotice: (text: string) => void }) {
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<Recognition | null>(null);
  useEffect(() => () => { if (recognitionRef.current) { recognitionRef.current.onend = null; recognitionRef.current.onerror = null; recognitionRef.current.abort(); } }, []);
  function toggle() {
    if (listening) { recognitionRef.current?.stop(); return; }
    const Constructor = (window as SpeechWindow).SpeechRecognition || (window as SpeechWindow).webkitSpeechRecognition;
    if (!Constructor) { onNotice("Diktieren wird von diesem Browser nicht unterstützt. Du kannst das Mikrofon deiner Bildschirmtastatur verwenden."); return; }
    const recognition = new Constructor(); recognitionRef.current = recognition;
    recognition.lang = "de-DE"; recognition.continuous = false; recognition.interimResults = false;
    recognition.onresult = (event) => { let text = ""; for (let i = event.resultIndex; i < event.results.length; i++) if (event.results[i].isFinal) text += event.results[i][0].transcript + " "; if (text.trim()) onText(text.trim()); };
    recognition.onerror = (event) => { setListening(false); onNotice(event.error === "not-allowed" ? "Mikrofonzugriff wurde nicht erlaubt. Du kannst die Berechtigung in deinen Browsereinstellungen ändern." : event.error === "no-speech" ? "Ich habe nichts gehört. Starte das Diktat noch einmal." : "Der Sprachdienst deines Browsers ist gerade nicht verfügbar."); };
    recognition.onend = () => setListening(false);
    try { recognition.start(); setListening(true); onNotice("Diktat läuft über den Sprachdienst deines Browsers. Der Text wird erst mit Senden an die KI übertragen."); } catch { onNotice("Das Mikrofon konnte nicht gestartet werden."); }
  }
  return <button type="button" className={`composer-tool ${listening ? "listening" : ""}`} onClick={toggle} disabled={disabled} aria-label={listening ? "Diktat stoppen" : "Nachricht diktieren"} title={listening ? "Diktat stoppen" : "Nachricht diktieren"}>{listening ? <MicOff size={18}/> : <Mic size={18}/>}</button>;
}
export function SpeakButton({ text, onNotice }: { text: string; onNotice: (text: string) => void }) {
  const [speaking, setSpeaking] = useState(false);
  const token = useRef(0);
  useEffect(() => () => { token.current++; if (typeof window !== "undefined" && window.speechSynthesis) window.speechSynthesis.cancel(); }, []);
  function toggle() {
    if (!window.speechSynthesis) { onNotice("Vorlesen wird von diesem Browser nicht unterstützt."); return; }
    const synth = window.speechSynthesis; token.current++; const current = token.current;
    synth.cancel();
    if (speaking) { setSpeaking(false); return; }
    const clean = text.replace(/```[\s\S]*?```/g, " Codeblock. ").replace(/\[([^\]]+)\]\([^)]+\)/g, "$1").replace(/[#*_`]/g, "").slice(0, 30000);
    const chunks = clean.match(/[\s\S]{1,220}(?:\s|$)|[\s\S]{1,220}/g) || [];
    if (!chunks.length) return;
    setSpeaking(true);
    function next(index: number) { if (current !== token.current) return; if (index >= chunks.length) { setSpeaking(false); return; } const utterance = new SpeechSynthesisUtterance(chunks[index]); utterance.lang = "de-DE"; utterance.onend = () => next(index + 1); utterance.onerror = () => { if (current === token.current) setSpeaking(false); }; synth.speak(utterance); }
    next(0);
  }
  return <button type="button" onClick={toggle}>{speaking ? <VolumeX size={14}/> : <Volume2 size={14}/>} {speaking ? "Stoppen" : "Vorlesen"}</button>;
}
