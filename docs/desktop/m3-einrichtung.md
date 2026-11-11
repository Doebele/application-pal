# M3: Einrichtungsassistent

Stand: 11.11.2026 · Branch `desktop`

## Was gebaut wurde

Nach dem ersten Anmelden eines **neuen Profils** in der Desktop-App erscheint statt des Boards ein Assistent (`frontend/src/components/SetupWizard.tsx`). Jeder Schritt lässt sich überspringen, „Später einrichten“ beendet ihn sofort.

1. **Ausgangslage** – Schulabgänger / Berufseinsteiger / Berufsumsteiger (`user_profile.persona`, dieselbe Auswahl wie auf der Profilseite). Sie steuert, ob der LinkedIn-Schritt und der LinkedIn-Check in der Rail erscheinen.
2. **KI** – sucht beim Öffnen LM Studio (`localhost:1234`) und Ollama (`localhost:11434`) und zeigt die geladenen Modelle (ohne Embedding-Modelle). Alternativ ein Cloud-Dienst (Anthropic, OpenAI, Gemini, OpenRouter) mit Schlüssel, der verschlüsselt gespeichert wird (M1). „Verbindung testen“ ruft `POST /api/ai/test` auf (eine Mini-Anfrage, Abbruch nach 90 s).
3. **Google** – erklärt, wofür Google gebraucht wird, und verbindet über den Loopback-Ablauf aus M2. Ist Google in der App-Version nicht eingerichtet (`configured: false`), steht dort ein Hinweis statt des Knopfs.
4. **LinkedIn** (nur Berufseinsteiger und -umsteiger) – erklärt den Import (PDF oder Datenexport) bzw. den Aufbau eines neuen Profils; auf Wunsch öffnet sich danach der LinkedIn-Check.
5. **Zusammenfassung** mit den offenen Punkten.

| Teil | Wo |
|---|---|
| Auslöser | `ui_settings.onboarding = "pending"` (wird beim Anlegen eines Profils gesetzt), gelesen in `MainApp` (`App.tsx`, Query `["onboarding", userId]`) |
| Abschluss | `PATCH /api/settings { onboarding: "done" }` |
| Erneut öffnen | Einstellungen → Profil & Schutz → „Assistent öffnen“ |
| KI-Test | `POST /api/ai/test { ai }` → `{ ok, reply?, error?, ms }` |

Der Assistent hat keinen eigenen Zustand: Er setzt dieselben Werte wie die Einstellungen (Zustand-Store → `SettingsSync`, Schlüssel → `PUT /api/settings/secrets`). Bestehende Konten (Web und alte Desktop-Profile) sehen ihn nie automatisch.

## Nebenbei behoben

`resolveHostUrl()` schrieb `localhost` immer auf `host.docker.internal` um – auf dem Desktop gibt es kein Docker, lokale Modelle waren dort also nie erreichbar. Im Desktop-Modus bleibt die URL jetzt unverändert.

`settingsSync`: „neues Konto“ heisst jetzt „noch kein synchronisierter Schlüssel“ (statt „leeres Objekt“), weil neue Profile `onboarding` mitbringen.

## Getestet

Mit dem gebauten Sidecar im In-App-Browser:
- Neues Profil → Assistent statt Board; bestehendes Profil → Board.
- KI-Schritt findet LM Studio (26 Modelle) und Ollama (8, ohne Embedding-Modell 7); Ollama `qwen3.5:9b` gewählt, Test „Antwort nach 17.8 s“ (Kaltstart).
- Google-Schritt ohne Zugangsdaten zeigt den Hinweis „noch nicht eingerichtet“.
- LinkedIn-Schritt erscheint für Berufsumsteiger.
- Nach „Los geht’s“: `onboarding: "done"`, `persona: "berufsumsteiger"`, `ai.provider: "ollama"` auf dem Server; Neuladen zeigt das Board.
- „Assistent öffnen“ in den Einstellungen öffnet ihn wieder mit der gewählten Ausgangslage. Layout auf Smartphone-Breite geprüft.

Nicht getestet: Cloud-Schlüssel mit echtem Anbieter-Konto, Google-Schritt mit echter Verbindung (braucht die Zugangsdaten aus M2).

## Offen

- Im Web-Modus gibt es den Assistenten nicht (der Google-Schritt dort verlässt die Seite per Weiterleitung).
- LinkedIn-API-Verbindung (eigene Entwickler-App) ist nicht Teil des Assistenten – zu aufwendig für den Start; PDF/ZIP-Import reicht.
