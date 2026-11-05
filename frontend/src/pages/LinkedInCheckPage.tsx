// LinkedIn-Check page: content area = LinkedIn-like section cards of the imported profile,
// the draft as copy cards, or the imported PDF; sidebar = Bewertung / KI-Werkzeuge / Quelle & Ziel.
// LinkedIn keeps one profile per language: the language switch in the top bar picks which
// profile (import + draft) is shown, scored and written. Same shell and components as the
// CV-Check (components/check), independent data (linkedin_versions + linkedin_state).
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { StatsReport, Sparks, Database, ViewGrid, Page, User, EditPencil } from "iconoir-react";
import { Topbar } from "../components/Topbar";
import { api } from "../lib/api";
import { PdfViewer, type PdfHighlight } from "../components/check/PdfViewer";
import {
  useCheckShell, readStored, writeStored, SidebarToggle, CheckBody, CheckMain, CheckFrame, CheckSide, PanelHeader, EmptyState, CheckLoading,
} from "../components/check/CheckLayout";
import { ProfileCards } from "../components/linkedin/ProfileCards";
import { DraftCards } from "../components/linkedin/DraftCards";
import { SourcesCard } from "../components/linkedin/SourceSuggestions";
import { useLinkedInCheck, ScoreTab, ToolsTab, SourceTab, draftMode, LI_LANGS, type LiResult, type LiCheckState } from "./LinkedInCheckTabs";

type SideTab = "score" | "tools" | "source";
type View = "cards" | "draft" | "pdf";

/** PDF highlights: the headline and the About opening when their checks have open points. */
function liHighlights(res: LiResult | null | undefined, headline?: string | null, summary?: string | null): PdfHighlight[] {
  if (!res) return [];
  const open = (g: string) => res.checks.filter(c => c.group === g && c.status === "fail");
  const out: PdfHighlight[] = [];
  const h = open("headline");
  if (headline && h.length) out.push({ id: "headline", text: headline.slice(0, 80), tone: "fail", title: h.map(c => c.label).join(" · ") });
  const a = open("about");
  if (summary && a.length) out.push({ id: "about", text: summary.split(/\n/)[0].slice(0, 80), tone: "info", title: a.map(c => c.label).join(" · ") });
  return out;
}

/** Profile languages: imported (filled dot), draft only (ring), none (dim). */
function LangSwitch({ s }: { s: LiCheckState }) {
  const { t } = useTranslation();
  const known = s.langs.map(l => l.lang);
  const list = [...LI_LANGS, ...(known.includes("unknown") ? ["unknown"] : [])];
  return (
    <div className="li-langswitch" role="tablist" aria-label={t("linkedinCheck.lang.switch")}>
      {list.map(l => {
        const info = s.langs.find(x => x.lang === l);
        const state = info?.importId ? "import" : info?.draftId ? "draft" : "none";
        return (
          <button key={l} role="tab" aria-selected={s.lang === l} className="li-lang" data-state={state}
            title={`${t(`linkedinCheck.lang.${l}`)} · ${t(`linkedinCheck.lang.state.${state}`)}`} onClick={() => s.setLang(l)}>
            <span className="li-lang-dot" />{l === "unknown" ? "?" : l.toUpperCase()}
          </button>
        );
      })}
    </div>
  );
}

