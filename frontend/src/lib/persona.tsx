// Persona-dependent UI. School leavers (persona "schulabgaenger") don't see the adult
// job-seeker features (salary, employer ratings, ATS, match score, onboarding, CV-Check,
// LinkedIn) and see school stage names. The RAV export stays hidden for them unless the
// pupil profile says they are registered with the RAV (SEMO / bridge year).
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import i18n from "../i18n";
import { api } from "./api";
import deStages from "../i18n/de/stages.json";
import enStages from "../i18n/en/stages.json";
import frStages from "../i18n/fr/stages.json";

export const SCHOOL_PERSONA = "schulabgaenger";

type ProfileBasics = { persona?: string | null; schoolProfile?: string | null };

export function useProfileBasics(): { persona: string | null; isSchool: boolean; ravEnabled: boolean } {
  const { data } = useQuery({
    queryKey: ["profile"],
    queryFn: async () => (await api.get<ProfileBasics>("/api/profile")).data,
  });
  const p = data as ProfileBasics | undefined;
  const persona = p?.persona ?? null;
  const isSchool = persona === SCHOOL_PERSONA;
  let rav = false;
  try { rav = !!(JSON.parse(p?.schoolProfile ?? "{}") as { ravRegistered?: boolean }).ravRegistered; } catch { /* ignore */ }
  return { persona, isSchool, ravEnabled: !isSchool || rav };
}

/** AI result tiles that make no sense for school leavers (salary, ratings, ATS, onboarding, adult CV). */
export const ADULT_ONLY_TILES = new Set([
  "match-score", "glassdoor-check", "kununu-check", "linkedin-profile", "salary-check", "salary-tips",
  "ackermann-script", "ats-keywords", "onboarding", "cv-highlights",
]);

/** Table columns hidden for school leavers. */
export const ADULT_ONLY_COLUMNS = new Set(["matchScore", "salaryMedian", "glassdoor", "kununu", "jobType", "workModel", "contractType", "salary"]);

/** Stage names for school leavers; the stage ids stay the same. */
const SCHOOL_STAGES: Record<"de" | "en" | "fr", Record<string, string>> = {
  de: { import_validating: "Entdeckt", preparing_cv: "Unterlagen", preparing_letter: "Anschreiben", application_sent: "Gesendet", pending: "Warten auf Antwort", interview_1: "Schnuppern / Gespräch", interview_2: "2. Termin", rejected: "Absage", accepted: "Zusage" },
  en: { import_validating: "Found", preparing_cv: "Documents", preparing_letter: "Cover letter", application_sent: "Sent", pending: "Waiting for reply", interview_1: "Taster / interview", interview_2: "2nd meeting", rejected: "Declined", accepted: "Offer" },
  fr: { import_validating: "Trouvé", preparing_cv: "Dossier", preparing_letter: "Lettre", application_sent: "Envoyé", pending: "En attente", interview_1: "Stage / entretien", interview_2: "2e rendez-vous", rejected: "Refus", accepted: "Accepté" },
};
const ORIGINAL_STAGES = { de: deStages, en: enStages, fr: frStages };

let applied: boolean | null = null;
/** Swaps the "stages" namespace between the job-seeker and the school-leaver names. */
function applySchoolStages(on: boolean) {
  if (applied === on) return;
  applied = on;
  for (const lang of ["de", "en", "fr"] as const) {
    i18n.addResourceBundle(lang, "stages", on ? { ...ORIGINAL_STAGES[lang], ...SCHOOL_STAGES[lang] } : ORIGINAL_STAGES[lang], true, true);
  }
  // Re-render everything that uses t("stages:…")
  void i18n.changeLanguage(i18n.language);
}

/** Mounted once in the app shell: keeps the stage names in line with the persona. */
export function PersonaStageNames() {
  const { persona, isSchool } = useProfileBasics();
  useEffect(() => { if (persona !== undefined) applySchoolStages(isSchool); }, [persona, isSchool]);
  return null;
}
