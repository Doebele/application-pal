// ─── Canonical source for all stage constants ─────────────────────────────
// Import from here everywhere — never duplicate STAGE_LABELS/STAGE_COLORS.

export const STAGE_COLORS: Record<string, string> = {
  import_validating: "#94a3b8",
  preparing_cv:      "#60a5fa",
  preparing_letter:  "#22d3ee",
  application_sent:  "#a78bfa",
  pending:           "#fbbf24",
  interview_1:       "#34d399",
  interview_2:       "#10b981",
  rejected:          "#f87171",
  accepted:          "#84cc16",
};

/** Labels resolved at runtime via t() once i18n is wired up.
 *  Until then the DE fallback below is used. */
export const STAGE_LABELS_DE: Record<string, string> = {
  import_validating: "Inbox",
  preparing_cv:      "CV vorbereiten",
  preparing_letter:  "Anschreiben",
  application_sent:  "Beworben",
  pending:           "Wartend",
  interview_1:       "1. Interview",
  interview_2:       "2. Interview",
  rejected:          "Abgelehnt",
  accepted:          "Zugesagt",
};

export const STAGE_LABELS_EN: Record<string, string> = {
  import_validating: "Inbox",
  preparing_cv:      "Preparing CV",
  preparing_letter:  "Cover Letter",
  application_sent:  "Applied",
  pending:           "Pending",
  interview_1:       "1st Interview",
  interview_2:       "2nd Interview",
  rejected:          "Rejected",
  accepted:          "Accepted",
};

/** Short labels for table cells / chips */
export const STAGE_LABELS_SHORT_DE: Record<string, string> = {
  import_validating: "Inbox",
  preparing_cv:      "CV",
  preparing_letter:  "Letter",
  application_sent:  "Sent",
  pending:           "Pending",
  interview_1:       "1st Itw",
  interview_2:       "2nd Itw",
  rejected:          "Rejected",
  accepted:          "Contract offer",
};

export const STAGE_LABELS_SHORT_EN: Record<string, string> = {
  import_validating: "Inbox",
  preparing_cv:      "CV",
  preparing_letter:  "Letter",
  application_sent:  "Sent",
  pending:           "Pending",
  interview_1:       "1st Itw",
  interview_2:       "2nd Itw",
  rejected:          "Rejected",
  accepted:          "Contract offer",
};

export const ALL_STAGES = Object.keys(STAGE_COLORS);

/** Ordered list for UI (board columns etc.) */
export const STAGE_ORDER = [
  "import_validating",
  "preparing_cv",
  "preparing_letter",
  "application_sent",
  "pending",
  "interview_1",
  "interview_2",
  "rejected",
  "accepted",
] as const;
