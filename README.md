# KI-Chat

Eine responsive KI-Chat-Webseite mit Codex Studio, Bilderstudio, gespeicherten Projekten und serverseitiger Gemini-Verbindung.

## Lokal starten

```bash
npm install
npm run dev
```

Kopiere `.env.example` nach `.env.local` und trage dort `GEMINI_API_KEY` ein. In Vercel wird derselbe Name unter **Settings → Environment Variables** angelegt. Der Schlüssel wird weder im Repository noch im Browser gespeichert.

Ohne konfigurierte Gemini-Variable bleibt die sichere OpenAI-Schlüsseleingabe pro Browser-Tab als Ersatz verfügbar.

## Bilder erstellen

Im Seitenmenü **Bilder erstellen** öffnen, ein Motiv beschreiben, Bildstil und Format wählen. Das Bilderstudio nutzt denselben serverseitigen `GEMINI_API_KEY`; eine erneute Schlüsseleingabe ist nicht erforderlich. Bilder werden mit `gemini-3.1-flash-lite-image` in 1K-Auflösung erstellt. Chat und Webseiten nutzen weiterhin `gemini-3.6-flash`.

Das Bildmodell hat keine kostenlose API-Stufe. Laut [Google-Preisliste](https://ai.google.dev/gemini-api/docs/pricing#gemini-3.1-flash-lite-image) kostet ein Bild etwa 0,034 US-Dollar zuzüglich Textkosten (Stand: September 2026). Eine aktive Google-API-Abrechnung und verfügbares Kontingent sind erforderlich. Die Anwendung aktiviert keine Abrechnung. Vor der ersten Erstellung pro geöffneter Seite muss der Kostenhinweis bestätigt werden. Es gibt keine automatischen Wiederholungen kostenpflichtiger Anfragen. Auch abgebrochene Anfragen können vom Anbieter berechnet werden.

Die Galerie speichert Bilddateien und Beschreibungen automatisch in IndexedDB **auf dem aktuellen Gerät und im aktuellen Browser**. Sie synchronisiert sich nicht zwischen Geräten oder unterschiedlichen Website-Adressen. Werden Browserdaten gelöscht oder wird privates Surfen beendet, können Bilder verloren gehen. Wichtige Bilder daher über **Bild herunterladen** sichern. Bei Speicherfehlern bleibt das neue Bild zum Herunterladen sichtbar. **Weiter gestalten** übernimmt Beschreibung und Einstellungen für eine neue Generation; es bearbeitet das vorhandene Bild nicht direkt.

Bilddaten werden vom Backend als PNG, JPEG oder WebP zurückgegeben, ohne den API-Schlüssel an den Browser zu senden. Die Route prüft Eingabegrößen, Formate, Kostenbestätigung und Bildsignaturen; sie gibt verständliche Fehlermeldungen bei fehlender Abrechnung, ausgeschöpftem Kontingent oder nicht verfügbarem Modell aus. Betreiber sollten den persönlichen Zugangsschutz bei Vercel beibehalten: Ein öffentlicher Zugang zur Bilderstellung kann Kosten auf dem hinterlegten Google-Projekt verursachen.

## Prüfen und veröffentlichen

```bash
npm test
npm run lint
npm run build
```

Die Routentests ersetzen Google durch isolierte Testantworten und erzeugen keine API-Kosten. Ein Test mit dem echten Anbieter erfordert aktivierte Abrechnung und eine ausdrücklich gestartete Bilderstellung. Nach Änderungen neu auf Vercel veröffentlichen; `GEMINI_API_KEY` muss für die jeweilige Deployment-Umgebung eingerichtet sein. GitHub Pages allein kann die Node.js-API nicht ausführen.
