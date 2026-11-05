// Shape of a check result as the backend returns it (backend/src/cv-rules.ts → CvCheckResult).
// Kept generic so the LinkedIn-Check can reuse the same components.
export type CheckStatus = "pass" | "fail" | "na" | "accepted";
export type AreaStatus = "good" | "onTrack" | "needsWork";
export type CheckFinding = { text: string; where?: string };
export type CheckOutcome = {
  id: string; area: string; group: string; hygiene: boolean; kind: string;
  label: string; rule: string; status: CheckStatus; score: number; max: number; findings: CheckFinding[];
};
export type AreaOutcome = { score: number; max: number; status: AreaStatus };
export type ImproveStep = { id: string; label: string; gain: number; detail?: string };
export type Recommendation = { id: string; ok: boolean; text: string };
export type BulletOutcome = {
  id: string; text: string; position: string;
  action: { ok: boolean; firstWord: string; source: string; accepted: boolean };
  scope: boolean | null; outcome: boolean | null; specificsAccepted: boolean;
  issues: string[]; suggestions: { scope?: string; outcome?: string };
};
export type CompetencyOutcome = { id: string; label: string; count: number; score: number; max: number; evidence: string[] };
export type CheckResult = {
  criteriaVersion: string; checkedAt: string; total: number; rawTotal: number; acceptedGain: number; accepted: string[];
  bonus: { earned: boolean; points: number; failingHygiene: string[]; unverifiedHygiene: string[] };
  areas: Record<string, AreaOutcome>;
  checks: CheckOutcome[]; bullets: BulletOutcome[]; competencies: CompetencyOutcome[];
  steps: ImproveStep[]; recommendations: Recommendation[];
  inputs: { layout: boolean; llm: boolean; header: boolean };
};
