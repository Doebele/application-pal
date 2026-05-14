# KI-Integration einrichten

Application Pal unterstützt zwei KI-Provider für die **Job-Import-Extraktion** und den **Match-Score**:

- **LM Studio** — lokal, kostenlos, läuft auf deinem Rechner
- **Anthropic Claude** — cloud-basiert, kostenpflichtig, sehr gute Qualität

---

## Option A — LM Studio (empfohlen für lokale Nutzung)

### 1. LM Studio installieren

Download: [lmstudio.ai](https://lmstudio.ai) (Mac, Windows, Linux)

### 2. Modell herunterladen

Empfohlen für Match-Score und Extraktion:

| Modell | Grösse | Qualität |
|--------|--------|---------|
| `Qwen3-8B` | ~5 GB | Gut |
| `Qwen3-14B` | ~9 GB | Sehr gut |
| `Qwen3-30B-A3B` (MoE) | ~20 GB | Ausgezeichnet |

In LM Studio: **Discover → Suche "Qwen3" → Download**

### 3. Server starten

In LM Studio: **Developer → Start Server** (Port 1234, Standard)

### 4. In Application Pal konfigurieren

**Settings → KI-Modell → LM Studio**
- URL: `http://localhost:1234`
- Modell: automatisch erkannt

> **Hinweis**: LM Studio muss laufen wenn du einen Job importierst oder einen Match-Score berechnen willst.

---

## Option B — Anthropic Claude (Cloud)

### 1. API-Key erstellen

1. Anmelden unter [console.anthropic.com](https://console.anthropic.com)
2. **API Keys → Create Key**
3. Key kopieren (wird nur einmal angezeigt)

### 2. In Application Pal konfigurieren

**Settings → KI-Modell → Anthropic**
- API Key: `sk-ant-xxxxx`

Kosten: ca. $0.01–0.05 pro Analyse (Claude Haiku)

---

## Keine KI

Ohne KI-Konfiguration:
- Job-Import funktioniert, aber Firma/Rolle/Tags werden nicht automatisch extrahiert
- Match-Score ist nicht verfügbar
