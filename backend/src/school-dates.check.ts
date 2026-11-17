// Self-check for school-dates.ts (fictitious data only): npx tsx backend/src/school-dates.check.ts
import assert from "node:assert/strict";
import { buildAgenda, agendaIcs, detectDeadline, normalizePersonalDates, dayDiff, type AgendaApp } from "./school-dates.js";
import { parseSchoolProfile } from "./letter-kinds.js";

const today = "2027-03-10";
const iv = (o: object) => JSON.stringify(o);

// ── deadline detection ──
assert.equal(detectDeadline("Bewerbungsfrist: 31.03.2027", today), "2027-03-31");
assert.equal(detectDeadline("Bitte bewirb dich bis 15. April 2027 mit Lebenslauf.", today), "2027-04-15");
assert.equal(detectDeadline("Bewerbungen bis spätestens 20.3. an Frau Muster", today), "2027-03-20");
assert.equal(detectDeadline("Bewerbungsschluss 5. Januar", today), "2028-01-05", "no year → next occurrence");
assert.equal(detectDeadline("Application deadline: March 28, 2027", today), "2027-03-28");
assert.equal(detectDeadline("Apply by 2027-04-02.", today), "2027-04-02");
assert.equal(detectDeadline("Délai de postulation : 30 avril 2027", today), "2027-04-30");
assert.equal(detectDeadline("Bewerbungsfrist: 01.02.2027", today), null, "past deadline");
assert.equal(detectDeadline("Lehrbeginn: 1. August 2027. Wir freuen uns auf dich.", today), null, "no cue → nothing");
assert.equal(detectDeadline("Bewerbungsfrist: 31.02.2027", today), null, "invalid date");

// ── personal dates ──
const personal = normalizePersonalDates([
  { id: "a", kind: "test", title: "Multicheck", date: "2027-03-17", time: "08:30", place: "Testzentrum Muster" },
  { id: "b", kind: "fair", title: "Berufsmesse", date: "2027-03-09" },        // 1 day ago → kept
  { id: "c", kind: "info", title: "Infoabend", date: "2027-03-01" },          // too old → dropped by agenda
  { kind: "bogus", title: "x", date: "2027-13-01" },                           // invalid date → dropped
  { kind: "bogus", title: "Kind fallback", date: "2027-04-01" },
]);
assert.equal(personal.length, 4);
assert.equal(personal[3].kind, "other");
const sp = parseSchoolProfile(JSON.stringify({ dates: [{ id: "x", kind: "test", title: "Stellwerk", date: "2027-05-02" }] }));
assert.equal(sp.dates?.[0]?.title, "Stellwerk", "dates survive parseSchoolProfile");

// ── agenda ──
const apps: AgendaApp[] = [
  { id: "1", company: "Muster AG", role: "Lernende/r", stage: "preparing_letter", applyDeadline: "2027-03-17", apprenticeship: "Schreiner/in EFZ" },
  { id: "2", company: "Sent GmbH", stage: "application_sent", applyDeadline: "2027-03-12" },                  // sent → no deadline
  { id: "3", company: "Holz & Co", stage: "interview_1", applicationKind: "schnupperlehre",
    interview1Details: iv({ date: "2027-03-08", endDate: "2027-03-11" }) },                                   // running range
  { id: "4", company: "Fertig AG", stage: "interview_1", applicationKind: "schnupperlehre",
    interview1Details: iv({ date: "2027-03-02", endDate: "2027-03-04" }) },                                   // ended 6 days ago, no debrief
  { id: "5", company: "Debrief AG", stage: "interview_1", applicationKind: "schnupperlehre",
    interview1Details: iv({ date: "2027-03-05" }), aiResultsCache: iv({ "schnupper-debrief": { feedback: "good" } }) },
  { id: "6", company: "Talk AG", stage: "interview_1", interview1Details: iv({ date: "2027-03-11", time: "14:00" }) },
  { id: "7", company: "Archiv AG", stage: "preparing_cv", archived: "true", applyDeadline: "2027-03-11" },
  { id: "8", company: "Alt AG", stage: "preparing_cv", applyDeadline: "2027-03-01" },                        // 9 days overdue
];
const ag = buildAgenda(apps, personal, today);
const ids = ag.map(i => i.id);
assert.ok(ids.includes("deadline:1") && !ids.includes("deadline:2") && !ids.includes("deadline:7"));
assert.ok(ids.includes("deadline:8") && ag.find(i => i.id === "deadline:8")!.urgency === "overdue");
const t3 = ag.find(i => i.id === "taster:3")!;
assert.equal(t3.daysLeft, 0, "running taster days count as today");
assert.ok(ids.includes("followup:4") && !ids.includes("followup:5") && !ids.includes("taster:4"));
const d1 = ag.find(i => i.id === "deadline:1")!;
assert.equal(d1.daysLeft, 7); assert.equal(d1.remind, true, "7 days before a deadline"); assert.equal(d1.detail, "Schreiner/in EFZ");
const i6 = ag.find(i => i.id === "interview:6:1")!;
assert.equal(i6.remind, true, "1 day before an interview");
assert.ok(ids.includes("personal:a") && ids.includes("personal:b") && !ids.includes("personal:c"));
assert.equal(ag.find(i => i.id === "personal:a")!.remind, true, "test: 7 days before");
assert.ok(ag[0].daysLeft <= ag[ag.length - 1].daysLeft, "sorted by date");
assert.equal(dayDiff("2027-02-28", "2027-03-01"), 1);

// ── ics ──
const ics = agendaIcs(ag, "de", "Apply-Pal", new Date("2027-03-10T08:00:00Z"));
assert.ok(ics.startsWith("BEGIN:VCALENDAR\r\n") && ics.endsWith("END:VCALENDAR\r\n"));
assert.ok(ics.includes("SUMMARY:Bewerbungsfrist: Muster AG"));
assert.ok(ics.includes("DTSTART;VALUE=DATE:20270308") && ics.includes("DTEND;VALUE=DATE:20270312"), "range end is exclusive");
assert.ok(ics.includes("DTSTART:20270311T140000") && ics.includes("TRIGGER:-PT2H"));
assert.ok(ics.includes("TRIGGER:-P6DT15H"), "deadline alarm 7 days before at 09:00");
assert.ok(!ics.includes("Alt AG") && !ics.includes("followup"), "no overdue items or nudges in the calendar");
assert.ok(ics.includes("SUMMARY:Test: Multicheck"));
assert.ok(ics.includes("Holz & Co") && !/[^\r]\n/.test(ics), "CRLF only");
assert.ok(ics.split("\r\n").every(l => l.length <= 75), "folded lines");

console.log("school-dates: agenda, ics and deadline detection passed");
