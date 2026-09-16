# KI-Chat

## Webseiten direkt im Chat

Klicke unter dem Eingabefeld auf **Webseite** oder wähle den Webseitenvorschlag im neuen Chat. Beschreibe die gewünschte Seite und sende deine Nachricht. Die Antwort enthält eine interaktive Vorschau, eine Codeansicht, eine Handyansicht und den HTML-Download. Weitere Nachrichten in diesem Modus bearbeiten dieselbe Webseite; mit dem X im Projektstreifen wechselst du zurück zum normalen Chat.

Jede fertige Seite erscheint automatisch unter **Meine Projekte**. Chat und Projekt werden gemeinsam auf diesem Gerät gespeichert. Frühere Entwürfe bleiben im Chat erhalten, zusätzlich hält das Studio bis zu acht Projektversionen vor. Vom Studio gelangst du mit **Im Chat bearbeiten** zurück zum passenden Gespräch. Änderungen an alten Nachrichten und neu angeforderte fertige Antworten erzeugen eigene Projektvarianten, ohne die bisherige Webseite zu überschreiben.

Die Vorschau läuft in einem isolierten iframe und veröffentlicht die generierte Seite nicht automatisch. Unvollständige Antworten, Fehler und Abbrüche ersetzen keinen gespeicherten Projektstand. Eine Sicherung unter Einstellungen enthält auch die Webseiten im Chat und ihre Projektzuordnung. Es gibt weiterhin keine geräteübergreifende Synchronisation.

Eine responsive KI-Chat-Webseite mit Codex Studio, Bilderstudio, gespeicherten Projekten und serverseitiger Gemini-Verbindung.

## Assistent und Arbeitsplatz

- Mehrere gespeicherte Chats, Volltextsuche, Umbenennen und Anheften. Nachrichten lassen sich bearbeiten oder erneut beantworten; der bisherige Verlauf bleibt dabei als eigene Kopie erhalten.
- Echte Textübertragung während der Generierung mit Stoppfunktion. Unterbrochene Antworten werden ausdrücklich als unvollständig gekennzeichnet.
- Markdown, Tabellen, Codeblöcke mit Kopieren/Download, Chat-Export als Markdown und Antworten als Datei.
- Bis zu drei Anhänge: PDF, PNG/JPEG/WebP, CSV, JSON und UTF-8-Text/Quellcode. Höchstens 2 MB je Datei und 3 MB insgesamt im aktuellen Gesprächsausschnitt; Textdateien bis 200 KB.
- Optionale Google-Websuche mit belegten Quellen und Google-Suchvorschlägen. Die Suche muss sichtbar aktiviert und ihr Kostenhinweis bestätigt werden. Fehlen tatsächliche Suchergebnisse, wird keine Recherche vorgetäuscht.
- Optionale Python-Analyse in Googles Ausführungsumgebung. Code, tatsächliche Ausführungsergebnisse und zurückgelieferte Diagramme werden angezeigt. Auf dem Vercel-Server wird kein Modellcode ausgeführt.
- Diktieren über den Sprachdienst des Browsers, soweit unterstützt, sowie Vorlesen mit der Browser-Sprachausgabe. Das Diktat sendet Nachrichten nicht automatisch ab. Der Browser kann Audio an seinen Sprachdienst übertragen.
- Name, Antwortlänge, eigene Anweisungen und kontrollierbare Erinnerungen. „Merken“ übernimmt einen Text zunächst in das bearbeitbare Erinnerungsformular. Das Modell wird nicht neu trainiert.
- Helles, dunkles und systemabhängiges Erscheinungsbild.
- Webseiten gezielt weiterentwickeln: vorhandenes HTML wird bei Änderungen berücksichtigt. HTML-Import, automatisch gespeicherter Codeeditor, Handy-Vorschau, HTML-Download und bis zu acht vorherige Projektstände.

Die Webseitenvorschau erlaubt eingebettetes JavaScript in einem isolierten iframe, ohne Same-Origin-Zugriff, Formulare oder Netzwerkanfragen aus Skripten. Die heruntergeladene HTML-Datei kann die vom generierten Code beschriebenen Funktionen enthalten.

Chats, Anhänge, Projekte, Versionen, Einstellungen und Erinnerungen liegen in einer versionierten IndexedDB-Datenbank dieses Browsers. Bisherige localStorage-Daten werden beim ersten Öffnen übernommen und dabei nicht gelöscht. Speicherfehler werden sichtbar gemeldet. Unter **Einstellungen & Gedächtnis → Sicherung herunterladen** lässt sich der Arbeitsplatz als JSON sichern; Import ergänzt Chats und Projekte als Kopien und überschreibt keine bestehenden Einträge. Die aktuellen persönlichen Einstellungen bleiben beim Import erhalten. Es werden keine API-Schlüssel exportiert. Die Bilderstudio-Galerie bleibt separat und Bilder lassen sich dort herunterladen.

