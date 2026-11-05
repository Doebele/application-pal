// Self-check for the document suggestions: npx tsx backend/src/linkedin-sources.check.ts
import assert from "node:assert/strict";
import { linkedInProfileSchema, type CvDocument } from "@application-pal/shared";
import { liSourceSuggestions, liSourceFactsText, splitSkillTerms, sameCert, firstDate, cleanDocName, certFromDoc, linkedinLevel, textCvFacts } from "./linkedin-sources.js";

// ── term splitting ──
assert.deepEqual(splitSkillTerms("Design Thinking, UX Design, Agile, SCRUM workflow."), ["Design Thinking", "UX Design", "Agile", "SCRUM workflow"]);
assert.deepEqual(splitSkillTerms("CSS & HTML (Grundkenntnisse), Barrierefreiheit (WCAG), Styleguides / Pattern Libraries."),
  ["CSS", "HTML", "Barrierefreiheit", "WCAG", "Styleguides", "Pattern Libraries"]);
assert.deepEqual(splitSkillTerms("Figma\nMiro"), ["Figma", "Miro"]);

// ── certificate matching ──
assert.ok(sameCert("AI for Brainstorming and Planning", "Ai for Brainstorming and Planing by Google"), "typo + 'by Google'");
assert.ok(sameCert("Certificate in User Experience (NN/Group)", "NNG UX Certificate"), "abbreviations");
assert.ok(sameCert("Professional Certificate Google AI", "Google AI by Google"));
assert.ok(!sameCert("Google AI by Google", "AI for Data Analysis by Google"), "a shared 'Google AI' is not the same course");
assert.ok(!sameCert("AI for Research and Insights by Google", "AI for Design Workflows, AI for Research and +1 skill"));

// ── dates, names, levels ──
assert.equal(firstDate("Zeitraum: Ausstellungsdatum 10. Juni 2026"), "2026-06");
assert.equal(firstDate("Date: Certificate issued on Nov. 23, 2025 (UXC# 1067965)"), "2025-11");
assert.equal(firstDate("Completed July 11, 2026"), "2026-07");
assert.equal(firstDate("délivré en juillet 2024"), "2024-07");
assert.equal(firstDate("März 2019"), "2019-03");
assert.equal(firstDate("Abschluss 2018"), "2018");
assert.equal(firstDate("keine Angabe"), null);
assert.equal(cleanDocName("NNG-UX-Certificate-1067965-Medvesek_A4", ["Testa", "Medvesek"]), "NNG UX Certificate");
assert.equal(cleanDocName("AI for Data Analysis by Google"), "AI for Data Analysis by Google");
assert.equal(linkedinLevel("Muttersprache"), "native");
assert.equal(linkedinLevel("near native / fluent"), "fullProfessional");
assert.equal(linkedinLevel("verhandlungssicher"), "fullProfessional");
assert.equal(linkedinLevel("Grundkenntnisse"), "limitedWorking");
assert.equal(linkedinLevel(null), null);

const nng = certFromDoc({ name: "NNG-UX-Certificate-1067965-Beispiel_A4", summary: "- Issuer: NNGroup (Nielsen Norman Group), a world leader in UX\n- Date: Certificate issued on Nov. 23, 2025 (UXC# 1067965)\n- Role/Status: UX Certified" }, ["Beispiel"]);
assert.deepEqual(nng, { name: "NNG UX Certificate", issuer: "NNGroup", date: "2025-11", credentialId: "1067965" });
const g = certFromDoc({ name: "AI Fundamentals by Google", summary: "- Aussteller/Arbeitgeber: Google (angeboten über Coursera), ausgestellt von X\n- Zeitraum: Ausstellungsdatum 10. Juni 2026" });
assert.deepEqual(g, { name: "AI Fundamentals by Google", issuer: "Google", date: "2026-06", credentialId: null });

assert.equal(certFromDoc({ name: "Google AI by Google", summary: "- Issuer/Employer: Google (Google Career Certificates), delivered via Coursera\n- Time period/Certificate date: Completed July 11, 2026 (holder: X)" }).date, "2026-07",
  "the date label may start with another word");

// ── master-CV text fallback ──
assert.deepEqual(textCvFacts("## Profil\nText\n- **Tools:** Figma, Miro\nKompetenzen: Design Systems; Workshops\nAdresse: Musterweg 1").skills.map(s => s.name),
  ["Figma", "Miro", "Design Systems", "Workshops"]);

