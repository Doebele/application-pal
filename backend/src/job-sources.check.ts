// Self-check for job-sources.ts — fictitious fixtures that mimic the page structures of Yousty
// (JSON-LD + description block) and LENA (server-rendered detail page). Never real postings:
// LENA pages name real contact persons. Run: npx tsx backend/src/job-sources.check.ts
import assert from "node:assert/strict";
import { sourceHints, isListUrl, detectSource, parsePlace, regionMatch, durationMinutes, htmlLines } from "./job-sources.js";

const yUrl = "https://www.yousty.ch/de-CH/lehrstellen/profile/1234567-logistiker-in-efz-musterhausen-be-muster-ag";
const yHtml = `<html><head><title>Logistiker/in EFZ Lehrstelle 2027 in Musterhausen</title>
<script type="application/ld+json">{"@context":"https://schema.org","@type":"Organization","name":"Yousty AG"}</script>
<script type="application/ld+json">{"@context":"https://schema.org","@type":"JobPosting","title":"Lehrstelle als Logistiker/in EFZ",
 "jobStartDate":"2027-08-01","validThrough":"2027-09-30T23:59:59+02:00","occupationalCategory":"Logistiker/in EFZ",
 "description":"Wir sind ein Musterbetrieb.ArbeitsortMusterhausen",
 "jobLocation":{"@type":"Place","address":{"@type":"PostalAddress","postalCode":"3999","addressLocality":"Musterhausen","addressRegion":"BE"}},
 "hiringOrganization":{"@type":"Organization","name":"Muster &amp; Co AG"}}</script></head>
<body><nav><a>Lehrstellen</a><a>Berufswahl</a></nav>
<h2>Lehrstellenbeschreibung</h2><div><p>Wir sind ein Musterbetrieb.</p><h3>Arbeitsort</h3><p>Musterhausen BE</p>
<h3>Profil</h3><ul><li>Du bist zuverlässig</li><li>Du arbeitest gerne im Team</li></ul></div>
<h3>Dein Arbeitsort</h3><p>Musterweg 1, 3999 Musterhausen</p><footer>Impressum</footer></body></html>`;

const y = sourceHints(yUrl, yHtml)!;
assert.equal(y.source, "yousty");
assert.equal(y.company, "Muster & Co AG", "entities decoded");
assert.equal(y.role, "Logistiker/in EFZ");
assert.equal(y.apprenticeship, "Logistiker/in EFZ");
assert.equal(y.location, "3999 Musterhausen BE");
assert.equal(y.applicationKind, "lehrstelle");
assert.equal(y.startDate, "2027-08-01");
assert.ok(y.text.includes("Du bist zuverlässig\nDu arbeitest gerne im Team"), "description keeps its lines");
assert.ok(!y.text.includes("Impressum") && !y.text.includes("Berufswahl"), "no navigation or footer");
assert.equal(sourceHints(yUrl.replace("/lehrstellen/", "/schnupperlehren/"), yHtml)!.applicationKind, "schnupperlehre");

const lUrl = "https://www.berufsberatung.ch/de/lehrstellen/9999999";
const lHtml = `<html><body><header>berufsberatung<br>.ch</header>
<div><div>Schreiner/-in EFZ</div><div>Musterholz AG, Werkstatt</div></div>
<h1 class="x">Schreiner/-in EFZ (2027)</h1><div>Aktualisierungsdatum 1. Juli 2026</div><div>Musterdorf (SO)</div>
<div class="places"><div data-variant="lime"><span>3</span></div>Lehrstellen</div>
<div><div><div>Bewerbungsadresse</div><div>Musterholz AG
Werkstatt
Herr Max Beispiel
Musterstrasse 5
4999 Musterdorf (SO)<div>Tel.:<!-- --> <a href="tel:0000000000">000 000 00 00</a></div></div></div>
<a href="mailto:lehre@example.invalid">lehre@example.invalid</a><a href="https://example.invalid/jobs"><span>Online bewerben</span></a></div>
<div><div>Sprache</div><div>Deutsch</div></div><div><div>Berufsmaturität</div><div>Möglich</div></div>
<footer>Impressum</footer></body></html>`;

