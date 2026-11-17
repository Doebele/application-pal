// Display-time translation of texts the backend stores in one language:
// default stage tasks (German, STAGE_TASK_TEMPLATES in backend/src/index.ts) and
// stage-change activity titles ("Stage → Preparing Letter"). Stored rows stay as they
// are; only untouched defaults are translated, edited titles are shown verbatim.
// Keep DEFAULT_TASK_KEYS in sync with STAGE_TASK_TEMPLATES.
import type { TFunction } from "i18next";

const DEFAULT_TASK_KEYS: Record<string, string> = {
  "Relevanz abklären": "import_validating.0",
  "Checks durchführen": "import_validating.1",
  "LinkedIn Profil überprüfen": "import_validating.2",
  "Beschreibung formatieren": "import_validating.3",
  "Stellenbeschreibung vollständig erfasst": "import_validating.4",
  "KI Match Score ausgeführt": "import_validating.5",
  "Relevanz entschieden": "import_validating.6",
  "Master-CV aktualisiert": "preparing_cv.0",
  "Relevante Erfahrungen identifiziert": "preparing_cv.1",
  "CV-Dokument erstellt": "preparing_cv.2",
  "Formatierung geprüft": "preparing_cv.3",
  "Anschreiben-Entwurf erstellt": "preparing_letter.0",
  "Auf Unternehmen personalisiert": "preparing_letter.1",
  "Rechtschreibung kontrolliert": "preparing_letter.2",
  "Länge angemessen (max. 1 Seite)": "preparing_letter.3",
  "Bewerbung vollständig eingereicht": "application_sent.0",
  "Bestätigung erhalten": "application_sent.1",
  "Follow-up-Termin gesetzt": "application_sent.2",
  "HR-Kontakt notiert": "application_sent.3",
  "Unternehmenswebseite analysiert": "pending.0",
  "Glassdoor-Bewertungen geprüft": "pending.1",
  "LinkedIn-Profile der Kontakte angeschaut": "pending.2",
  "Aktuelle News zum Unternehmen gelesen": "pending.3",
  "Logistik bestätigt (Zeit / Ort / Format)": "interview_1.0",
  "Unterlagen vorbereitet": "interview_1.1",
  "Rollenspezifische Fragen vorbereitet": "interview_1.2",
  "STAR-Beispiele aus Erfahrungen notiert": "interview_1.3",
  "Eigene Rückfragen formuliert": "interview_1.4",
  "Learnings aus Interview 1 notiert": "interview_2.0",
  "Gehaltsverhandlung vorbereitet": "interview_2.1",
  "Referenzen bereit": "interview_2.2",
  "Fortgeschrittene Fachfragen recherchiert": "interview_2.3",
  "Absage-Grund (falls bekannt) notiert": "rejected.0",
  "Learnings für nächste Bewerbungen festgehalten": "rejected.1",
  "Vertragsdetails geprüft": "accepted.0",
  "Startdatum bestätigt": "accepted.1",
  "Andere laufende Bewerbungen informiert": "accepted.2",
  "Absagen für andere Stellen vorbereitet": "accepted.3",
};

/** Title of a stage task in the UI language (custom tasks unchanged). */
export function taskTitle(t: TFunction, task: { title: string; isDefault?: boolean }): string {
  const key = DEFAULT_TASK_KEYS[task.title.trim()];
  return key ? t(`tasks.defaults.${key}`, { defaultValue: task.title }) : task.title;
}

// Labels the backend wrote into stage_change titles (current English + the old German ones).
const STAGE_BY_LABEL: Record<string, string> = {
  "inbox": "import_validating", "preparing cv": "preparing_cv", "cv vorbereiten": "preparing_cv",
  "preparing letter": "preparing_letter", "cover letter": "preparing_letter", "anschreiben": "preparing_letter",
  "submitted": "application_sent", "applied": "application_sent", "beworben": "application_sent",
  "pending": "pending", "wartend": "pending",
  "1st interview": "interview_1", "interview 1": "interview_1", "1. interview": "interview_1",
  "2nd interview": "interview_2", "interview 2": "interview_2", "2. interview": "interview_2",
  "rejected": "rejected", "abgelehnt": "rejected", "accepted": "accepted", "zugesagt": "accepted",
};

/** "Stage → Preparing Letter" → "Étape → Lettre de motivation"; other activities unchanged. */
export function activityTitle(t: TFunction, tStages: TFunction, act: { type: string; title: string }): string {
  if (act.type !== "stage_change") return act.title;
  const m = act.title.match(/^\s*(?:stage|phase)\s*→\s*(.+?)\s*$/i);
  if (!m) return act.title;
  const raw = m[1];
  const stageId = STAGE_BY_LABEL[raw.toLowerCase()] ?? (Object.values(STAGE_BY_LABEL).includes(raw) ? raw : undefined);
  if (!stageId) return act.title;
  return `${t("activities.stageChange")} → ${tStages(stageId, { defaultValue: stageId })}`;
}
