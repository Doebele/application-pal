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
  | "letterCoach" | "templates" | "knowledge" | "settings";

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
];

export function screenForLocation(pathname: string, search: string): ScreenId {
  if (pathname === "/") return new URLSearchParams(search).get("archive") === "true" ? "archive" : "board";
  return SCREENS.find(s => s.to === pathname)?.id ?? "board";
}

// Main content area of a page, whatever layout it uses.
const MAIN = ".app-main .board-scroll, .app-main .page-content, .app-main .chk-shell-main, .app-main > main";

const intro: TourStep = { target: "top.title", textKey: "common.title" };
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
  profile:     [intro, main("profile"), help],
  documents:   [intro, main("documents"), actions("documents"), help],
  cvCheck:     [intro, main("cvCheck"), { target: ".app-main .chk-shell-side", textKey: "cvCheck.side" }, help],
  linkedin:    [intro, main("linkedin"), { target: ".app-main .chk-shell-side", textKey: "linkedin.side" }, help],
  letterCoach: [intro, main("letterCoach"), help],
  templates:   [intro, main("templates"), help],
  knowledge:   [intro, main("knowledge"), actions("knowledge"), help],
  settings:    [intro, main("settings"), help],
};