// ── full run ──
const cv = (lang: string, items: Array<{ title: string; text: string }>): { lang: string; doc: CvDocument } => ({
  lang, doc: { basics: { emails: [], phones: [], otherDetails: [] }, sections: [{ id: "s", kind: "skills", title: "Skills", items: items.map((x, i) => ({ id: `i${i}`, ...x, bullets: [] })) }] },
});
const cvEn = cv("en", [
  { title: "Methods", text: "Design Thinking, User Research, Wireframing, Agile." },
  { title: "Design-Tools", text: "Figma, FigJam, Jira, Miro" },
  { title: "Others", text: "Design System Governance, Accessibility (WCAG)." },
  { title: "Trainings and certificates", text: "Certificate in User Experience (NN/Group)\nProfessional Certificate Google AI" },
  { title: "Languages", text: "German (native speaker)\nEnglish (near native / fluent)" },
]);
const cvDe = cv("de", [{ title: "Methoden", text: "Design Thinking, Nutzerforschung" }]);
const profile = (o: { skills?: string[]; present?: string[]; certs?: string[]; langs?: string[] }) => linkedInProfileSchema.parse({
  basics: { firstName: "Testa", lastName: "Beispiel" },
  skills: (o.skills ?? []).map(name => ({ name })),
  certifications: (o.certs ?? []).map((name, i) => ({ id: `c${i}`, name })),
  languages: (o.langs ?? []).map(name => ({ name })),
  meta: { source: "pdf", fetchedAt: "2026-11-05T00:00:00Z", present: o.present ?? ["PROFILE", "POSITIONS", "CERTIFICATIONS", "LANGUAGES"] },
});
const certDocs = [
  { name: "NNG-UX-Certificate-1067965-Beispiel_A4", summary: "- Issuer: NNGroup (Nielsen Norman Group)\n- Date: Certificate issued on Nov. 23, 2025 (UXC# 1067965)" },
  { name: "Google AI by Google", summary: "- Issuer/Employer: Google (Google Career Certificates)\n- Time period/Certificate date: Completed July 11, 2026" },
  { name: "Ai for Brainstorming and Planing by Google", summary: "- Aussteller: Google\n- Zeitraum/Ausstellung: 11. Juni 2026" },
];

// PDF import: skills unknown, two certs and one language on the profile.
const imp = profile({ certs: ["AI for Brainstorming and Planning"], langs: ["English"] });
const draft = profile({ skills: ["Figma FigJam proficiency", "Design Thinking"], present: ["PROFILE", "SKILLS"] });
const s = liSourceSuggestions({ lang: "en", imported: imp, draft, cvs: [cvDe, cvEn], certDocs, ownName: ["Testa", "Beispiel"] });
assert.equal(s.cvLang, "en", "the CV in the profile language wins");
assert.equal(s.skillsKnown, false, "a PDF shows only the top skills");
assert.deepEqual(s.skills.map(x => x.name), ["Design Thinking", "User Research", "Wireframing", "Agile", "Figma", "FigJam", "Jira", "Miro", "Design System Governance", "Accessibility", "WCAG"]);
assert.equal(s.skills.find(x => x.name === "Design Thinking")!.inDraft, true);
assert.equal(s.skills.find(x => x.name === "Figma")!.inDraft, false, "a merged term does not count as 'Figma'");
assert.equal(s.skills.find(x => x.name === "Jira")!.source, "CV EN · Design-Tools");
assert.ok(!s.skills.some(x => /German|Certificate/.test(x.name)), "languages and certificates are not skills");

assert.equal(s.certifications.length, 3, "CV lines merged into the matching documents");
const nngS = s.certifications.find(c => c.name === "NNG UX Certificate")!;
assert.deepEqual([nngS.issuer, nngS.date, nngS.credentialId, nngS.inProfile], ["NNGroup", "2025-11", "1067965", false]);
assert.deepEqual(nngS.sources, ["doc:NNG-UX-Certificate-1067965-Beispiel_A4", "CV EN"]);
assert.equal(s.certifications.find(c => c.name.startsWith("Ai for Brainstorming"))!.inProfile, true, "typo-tolerant match with the profile");
assert.equal(s.certifications.find(c => c.name === "Google AI by Google")!.sources.length, 2);

assert.deepEqual(s.languages.map(l => [l.name, l.linkedinLevel, l.inProfile]), [["German", "native", false], ["English", "fullProfessional", true]]);
assert.equal(s.keywords[0], "Design Thinking");
assert.ok(s.keywords.indexOf("Figma") > s.keywords.indexOf("Accessibility"), "tools come last");

// ZIP import with all skills: Figma is on LinkedIn.
const zip = profile({ skills: ["Figma", "Design Thinking", "Workshop Facilitation"], present: ["PROFILE", "SKILLS"] });
const z = liSourceSuggestions({ lang: "en", imported: zip, draft: null, cvs: [cvEn], certDocs: [] });
assert.equal(z.skillsKnown, true);
assert.equal(z.skills.find(x => x.name === "Figma")!.inProfile, true);
assert.deepEqual(z.keywords.slice(0, 3), ["Figma", "Design Thinking", "User Research"], "confirmed profile skills first");
assert.ok(z.keywords.includes("Workshop Facilitation"), "profile-only skills are still offered");

// No CV versions: Master-CV text.
const m = liSourceSuggestions({ lang: "de", imported: null, draft: null, cvs: [], masterCv: "Tools: Figma, Miro", certDocs: [] });
assert.deepEqual([m.cvLang, m.skillsKnown, m.skills.map(x => x.source)], [null, false, ["Master-CV · Tools", "Master-CV · Tools"]]);

// Prompt block.
const block = liSourceFactsText(s);
assert.ok(block.includes("- Design-Tools: Figma, FigJam, Jira, Miro"));
assert.ok(block.includes("NNG UX Certificate · NNGroup · 2025-11"));
assert.ok(block.includes("- German (native speaker)"));
assert.equal(liSourceFactsText(m).includes("Zertifikate"), false);

console.log("linkedin-sources.check: all assertions passed");
