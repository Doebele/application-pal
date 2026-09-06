// Self-check for the RAV mapping and append planner: node --import tsx backend/src/rav.check.ts
// Fixture is the real "Kopie von RAV Job Tracker" sheet (FR, August + September blocks).
import assert from "node:assert/strict";
import {
  RAV_SHEET, detectSheetLang, planRavWrite, ravRow, ravSourceKind, ravStatus,
  sortRavApplications, type RavApplication, type RavContact
} from "./rav.js";

const app = (o: Partial<RavApplication> & { company: string; role: string }): RavApplication =>
  ({ id: o.company, stage: "application_sent", createdAt: "2026-08-26T00:00:00Z", ...o });

const noContacts = new Map<string, RavContact>();

const sheet: string[][] = [
  RAV_SHEET.fr.headers,
  ["1", "26.08.2026", "Nexthink", "Senior Product Designer", "Lausanne", "Candidature en ligne", "N/A", "Entreprise", "LinkedIn", "Candidature envoyée", "Pas de réponse", "Email"],
  ["2", "25.08.2026", "Canonical", "Senior Design Researcher - User Science", "Remote", "Candidature en ligne", "N/A", "Entreprise", "LinkedIn", "Candidature envoyée", "Candidature refusée", "Email"],
  ["3", "-", "-", "-", "-", "", "-", "", "", "", "", ""],
  ["4", "-", "-", "-", "-", "", "-", "", "", "", "", ""],
  ["1", "03.09.2026", "SOPHiA Genetics", "Senior Platform Designer", "Rolle", "Candidature en ligne", "N/A", "Entreprise", "LinkedIn", "Candidature envoyée", "Pas de réponse", "Email"],
  ["2", "-", "-", "-", "-", "", "-", "", "", "", "", ""],
];

// 1. The sheet's language is recognised from its header row.
assert.equal(detectSheetLang(RAV_SHEET.fr.headers), "fr");
assert.equal(detectSheetLang(RAV_SHEET.de.headers), "de");
assert.equal(detectSheetLang(["a", "b", "c"]), null);

// 2. A row maps to exactly the values the sheet already holds.
const nexthink = app({ company: "Nexthink", role: "Senior Product Designer", location: "Lausanne", source: "LinkedIn", appliedAt: "2026-08-26T09:00:00Z", stage: "pending" });
assert.deepEqual(ravRow(nexthink, null, "fr", 1), sheet[1]);

// 3. Re-exporting what is already in the sheet changes nothing.
const known = [nexthink, app({ company: "Canonical", role: "Senior Design Researcher - User Science", location: "Remote", source: "LinkedIn", appliedAt: "2026-08-25T09:00:00Z", stage: "rejected" })];
const rerun = planRavWrite(sheet, known, noContacts, "fr");
assert.equal(rerun.added, 0, "second run must not append");
assert.equal(rerun.updated, 0, "identical rows must not be rewritten");
assert.equal(rerun.skipped, 2);

// 4. A changed stage updates the existing row in place and keeps its number.
const moved = [{ ...nexthink, stage: "rejected" }];
const upd = planRavWrite(sheet, moved, noContacts, "fr");
assert.equal(upd.added, 0);
assert.deepEqual(upd.updates.map(u => u.row), [2]);
assert.equal(upd.updates[0].values[0], "1", "running number must survive an update");
assert.equal(upd.updates[0].values[9], RAV_SHEET.fr.status.sent, "column J keeps the effort");
assert.equal(upd.updates[0].values[10], RAV_SHEET.fr.status.rejected, "column K carries the outcome");

// 5. A new August application fills the placeholder inside the August block,
//    numbered 3 — not appended below September.
const backfill = [app({ company: "Ipsos", role: "Research Manager", location: "Geneva", source: "LinkedIn", appliedAt: "2026-08-27T09:00:00Z" })];
const bf = planRavWrite(sheet, backfill, noContacts, "fr");
assert.deepEqual(bf.appends.map(a => a.row), [4], "must reuse the placeholder in its own month block");
assert.equal(bf.appends[0].values[0], "3", "August numbering continues");

// 6. A month not yet in the sheet starts again at 1.
const october = [app({ company: "Taurus SA", role: "Project Manager", appliedAt: "2026-10-02T09:00:00Z" })];
assert.equal(planRavWrite(sheet, october, noContacts, "fr").appends[0].values[0], "1");

// 7. Sorted by date, company breaks ties.
const sorted = sortRavApplications([
  app({ company: "Zeta", role: "r", appliedAt: "2026-08-10T00:00:00Z" }),
  app({ company: "Beta", role: "r", appliedAt: "2026-08-10T00:00:00Z" }),
  app({ company: "Alpha", role: "r", appliedAt: "2026-08-01T00:00:00Z" }),
]).map(a => a.company);
assert.deepEqual(sorted, ["Alpha", "Beta", "Zeta"]);

// 8. Derivations.
assert.equal(ravSourceKind("LinkedIn Jobs"), "linkedin");
assert.equal(ravSourceKind("job-room.ch"), "jobroom");
assert.equal(ravSourceKind(null), "company");
assert.equal(ravSourceKind("Zeitung"), "other");
assert.equal(ravStatus("interview_2"), "sent", "J keeps the effort, K carries the outcome");
assert.equal(ravStatus("import_validating"), "not_applied");
assert.equal(ravRow(app({ company: "X", role: "Y", source: "Recruiter", contactPerson: "Vikram Kadari" }), null, "fr", 1)[5], RAV_SHEET.fr.applicationType.recruiter);

console.log("rav.check: all assertions passed");
