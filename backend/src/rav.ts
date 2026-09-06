// ─── RAV / ORP proof-of-job-search sheet ──────────────────────────────────────
// Column spec, translations and row mapping for the monthly "Arbeitsbemühungen"
// proof sheet. Data + pure functions only — the routes live in index.ts.
//
// The FR strings must stay character-exact (typographic apostrophes U+2019 in
// "l’offre", "d’entretien", "d’emploi"): they are compared against the data
// validation lists of sheets that already exist in the user's Drive.

export type RavLang = "de" | "en" | "fr";
export const RAV_LANGS: RavLang[] = ["de", "en", "fr"];

export type RavApplicationType = "online" | "recruiter" | "meeting_confirmed" | "meeting_unconfirmed";
export type RavSourceKind = "linkedin" | "company" | "jobroom" | "recruiter" | "referral" | "other";
export type RavStatus = "not_applied" | "preparing_cv" | "sent" | "interviewing" | "rejected" | "offer" | "no_response";
export type RavProof = "email" | "linkedin" | "other";

export const RAV_APPLICATION_TYPES: RavApplicationType[] = ["online", "recruiter", "meeting_confirmed", "meeting_unconfirmed"];
export const RAV_PROOFS: RavProof[] = ["email", "linkedin", "other"];

type Sheet = {
  headers: string[];
  applicationType: Record<RavApplicationType, string>;
  sourceKind: Record<RavSourceKind, string>;
  status: Record<RavStatus, string>;
  proof: Record<RavProof, string>;
};

export const RAV_SHEET: Record<RavLang, Sheet> = {
  fr: {
    headers: [
      "Num.", "Date de la postulation", "Entreprise / Employeur", "Poste / Fonction", "Lieu",
      "Type de candidature", "Personne de contact", "Coordonnées", "Source de l’offre",
      "Résultat / Statut", "Relance / Suivi", "Justificatif / Preuve"
    ],
    applicationType: {
      online: "Candidature en ligne",
      recruiter: "Contacté(e) par un recruteur (téléphone / e-mail)",
      meeting_confirmed: "Rencontre en personne (confirmée par e-mail)",
      meeting_unconfirmed: "Rencontre en personne (non confirmée)"
    },
    sourceKind: {
      linkedin: "LinkedIn", company: "Entreprise", jobroom: "Job-Room",
      recruiter: "Recruteur / Recruteuse", referral: "Recommandation", other: "Autre"
    },
    status: {
      not_applied: "Pas encore postulé(e)",
      preparing_cv: "Préparation du CV",
      sent: "Candidature envoyée",
      interviewing: "En phase d’entretien",
      rejected: "Candidature refusée",
      offer: "Offre d’emploi",
      no_response: "Pas de réponse"
    },
    proof: { email: "Email", linkedin: "Linkedin", other: "Autre" }
  },
  de: {
    headers: [
      "Nr.", "Bewerbungsdatum", "Firma / Arbeitgeber", "Stelle / Funktion", "Ort",
      "Art der Bewerbung", "Kontaktperson", "Kontaktquelle", "Quelle des Inserats",
      "Ergebnis / Status", "Nachfassen / Verlauf", "Nachweis / Beleg"
    ],
    applicationType: {
      online: "Online-Bewerbung",
      recruiter: "Von Recruiter kontaktiert (Telefon / E-Mail)",
      meeting_confirmed: "Persönliches Gespräch (per E-Mail bestätigt)",
      meeting_unconfirmed: "Persönliches Gespräch (nicht bestätigt)"
    },
    sourceKind: {
      linkedin: "LinkedIn", company: "Unternehmen", jobroom: "Job-Room",
      recruiter: "Recruiter / Recruiterin", referral: "Empfehlung", other: "Andere"
    },
    status: {
      not_applied: "Noch nicht beworben",
      preparing_cv: "CV in Vorbereitung",
      sent: "Bewerbung versendet",
      interviewing: "Im Bewerbungsgespräch",
      rejected: "Absage erhalten",
      offer: "Stellenangebot",
      no_response: "Keine Rückmeldung"
    },
    proof: { email: "E-Mail", linkedin: "LinkedIn", other: "Andere" }
  },
  en: {
    headers: [
      "No.", "Application date", "Company / Employer", "Position / Role", "Location",
      "Application type", "Contact person", "Contact source", "Job source",
      "Result / Status", "Follow-up", "Proof / Evidence"
    ],
    applicationType: {
      online: "Online application",
      recruiter: "Contacted by a recruiter (phone / email)",
      meeting_confirmed: "In-person meeting (confirmed by email)",
      meeting_unconfirmed: "In-person meeting (not confirmed)"
    },
    sourceKind: {
      linkedin: "LinkedIn", company: "Company", jobroom: "Job-Room",
      recruiter: "Recruiter", referral: "Referral", other: "Other"
    },
    status: {
      not_applied: "Not applied yet",
      preparing_cv: "Preparing CV",
      sent: "Application sent",
      interviewing: "In interview process",
      rejected: "Application rejected",
      offer: "Job offer",
      no_response: "No response"
    },
    proof: { email: "Email", linkedin: "LinkedIn", other: "Other" }
  }
};