const l = sourceHints(lUrl, lHtml)!;
assert.equal(l.source, "lena");
assert.equal(l.role, "Schreiner/-in EFZ", "year split off the heading");
assert.equal(l.startDate, "2027");
assert.equal(l.company, "Musterholz AG");
assert.equal(l.location, "4999 Musterdorf (SO)", "no phone glued to the town");
assert.equal(l.contactPerson, "Max Beispiel");
assert.equal(l.contactGender, "m");
assert.equal(l.phone, "0000000000");
assert.equal(l.email, "lehre@example.invalid");
assert.equal(l.positions, 3);
assert.ok(l.text.includes("Lehrbetrieb: Musterholz AG (Werkstatt)") && l.text.includes("Berufsmaturität: Möglich"));
assert.equal(sourceHints(lUrl, "<html><body><p>Cookie not accepted</p></body></html>"), null, "cookie wall → no hints");
assert.equal(sourceHints(lUrl, lHtml.replace("4999 Musterdorf (SO)<div>", "4999 Musterdorf SO (SO)<div>"))!.location, "4999 Musterdorf SO", "no doubled canton");

// Generic JSON-LD on another job board, with @graph
const g = sourceHints("https://jobs.example.invalid/1", `<script type="application/ld+json">{"@graph":[{"@type":"WebPage"},{"@type":["JobPosting"],"title":"Kauffrau/Kaufmann EFZ","hiringOrganization":{"name":"Beispiel GmbH"},"description":"<p>Erste Zeile</p><p>Zweite Zeile</p>"}]}</script>`)!;
assert.equal(g.source, "jsonld"); assert.equal(g.company, "Beispiel GmbH");
assert.ok(g.text.includes("Erste Zeile\nZweite Zeile"));
assert.equal(sourceHints("https://example.invalid/", "<p>nothing</p>"), null);

// URLs
assert.equal(detectSource(yUrl), "yousty"); assert.equal(detectSource(lUrl), "lena"); assert.equal(detectSource("https://example.invalid"), null);
assert.ok(isListUrl("https://www.yousty.ch/de-CH/lehrstellen"));
assert.ok(isListUrl("https://www.berufsberatung.ch/de/suche/lehrstellen"));
assert.ok(!isListUrl(yUrl) && !isListUrl(lUrl));

// Region
assert.deepEqual(parsePlace("3422 Kirchberg BE"), { zip: "3422", town: "Kirchberg", canton: "BE" });
assert.deepEqual(parsePlace("Allschwil (BL)"), { town: "Allschwil", canton: "BL" });
assert.deepEqual(parsePlace("8005 Zürich"), { zip: "8005", town: "Zürich" });
assert.equal(regionMatch(parsePlace("3400 Burgdorf"), parsePlace("3422 Kirchberg BE")), "near");
assert.equal(regionMatch(parsePlace("8400 Winterthur"), parsePlace("8400 Winterthur")), "same_town");
assert.equal(regionMatch(parsePlace("Zürich"), parsePlace("8005 Zürich")), "same_town", "town match ignores case/accents");
assert.equal(regionMatch(parsePlace("3000 Bern BE"), parsePlace("3900 Brig VS")), "region", "same postcode region");
assert.equal(regionMatch(parsePlace("4123 Allschwil BL"), parsePlace("4051 Basel BS")), "region", "a canton boundary alone is not far");
assert.equal(regionMatch(parsePlace("8001 Zürich"), parsePlace("1201 Genève")), "far");
assert.equal(regionMatch(parsePlace("Bern BE"), parsePlace("Luzern LU")), "far", "no postcodes → cantons");
assert.equal(regionMatch(parsePlace("Thun BE"), parsePlace("Bern BE")), "region");
assert.equal(regionMatch({}, parsePlace("8001 Zürich")), "unknown");

assert.equal(durationMinutes("00d01:12:00"), 72); assert.equal(durationMinutes("PT45M"), 45); assert.equal(durationMinutes(null), null);
assert.ok(htmlLines("<p>a&nbsp;b</p><br>c").join("|") === "a b|c");

console.log("job-sources: Yousty, LENA, JSON-LD, region and travel time passed");
