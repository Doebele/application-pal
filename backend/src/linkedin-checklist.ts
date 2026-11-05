// ─── LinkedIn-Check: checklist (phase 4) ────────────────────────────────────────
// What the user still has to do on LinkedIn for one profile language, built from the
// draft, the self-report checkpoints, the user's documents and the activity plan.
// Application-Pal never writes to LinkedIn, so every item is done by the user. Where an
// import can prove it, the item ticks itself ("auto"): a re-import after copying the draft
// shows the same headline, a certificate appears on the profile, a self-report point is
// full. Everything else is ticked by hand; those keys live in linkedin_state.checklist.
//
// Rules — don't "fix" them:
// - Auto-done needs evidence from an import (or a full self-report), never the draft alone.
// - A draft field with [X] is "blocked" until the placeholder is filled — copying it would
//   put "[X]" on LinkedIn.
// - Keys are stable and ≤ 60 characters (schema limit); manual ticks of items that no
//   longer exist are simply ignored.

import type { LinkedInProfile } from "@application-pal/shared";
import type { LiCheckOutcome } from "./linkedin-rules.js";
import type { LiDraftRaw } from "./linkedin-gen.js";
import type { LiSourceSuggestions } from "./linkedin-sources.js";

export type LiChecklistSection = "transfer" | "basics" | "documents" | "network" | "plan";
export const LI_CHECKLIST_SECTIONS: readonly LiChecklistSection[] = ["transfer", "basics", "documents", "network", "plan"];
export type LiChecklistItem = {
  key: string;
  section: LiChecklistSection;
  /** i18n kind for the label (linkedinCheck.checklist.kind.<kind>); `label` wins when set. */
  kind: string;
  label: string | null;
  params: Record<string, string | number>;
  /** Text to copy for this step, if any. */
  copy: string | null;
  auto: boolean;
  done: boolean;
  blocked: "placeholders" | null;
};
export type LiChecklist = { items: LiChecklistItem[]; done: number; total: number };

const norm = (s: string | null | undefined) => (s ?? "").toLocaleLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "")
  .replace(/[‐‑‒–—•·]/g, "-").replace(/\s+/g, " ").trim();
export const liChecklistKey = (prefix: string, id: string) =>
  `${prefix}:${norm(id).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`.slice(0, 60);
const hasX = (s: string | null | undefined) => !!s && s.includes("[X]");
/** Same text on LinkedIn as in the draft (whitespace, case and dash style ignored). */
const sameText = (a: string | null | undefined, b: string | null | undefined) => !!norm(a) && norm(a) === norm(b);

export function buildLiChecklist(o: {
  imported: LinkedInProfile | null;
  draft: LinkedInProfile | null;
  draftRaw: LiDraftRaw | null;
  sources: LiSourceSuggestions | null;
  /** Checks of the scored import (or draft) — only the "self" ones are used. */
  checks: LiCheckOutcome[];
  manual: string[];
}): LiChecklist {
  const items: LiChecklistItem[] = [];
  const manual = new Set(o.manual);
  const add = (i: Omit<LiChecklistItem, "done" | "label" | "params" | "copy" | "blocked"> & Partial<Pick<LiChecklistItem, "label" | "params" | "copy" | "blocked">>) => {
    if (items.some(x => x.key === i.key)) return;
    const blocked = i.blocked ?? null;
    items.push({ label: null, params: {}, copy: null, ...i, blocked, done: i.auto || (!blocked && manual.has(i.key)) });
  };
  const imp = o.imported;
  const d = o.draft;

  // 1) Transfer the draft field by field.
  if (d) {
    const b = d.basics;
    if (b.headline) add({ key: "draft:headline", section: "transfer", kind: "headline", copy: b.headline,
      auto: !hasX(b.headline) && sameText(imp?.basics.headline, b.headline), blocked: hasX(b.headline) ? "placeholders" : null });
    if (b.summary) add({ key: "draft:about", section: "transfer", kind: "about", copy: b.summary,
      auto: !hasX(b.summary) && sameText(imp?.basics.summary, b.summary), blocked: hasX(b.summary) ? "placeholders" : null });
    for (const p of d.positions) {
      if (!p.description) continue;
      const onLi = imp?.positions.find(x => x.id === p.id)
        ?? imp?.positions.find(x => sameText(x.company, p.company) && norm(x.start) === norm(p.start));
      const text = p.description;
      add({ key: liChecklistKey("draft:pos", p.id), section: "transfer", kind: "position",
        params: { title: p.title ?? "", company: p.company ?? "" }, copy: text,
        auto: !hasX(text) && sameText(onLi?.description, text), blocked: hasX(text) || hasX(p.title) ? "placeholders" : null });
    }
    if (d.skills.length) {
      // Only an import with the complete skills list (ZIP/API) can prove it.
      const known = !!imp && (!imp.meta.present || imp.meta.present.includes("SKILLS"));
      const onLi = new Set((imp?.skills ?? []).map(s => norm(s.name)));
      const missing = d.skills.filter(s => !onLi.has(norm(s.name))).length;
      add({ key: "draft:skills", section: "transfer", kind: "skills", params: { count: d.skills.length },
        copy: d.skills.map(s => s.name).join(", "), auto: known && missing === 0 });
    }
    for (const f of o.draftRaw?.featured ?? []) {
      add({ key: liChecklistKey("draft:feat", f.title), section: "transfer", kind: "featured", params: { title: f.title }, copy: f.url ?? f.title, auto: false });
    }
  }

  // 2) Things no import shows: the self-report checkpoints.
  for (const c of o.checks) {
    if (c.kind !== "self") continue;
    // params.checkId/max: ticking it in the UI sets the self-report, so score and checklist stay one truth.
    add({ key: liChecklistKey("self", c.id), section: "basics", kind: "self", label: c.label, params: { checkId: c.id, max: c.max },
      auto: c.status === "pass" || c.status === "accepted" || (c.max > 0 && c.score >= c.max) });
  }

  // 3) From the user's documents: certificates and languages missing on LinkedIn.
  for (const c of o.sources?.certifications ?? []) {
    add({ key: liChecklistKey("cert", c.name), section: "documents", kind: "cert",
      params: { name: c.name, issuer: c.issuer ?? "", date: c.date ?? "", credentialId: c.credentialId ?? "" }, copy: c.name, auto: c.inProfile });
  }
  for (const l of o.sources?.languages ?? []) {
    add({ key: liChecklistKey("lang", l.name), section: "documents", kind: "language",
      params: { name: l.name, level: l.linkedinLevel ?? "" }, copy: l.name, auto: l.inProfile });
  }

  // 4) Network: recommendation requests from the draft (only the user can send them).
  (o.draftRaw?.recRequests ?? []).forEach((r, i) => {
    add({ key: `rec:${i}`, section: "network", kind: "rec", params: { to: r.to }, copy: r.text, auto: false, blocked: null });
  });

  // 5) The 4-week plan.
  for (const w of o.draftRaw?.plan ?? []) {
    w.tasks.forEach((task, i) => add({ key: `plan:${w.week}:${i}`, section: "plan", kind: "task", label: task, params: { week: w.week }, auto: false }));
  }

  return { items, done: items.filter(i => i.done).length, total: items.length };
}