/** Column widths of the original template, in characters → pixels. */
export const RAV_COL_WIDTHS_PX = [5.13, 23.38, 19.88, 37.13, 14.25, 46.13, 35.88, 24.0, 23.13, 34.63, 27.0, 25.63]
  .map(w => Math.round(w * 7 + 5));

/** The four validated column groups, as 0-based column ranges [start, endExclusive]. */
export const RAV_VALIDATION_COLUMNS: { from: number; to: number; field: keyof Omit<Sheet, "headers"> }[] = [
  { from: 5, to: 6,  field: "applicationType" }, // F
  { from: 7, to: 9,  field: "sourceKind" },      // H + I
  { from: 9, to: 11, field: "status" },          // J + K
  { from: 11, to: 12, field: "proof" }           // L
];

// ─── Derivation ───────────────────────────────────────────────────────────────

/** Minimal structural shape — accepts a drizzle `applications` row. */
export type RavApplication = {
  id: string;
  company: string;
  role: string;
  location?: string | null;
  source?: string | null;
  stage: string;
  contactPerson?: string | null;
  ravApplicationType?: string | null;
  ravProof?: string | null;
  appliedAt?: Date | string | null;
  createdAt: Date | string;
};

export type RavContact = { name: string; email?: string | null };

/**
 * Column J holds the effort itself, not its outcome: in the original sheet every
 * sent application keeps "Candidature envoyée" in J while the result lives in K.
 * That is what the RAV counts — the outcome must not erase the proof of effort.
 */
const STAGE_STATUS: Record<string, RavStatus> = {
  import_validating: "not_applied",
  preparing_cv: "preparing_cv",
  preparing_letter: "preparing_cv"
  // every later stage means the application went out → "sent"
};

/** Column K — the follow-up event, empty while nothing has happened yet. */
const STAGE_FOLLOW_UP: Record<string, RavStatus> = {
  application_sent: "no_response",
  pending: "no_response",
  interview_1: "interviewing",
  interview_2: "interviewing",
  rejected: "rejected",
  accepted: "offer"
};

export const ravStatus = (stage: string): RavStatus => STAGE_STATUS[stage] ?? "sent";
export const ravFollowUp = (stage: string): RavStatus | null => STAGE_FOLLOW_UP[stage] ?? null;

export function ravSourceKind(source?: string | null): RavSourceKind {
  const s = (source ?? "").toLowerCase().trim();
  if (!s) return "company";
  if (/linkedin/.test(s)) return "linkedin";
  if (/job-?room|arbeit\.swiss/.test(s)) return "jobroom";
  if (/recruit|headhunt|personalberat|personalvermittl/.test(s)) return "recruiter";
  if (/empfehl|referral|recommand/.test(s)) return "referral";
  if (/website|webseite|karriere|career|unternehmen|company|direkt/.test(s)) return "company";
  return "other";
}

const isRecruiterish = (app: RavApplication): boolean =>
  ravSourceKind(app.source) === "recruiter" && !!(app.contactPerson ?? "").trim();

export function ravApplicationTypeOf(app: RavApplication): RavApplicationType {
  const override = app.ravApplicationType as RavApplicationType | null | undefined;
  if (override && RAV_APPLICATION_TYPES.includes(override)) return override;
  return isRecruiterish(app) ? "recruiter" : "online";
}

export function ravProofOf(app: RavApplication): RavProof {
  const override = app.ravProof as RavProof | null | undefined;
  if (override && RAV_PROOFS.includes(override)) return override;
  return "email";
}

/**
 * Column H — who the application actually went through, which is not the same as
 * where the posting was found (column I): a job spotted on LinkedIn is normally
 * submitted to the employer directly. Only a recruiter contact changes that.
 */
export function ravContactSource(app: RavApplication): RavSourceKind {
  return isRecruiterish(app) ? "recruiter" : "company";
}

/** The date the effort counts for: when it was sent, else when it was created. */
export const ravDate = (app: RavApplication): Date =>
  new Date(app.appliedAt ?? app.createdAt);

