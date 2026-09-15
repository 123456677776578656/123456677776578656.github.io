# KI-Chat

Eine responsive KI-Chat-Webseite mit Codex Studio, gespeicherten Projekten und serverseitiger Gemini-Verbindung.

## Lokal starten

```bash
npm install
npm run dev
```

Kopiere `.env.example` nach `.env.local` und trage dort `GEMINI_API_KEY` ein. In Vercel wird derselbe Name unter **Settings → Environment Variables** angelegt. Der Schlüssel wird weder im Repository noch im Browser gespeichert.

Ohne konfigurierte Gemini-Variable bleibt die sichere OpenAI-Schlüsseleingabe pro Browser-Tab als Ersatz verfügbar.