Es gibt keine automatische Gerätesynchronisierung, Mail-/Kalenderverbindung oder dauerhaft laufenden Hintergrundagenten. Diese Funktionen benötigen separate Dienste, Benutzerkonten und Berechtigungen. Die Oberfläche kennzeichnet diese Grenzen. Der eigene Assistent nutzt Gemini; er übernimmt keine internen ChatGPT- oder Codex-Werkzeuge und keine verbundenen Konten.

Zur Begrenzung der Anfragegröße werden die letzten zwölf Nachrichten und aktivierten Erinnerungen berücksichtigt. Der sichtbare Verlauf bleibt vollständig gespeichert (bis 500 Nachrichten je Chat). Die Anwendung unterstützt bis zu 500 Chats, 100 Projekte und 100 Erinnerungen. Der API-Schlüssel bleibt serverseitig; Dateien und Kontext werden beim Senden an Google übermittelt. Websuche, Analyse und Bilder benötigen Gemini; die bestehende OpenAI-Verbindung ist als Ersatz für Textchat und Webseiten verfügbar.

Technische Referenzen: [Google Search](https://ai.google.dev/gemini-api/docs/generate-content/google-search), [Python-Ausführung](https://ai.google.dev/gemini-api/docs/generate-content/code-execution), [PDF-Verarbeitung](https://ai.google.dev/gemini-api/docs/generate-content/document-processing), [SpeechRecognition](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition).

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

Über **Eigenes Bild bearbeiten** lässt sich ein PNG-, JPEG- oder WebP-Bild bis 2 MB hochladen. Beschreibe danach die gewünschte Änderung, beispielsweise einen neuen Hintergrund. **Dieses Bild bearbeiten** übernimmt ein Galeriebild als Vorlage. Das Original bleibt erhalten; jede Bearbeitung erzeugt ein neues Bild. Einfache Änderungen passen am besten zum verwendeten Modell. Für Eingabebilder fallen zusätzliche Eingabekosten an; die Kostenbestätigung gilt auch für Bearbeitungen. Die Vorlage wird erst beim Absenden an Google geschickt.

Die Galerie speichert Bilddateien und Beschreibungen automatisch in IndexedDB **auf dem aktuellen Gerät und im aktuellen Browser**. Sie synchronisiert sich nicht zwischen Geräten oder unterschiedlichen Website-Adressen. Werden Browserdaten gelöscht oder wird privates Surfen beendet, können Bilder verloren gehen. Wichtige Bilder daher über **Bild herunterladen** sichern. Bei Speicherfehlern bleibt das neue Bild zum Herunterladen sichtbar. **Beschreibung nutzen** übernimmt ausschließlich Beschreibung und Einstellungen für eine neue Generation.

Bilddaten werden vom Backend als PNG, JPEG oder WebP zurückgegeben, ohne den API-Schlüssel an den Browser zu senden. Die Route prüft Eingabegrößen, Formate, Kostenbestätigung und Bildsignaturen; sie gibt verständliche Fehlermeldungen bei fehlender Abrechnung, ausgeschöpftem Kontingent oder nicht verfügbarem Modell aus. Betreiber sollten den persönlichen Zugangsschutz bei Vercel beibehalten: Ein öffentlicher Zugang zur Bilderstellung kann Kosten auf dem hinterlegten Google-Projekt verursachen.

## Prüfen und veröffentlichen

```bash
npm test
npm run lint
npm run build
```

Die Tests ersetzen Google durch isolierte Testantworten und erzeugen keine API-Kosten. Neben den Routen werden Speicherübernahme, Sicherungsimport, Unicode-Streaming, Abbruch und ein kompletter DOM-Ablauf mit Anhängen, Erinnerungen, Webseitenversionen und erneutem Öffnen geprüft. Die DOM-Prüfung simuliert einen Browser; echte Mikrofonberechtigungen und gerätespezifische Darstellung sind damit nicht geprüft. Ein Test mit dem echten Anbieter erfordert verfügbares Kontingent und für Bildgenerierung aktivierte Abrechnung. Nach Änderungen neu auf Vercel veröffentlichen; `GEMINI_API_KEY` muss für die jeweilige Deployment-Umgebung eingerichtet sein. GitHub Pages allein kann die Node.js-API nicht ausführen.