export function fmtRavDate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()}`;
}

/** `YYYY-MM` of a row's effort date — the calendar-month block it belongs to. */
export const ravMonthKey = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

/** Identity of a row across exports: date + company + role. */
export const ravRowKey = (date: string, company: string, role: string): string =>
  [date, company, role].map(v => v.trim().toLowerCase().replace(/\s+/g, " ")).join("|");

/** Date ascending, company as a stable tiebreaker (many applications share a day). */
export function sortRavApplications<T extends RavApplication>(apps: T[]): T[] {
  return [...apps].sort((a, b) => {
    const d = ravDate(a).getTime() - ravDate(b).getTime();
    return d !== 0 ? d : a.company.localeCompare(b.company);
  });
}

/** One sheet row (12 cells). `num` is the per-month running number. */
export function ravRow(app: RavApplication, contact: RavContact | null, lang: RavLang, num: number): string[] {
  const L = RAV_SHEET[lang];
  const followUp = ravFollowUp(app.stage);
  const contactName = (app.contactPerson ?? "").trim()
    || (contact ? [contact.name, contact.email ? `<${contact.email}>` : ""].filter(Boolean).join(" ") : "")
    || "N/A";
  return [
    String(num),
    fmtRavDate(ravDate(app)),
    app.company ?? "",
    app.role ?? "",
    app.location ?? "",
    L.applicationType[ravApplicationTypeOf(app)],
    contactName,
    L.sourceKind[ravContactSource(app)],
    L.sourceKind[ravSourceKind(app.source)],
    L.status[ravStatus(app.stage)],
    followUp ? L.status[followUp] : "",
    L.proof[ravProofOf(app)]
  ];
}

/** Which language a sheet is written in, judged by its header row. */
export function detectSheetLang(header: string[]): RavLang | null {
  const norm = (v: string) => (v ?? "").trim().toLowerCase();
  for (const lang of RAV_LANGS) {
    const want = RAV_SHEET[lang].headers;
    // Compare the columns that actually differ between languages.
    if ([1, 2, 3, 9, 11].every(i => norm(header[i] ?? "") === norm(want[i]))) return lang;
  }
  return null;
}

/** A row is free when it holds no real application (empty, or the "-" placeholders). */
export const isRavPlaceholderRow = (row: string[]): boolean =>
  [1, 2, 3].every(i => { const v = (row[i] ?? "").trim(); return v === "" || v === "-"; });

// --- Append planner ----------------------------------------------------------
// Pure: decides which sheet rows to overwrite and which to append, so the same
// month can be exported repeatedly without producing duplicates.

export type RavWrite = { row: number; values: string[] };
export type RavPlan = {
  updates: RavWrite[];
  appends: RavWrite[];
  lastRow: number;
  added: number;
  updated: number;
  skipped: number;
};

function monthOfCell(cell: string): string | null {
  const m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec((cell ?? "").trim());
  return m ? `${m[3]}-${m[2]}` : null;
}

export function planRavWrite(
  existing: string[][],
  apps: RavApplication[],
  contactsByApp: Map<string, RavContact>,
  lang: RavLang
): RavPlan {
  const rowByKey = new Map<string, number>();
  const numByMonth = new Map<string, number>();
  // Placeholder rows are reusable slots; each remembers which month block it sits in,
  // so a back-filled application lands inside its own block instead of at the bottom.
  const freeRows: { row: number; blockMonth: string | null }[] = [];
  let lastRealRow = 1;
  let currentMonth: string | null = null;

  existing.forEach((row, i) => {
    const sheetRow = i + 1;
    if (sheetRow === 1) return;
    if (isRavPlaceholderRow(row)) { freeRows.push({ row: sheetRow, blockMonth: currentMonth }); return; }
    lastRealRow = sheetRow;
    currentMonth = monthOfCell(row[1] ?? "");
    rowByKey.set(ravRowKey(row[1] ?? "", row[2] ?? "", row[3] ?? ""), sheetRow);
    const num = Number.parseInt((row[0] ?? "").trim(), 10);
    if (currentMonth && Number.isFinite(num)) {
      numByMonth.set(currentMonth, Math.max(numByMonth.get(currentMonth) ?? 0, num));
    }
  });

  const updates: RavWrite[] = [];
  const appends: RavWrite[] = [];
  const used = new Set<number>();
  let growRow = Math.max(lastRealRow, ...freeRows.map(f => f.row), 1) + 1;

  /** A slot inside the matching month block, else trailing empty space, else a new row. */
  const claimRow = (month: string): number => {
    const inBlock = freeRows.find(f => !used.has(f.row) && f.blockMonth === month);
    const trailing = freeRows.find(f => !used.has(f.row) && f.row > lastRealRow);
    const pick = inBlock ?? trailing;
    if (pick) { used.add(pick.row); return pick.row; }
    return growRow++;
  };

  for (const app of sortRavApplications(apps)) {
    const date = ravDate(app);
    const key = ravRowKey(fmtRavDate(date), app.company, app.role);
    const contact = contactsByApp.get(app.id) ?? null;
    const hit = rowByKey.get(key);
    if (hit !== undefined) {
      const prev = existing[hit - 1] ?? [];
      const keptNum = Number.parseInt((prev[0] ?? "").trim(), 10);
      const values = ravRow(app, contact, lang, Number.isFinite(keptNum) ? keptNum : 1);
      if (values.join(" ") !== prev.slice(0, 12).join(" ")) updates.push({ row: hit, values });
      continue;
    }
    const month = ravMonthKey(date);
    const num = (numByMonth.get(month) ?? 0) + 1;   // restarts at 1 for a month not yet in the sheet
    numByMonth.set(month, num);
    appends.push({ row: claimRow(month), values: ravRow(app, contact, lang, num) });
  }

  return {
    updates,
    appends: appends.sort((a, b) => a.row - b.row),
    lastRow: Math.max(lastRealRow, ...appends.map(a => a.row), 1),
    added: appends.length,
    updated: updates.length,
    skipped: apps.length - appends.length - updates.length
  };
}
