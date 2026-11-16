// Tours as data. A step points at an element on the page and an i18n text.
//
// `target`: a `data-tour="…"` name (plain word, e.g. "board.add"), or a CSS selector
//   (anything containing . # [ space or >). The first match is used; a target that
//   doesn't appear within `waitFor` ms is skipped.
// `textKey`: i18n key under `tours.steps` holding `{ title, body }`.
// `clickOnNext`: clicked when the user moves on (e.g. open the drawer from a card).
// The tour engine lives in `components/Tour.tsx`.

export type TourStep = {
  target: string;
  textKey: string;
  waitFor?: number;
  clickOnNext?: string;
};

export type ScreenId =
  | "board" | "table" | "calendar" | "timeline" | "archive"
  | "profile" | "documents" | "cvCheck" | "linkedin"
  | "letterCoach" | "templates" | "knowledge" | "settings"
  | "setupAi" | "setupGoogle";

export type ScreenGroup = "groupApplications" | "groupMe" | "groupWriting" | "groupSystem";

/** Screens in navigation order, grouped like the rail. `nav` = i18n key under `nav`. */
export const SCREENS: { id: ScreenId; to: string; nav: string; group: ScreenGroup }[] = [
  { id: "board",       to: "/",              nav: "board",         group: "groupApplications" },
  { id: "table",       to: "/table",         nav: "list",          group: "groupApplications" },
  { id: "calendar",    to: "/calendar",      nav: "calendar",      group: "groupApplications" },
  { id: "timeline",    to: "/timeline",      nav: "timeline",      group: "groupApplications" },
  { id: "archive",     to: "/?archive=true", nav: "archive",       group: "groupApplications" },
  { id: "profile",     to: "/profile",       nav: "profile",       group: "groupMe" },
  { id: "documents",   to: "/documents",     nav: "documents",     group: "groupMe" },
  { id: "cvCheck",     to: "/cv-check",      nav: "cvCheck",       group: "groupMe" },
  { id: "linkedin",    to: "/linkedin",      nav: "linkedinCheck", group: "groupMe" },
  { id: "letterCoach", to: "/letter-coach",  nav: "letterCoach",   group: "groupWriting" },
  { id: "templates",   to: "/templates",     nav: "templates",     group: "groupWriting" },
  { id: "knowledge",   to: "/knowledge",     nav: "knowledge",     group: "groupWriting" },
  { id: "settings",    to: "/settings",      nav: "settings",      group: "groupSystem" },
  // Guided set-up tours (Settings page, step by step) — tiles in the overview only.
  { id: "setupAi",     to: "/settings",      nav: "setupAi",       group: "groupSystem" },
  { id: "setupGoogle", to: "/settings",      nav: "setupGoogle",   group: "groupSystem" },
];

export function screenForLocation(pathname: string, search: string): ScreenId {
  if (pathname === "/") return new URLSearchParams(search).get("archive") === "true" ? "archive" : "board";
  return SCREENS.find(s => s.to === pathname)?.id ?? "board";
}

// Main content area of a page, whatever layout it uses.
const MAIN = ".app-main .board-scroll, .app-main .page-content, .app-main .chk-shell-main, .app-main > main";

const intro: TourStep = { target: "top.title", textKey: "common.title" };
/** Parent element of an anchor — spotlights a whole section from its header. */
const section = (name: string) => `div:has(> [data-tour="${name}"])`;
const AI = '[data-tour="settings.aiDetails"]';

const help: TourStep = { target: "top.help", textKey: "common.help" };
const main = (id: ScreenId, target = MAIN): TourStep => ({ target, textKey: `${id}.main`, waitFor: 1500 });
const actions = (id: ScreenId): TourStep => ({ target: "top.actions", textKey: `${id}.actions` });

export const TOURS: Record<ScreenId, TourStep[]> = {
  board: [
    { target: "top.search", textKey: "board.search" },
    { target: "board.add", textKey: "board.add" },
    { target: ".kanban > :first-child", textKey: "board.columns", waitFor: 1500 },
    { target: ".kanban .job-card", textKey: "board.card", clickOnNext: ".kanban .job-card" },
    { target: "drawer.tabs", textKey: "board.tabs", waitFor: 2000 },
    { target: "drawer.process", textKey: "board.process", waitFor: 2000 },
    help,
  ],
  table: [
    { target: "table.head", textKey: "table.head", waitFor: 1500 },
    { target: "table.grid", textKey: "table.grid" },
    { target: "table.rav", textKey: "table.rav" },
    help,
  ],
  calendar:    [intro, main("calendar"), actions("calendar"), help],
  timeline:    [intro, main("timeline"), help],
  archive:     [intro, main("archive", ".app-main .board-scroll, .app-main table, .app-main .page-content"), actions("archive"), help],
  profile: [
    intro,
    { target: section("profile.focus"), textKey: "profile.focus", waitFor: 1500 },
    { target: section("profile.personal"), textKey: "profile.personal" },
    { target: "profile.linkedin", textKey: "profile.linkedin" },
    { target: section("profile.cv"), textKey: "profile.cv" },
    { target: section("profile.notes"), textKey: "profile.notes" },
    help,
  ],
  documents: [
    intro,
    { target: "documents.category", textKey: "documents.category", waitFor: 1500 },
    actions("documents"),
    help,
  ],
  cvCheck: [
    intro,
    { target: ".app-main .chk-shell-main", textKey: "cvCheck.main", waitFor: 2000 },
    { target: ".app-main .chk-side-tablist", textKey: "cvCheck.tabs" },
    { target: ".app-main .chk-shell-side", textKey: "cvCheck.side" },
    { target: "top.actions", textKey: "cvCheck.actions" },
    help,
  ],
  linkedin: [
    intro,
    { target: ".app-main .chk-shell-main", textKey: "linkedin.main", waitFor: 2000 },
    { target: ".app-main .chk-side-tablist", textKey: "linkedin.tabs" },
    { target: ".app-main .chk-shell-side", textKey: "linkedin.side" },
    { target: "top.actions", textKey: "linkedin.actions" },
    help,
  ],
  letterCoach: [intro, main("letterCoach"), help],
  templates: [
    intro,
    { target: "templates.noGoogle", textKey: "templates.noGoogle", waitFor: 1200 },
    { target: "templates.how", textKey: "templates.how" },
    { target: "templates.type", textKey: "templates.type", waitFor: 1500 },
    { target: "templates.lang", textKey: "templates.lang" },
    help,
  ],
  knowledge:   [intro, main("knowledge"), actions("knowledge"), help],
  settings: [
    intro,
    { target: "settings.ai", textKey: "settings.ai", waitFor: 1500 },
    { target: "settings.google", textKey: "settings.google" },
    { target: ".app-main .page-content", textKey: "settings.main" },
    help,
  ],
  setupAi: [
    { target: "settings.aiProviders", textKey: "setupAi.providers", waitFor: 1500 },
    { target: `${AI} .settings-row:has(input)`, textKey: "setupAi.connection", waitFor: 800 },
    { target: `${AI} .settings-row:has(select)`, textKey: "setupAi.model" },
    { target: AI, textKey: "setupAi.check" },
    { target: "settings.ai", textKey: "setupAi.done" },
  ],
  setupGoogle: [
    { target: "settings.google", textKey: "setupGoogle.intro", waitFor: 1500 },
    { target: "settings.googleConnect", textKey: "setupGoogle.connect" },
    { target: "settings.googleFolder", textKey: "setupGoogle.folder", waitFor: 800 },
    { target: "settings.google", textKey: "setupGoogle.next" },
  ],
};