export function LinkedInCheckPage() {
  const { t, i18n } = useTranslation();
  const s = useLinkedInCheck();
  const { sidebarOpen, setSidebarOpen, tab, setTab, large, setLarge, toggleLarge } = useCheckShell<SideTab>("licheck", "score");
  // Draft card zoom: enlarging a card also enlarges the panel; shrinking either one shrinks both.
  // If the panel was already large before, closing the card leaves it large.
  const [zoom, setZoomState] = useState<string | null>(null);
  const zoomMadeLarge = useRef(false);
  const setZoom = (id: string | null) => {
    if (id && !zoom) { zoomMadeLarge.current = large !== "main"; setLarge("main"); }
    if (!id && zoom && zoomMadeLarge.current) setLarge(null);
    setZoomState(id);
  };
  useEffect(() => { if (large !== "main") setZoomState(null); }, [large]);
  const [view, setViewState] = useState<View>(() => readStored<View>("licheck-view", "cards"));
  const setView = (v: View) => { setViewState(v); writeStored("licheck-view", v); };
  useEffect(() => { setZoom(null); }, [view, s.lang]); // eslint-disable-line react-hooks/exhaustive-deps
  const [focus, setFocus] = useState<string | null>(null);
  const { data: profile } = useQuery({ queryKey: ["profile"], queryFn: async () => (await api.get<{ persona?: string | null }>("/api/profile")).data });

  const ver = s.data?.version ?? null;
  const res = s.data?.result ?? null;
  const draft = s.draft;
  const highlights = useMemo(() => liHighlights(res, ver?.profile.basics.headline, ver?.profile.basics.summary), [res, ver]);

  if (!s.data) return <><Topbar title={t("linkedinCheck.title")} /><CheckLoading error={s.loadErr} /></>;

  // A view the shown language doesn't have falls back: import cards → draft.
  const eff: View = view === "pdf" && ver?.hasPdf ? "pdf" : view === "draft" && draft ? "draft" : ver ? "cards" : draft ? "draft" : "cards";
  const onFocus = (g: string) => { setFocus(g); setTab("score"); if (!sidebarOpen) setSidebarOpen(true); };
  const openTab = (tb: SideTab) => { setTab(tb); setSidebarOpen(true); };
  const shown = eff === "draft" ? draft?.profile : ver?.profile;
  const name = shown ? [shown.basics.firstName, shown.basics.lastName].filter(Boolean).join(" ") : "";
  const langName = s.lang ? t(`linkedinCheck.lang.${s.lang}`) : "";
  const nothingYet = !s.langs.length;
  const mode = draftMode(s);

  return (
    <>
      <Topbar title={t("linkedinCheck.title")} sub={t("linkedinCheck.sub")} actions={
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {!nothingYet && <LangSwitch s={s} />}
          {(ver || draft) && (
            <div className="li-viewswitch" role="tablist" aria-label={t("linkedinCheck.view.label")}>
              {ver && <button role="tab" aria-selected={eff === "cards"} className={`btn ${eff === "cards" ? "btn-primary" : "btn-ghost"}`} onClick={() => setView("cards")}><ViewGrid width={12} height={12} /> {t("linkedinCheck.view.cards")}</button>}
              {draft && <button role="tab" aria-selected={eff === "draft"} className={`btn ${eff === "draft" ? "btn-primary" : "btn-ghost"}`} onClick={() => setView("draft")}><EditPencil width={12} height={12} /> {t("linkedinCheck.view.draft")}</button>}
              {ver?.hasPdf && <button role="tab" aria-selected={eff === "pdf"} className={`btn ${eff === "pdf" ? "btn-primary" : "btn-ghost"}`} onClick={() => setView("pdf")}><Page width={12} height={12} /> PDF</button>}
            </div>
          )}
          <SidebarToggle open={sidebarOpen} onToggle={setSidebarOpen} />
        </div>
      } />

      <CheckBody>
        <CheckMain large={large === "main"}>
          <PanelHeader
            title={shown ? (name || t("linkedinCheck.cards.noName")) : t("linkedinCheck.title")}
            meta={eff === "draft" && draft ? <><span>{t("linkedinCheck.draft.metaLabel", { lang: langName })}</span><span>{new Date(draft.raw.updatedAt).toLocaleDateString(i18n.language)}</span><span>{t("linkedinCheck.totalShort", { total: draft.result.total })}</span></>
              : ver ? <><span>{t(`linkedinCheck.source.kind.${ver.source}`, ver.source)}</span><span>{langName}</span><span>{new Date(ver.createdAt).toLocaleDateString(i18n.language)}</span>{res && <span>{t("linkedinCheck.totalShort", { total: res.total })}</span>}</> : null}
            large={large === "main"} onLarge={() => toggleLarge("main")}
          />
          {!ver && !draft ? (
            <CheckFrame>
              {nothingYet ? (
                <EmptyState icon={<User width={22} height={22} />} text={t(profile?.persona === "berufseinsteiger" ? "linkedinCheck.emptyBuild" : "linkedinCheck.empty")}>
                  <div className="li-actions" style={{ justifyContent: "center" }}>
                    {profile?.persona === "berufseinsteiger"
                      ? <button className="btn btn-primary li-btn" onClick={() => openTab("tools")}><Sparks width={11} height={11} /> {t("linkedinCheck.emptyBuildGo")}</button>
                      : <Link to="/profile" className="btn btn-primary li-btn" style={{ textDecoration: "none" }}>{t("linkedinCheck.emptyConnect")}</Link>}
                    <button className="btn btn-secondary li-btn" onClick={() => openTab("source")}><Database width={11} height={11} /> {t("linkedinCheck.emptyImport")}</button>
                    {profile?.persona !== "berufseinsteiger" && <button className="btn btn-ghost li-btn" onClick={() => openTab("tools")}><Sparks width={11} height={11} /> {t("linkedinCheck.emptyBuildGo")}</button>}
                  </div>
                </EmptyState>
              ) : (
                <EmptyState icon={<User width={22} height={22} />} text={t(`linkedinCheck.lang.empty.${mode}`, { lang: langName })}>
                  <div className="li-actions" style={{ justifyContent: "center" }}>
                    <button className="btn btn-primary li-btn" onClick={() => openTab("tools")}><Sparks width={11} height={11} /> {t("linkedinCheck.lang.createDraft", { lang: langName })}</button>
                    <button className="btn btn-secondary li-btn" onClick={() => openTab("source")}><Database width={11} height={11} /> {t("linkedinCheck.emptyImport")}</button>
                  </div>
                </EmptyState>
              )}
            </CheckFrame>
          ) : eff === "pdf" && ver ? (
            <CheckFrame>
              <PdfViewer url={`/api/linkedin/versions/${ver.id}/pdf`} highlights={highlights} activeId={focus}
                onPick={id => onFocus(id)} />
            </CheckFrame>
          ) : eff === "draft" && draft ? (
            <div className="lic-scroll">
              <DraftCards draft={draft} before={s.langs.find(l => l.lang === s.lang)?.importId ? ver?.profile ?? null : null} busy={s.busyKey === "draft"} onPatch={s.patchDraft} sources={s.sources} zoom={zoom} onZoom={setZoom} />
            </div>
          ) : ver ? (
            <div className="lic-scroll">
              <ProfileCards profile={ver.profile} checks={res?.checks ?? []} onFocus={onFocus} />
            </div>
          ) : null}
        </CheckMain>

        {sidebarOpen && (
          <CheckSide<SideTab> tab={tab} onTab={setTab} large={large === "side"} onLarge={() => toggleLarge("side")} tabs={[
            { id: "score", label: t(eff === "draft" ? "linkedinCheck.tabs.scoreDraft" : "linkedinCheck.tabs.score"), icon: <StatsReport width={13} height={13} /> },
            { id: "tools", label: t("linkedinCheck.tabs.tools"), icon: <Sparks width={13} height={13} /> },
            { id: "source", label: t("linkedinCheck.tabs.source"), icon: <Database width={13} height={13} /> },
          ]}>
            {tab === "score" && <ScoreTab s={s} focusGroup={focus} draft={eff === "draft"} extra={<SourcesCard s={s} />} />}
            {tab === "tools" && <ToolsTab s={s} onShowDraft={() => setView("draft")} />}
            {tab === "source" && <SourceTab s={s} persona={profile?.persona ?? null} />}
          </CheckSide>
        )}
      </CheckBody>
    </>
  );
}
