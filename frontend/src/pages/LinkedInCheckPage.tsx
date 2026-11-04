// LinkedIn-Check page: content area = LinkedIn-like section cards (or the imported PDF),
// sidebar = Bewertung / KI-Werkzeuge / Quelle & Ziel. Same shell and components as the
// CV-Check (components/check), independent data (linkedin_versions + linkedin_state).
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { StatsReport, Sparks, Database, ViewGrid, Page, User } from "iconoir-react";
import { Topbar } from "../components/Topbar";
import { api } from "../lib/api";
import { PdfViewer, type PdfHighlight } from "../components/check/PdfViewer";
import {
  useCheckShell, readStored, writeStored, SidebarToggle, CheckBody, CheckMain, CheckFrame, CheckSide, PanelHeader, EmptyState, CheckLoading,
} from "../components/check/CheckLayout";
import { ProfileCards } from "../components/linkedin/ProfileCards";
import { useLinkedInCheck, ScoreTab, ToolsTab, SourceTab, type LiResult } from "./LinkedInCheckTabs";

type SideTab = "score" | "tools" | "source";
type View = "cards" | "pdf";

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

export function LinkedInCheckPage() {
  const { t, i18n } = useTranslation();
  const s = useLinkedInCheck();
  const { sidebarOpen, setSidebarOpen, tab, setTab, large, toggleLarge } = useCheckShell<SideTab>("licheck", "score");
  const [view, setViewState] = useState<View>(() => readStored<View>("licheck-view", "cards"));
  const setView = (v: View) => { setViewState(v); writeStored("licheck-view", v); };
  const [focus, setFocus] = useState<string | null>(null);
  const { data: profile } = useQuery({ queryKey: ["profile"], queryFn: async () => (await api.get<{ persona?: string | null }>("/api/profile")).data });

  const ver = s.data?.version ?? null;
  const res = s.data?.result ?? null;
  const highlights = useMemo(() => liHighlights(res, ver?.profile.basics.headline, ver?.profile.basics.summary), [res, ver]);

  if (!s.data) return <><Topbar title={t("linkedinCheck.title")} /><CheckLoading error={s.loadErr} /></>;

  const onFocus = (g: string) => { setFocus(g); setTab("score"); if (!sidebarOpen) setSidebarOpen(true); };
  const showPdf = view === "pdf" && ver?.hasPdf;
  const name = ver ? [ver.profile.basics.firstName, ver.profile.basics.lastName].filter(Boolean).join(" ") : "";

  return (
    <>
      <Topbar title={t("linkedinCheck.title")} sub={t("linkedinCheck.sub")} actions={
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {ver?.hasPdf && (
            <div className="li-viewswitch" role="tablist" aria-label={t("linkedinCheck.view.label")}>
              <button role="tab" aria-selected={view === "cards"} className={`btn ${view === "cards" ? "btn-primary" : "btn-ghost"}`} onClick={() => setView("cards")}><ViewGrid width={12} height={12} /> {t("linkedinCheck.view.cards")}</button>
              <button role="tab" aria-selected={view === "pdf"} className={`btn ${view === "pdf" ? "btn-primary" : "btn-ghost"}`} onClick={() => setView("pdf")}><Page width={12} height={12} /> PDF</button>
            </div>
          )}
          <SidebarToggle open={sidebarOpen} onToggle={setSidebarOpen} />
        </div>
      } />

      <CheckBody>
        <CheckMain large={large === "main"}>
          <PanelHeader
            title={ver ? (name || t("linkedinCheck.cards.noName")) : t("linkedinCheck.title")}
            meta={ver ? <><span>{t(`linkedinCheck.source.kind.${ver.source}`, ver.source)}</span><span>{new Date(ver.createdAt).toLocaleDateString(i18n.language)}</span>{res && <span>{t("linkedinCheck.totalShort", { total: res.total })}</span>}</> : null}
            large={large === "main"} onLarge={() => toggleLarge("main")}
          />
          {!ver ? (
            <CheckFrame>
              <EmptyState icon={<User width={22} height={22} />} text={t("linkedinCheck.empty")}>
                <div className="li-actions" style={{ justifyContent: "center" }}>
                  <Link to="/profile" className="btn btn-primary li-btn" style={{ textDecoration: "none" }}>{t("linkedinCheck.emptyConnect")}</Link>
                  <button className="btn btn-secondary li-btn" onClick={() => { setTab("source"); setSidebarOpen(true); }}><Database width={11} height={11} /> {t("linkedinCheck.emptyImport")}</button>
                </div>
              </EmptyState>
            </CheckFrame>
          ) : showPdf ? (
            <CheckFrame>
              <PdfViewer url={`/api/linkedin/versions/${ver.id}/pdf`} highlights={highlights} activeId={focus}
                onPick={id => onFocus(id)} />
            </CheckFrame>
          ) : (
            <div className="lic-scroll">
              <ProfileCards profile={ver.profile} checks={res?.checks ?? []} onFocus={onFocus} />
            </div>
          )}
        </CheckMain>

        {sidebarOpen && (
          <CheckSide<SideTab> tab={tab} onTab={setTab} large={large === "side"} onLarge={() => toggleLarge("side")} tabs={[
            { id: "score", label: t("linkedinCheck.tabs.score"), icon: <StatsReport width={13} height={13} /> },
            { id: "tools", label: t("linkedinCheck.tabs.tools"), icon: <Sparks width={13} height={13} /> },
            { id: "source", label: t("linkedinCheck.tabs.source"), icon: <Database width={13} height={13} /> },
          ]}>
            {tab === "score" && <ScoreTab s={s} focusGroup={focus} />}
            {tab === "tools" && <ToolsTab s={s} />}
            {tab === "source" && <SourceTab s={s} persona={profile?.persona ?? null} />}
          </CheckSide>
        )}
      </CheckBody>
    </>
  );
}
