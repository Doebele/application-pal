import { useEffect, useState } from "react";
import i18n from "../i18n";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import {
  Bag, Building, Database, OpenNewWindow, Page,
  RefreshCircle, Plus, Search, Upload, Xmark, ArrowRight
} from "iconoir-react";
import type { KbCompany, KbRole, KbSource } from "@application-pal/shared";
import { Topbar } from "../components/Topbar";
import { api } from "../lib/api";
import { useProfileBasics } from "../lib/persona";
import { guideUrl, topicsFor, type GuideLang, type GuideLink } from "../lib/knowledgeGuide";

type CompaniesResponse = { data: KbCompany[]; limit: number };
type CompanyDetail = KbCompany & { roles: KbRole[]; sources: KbSource[] };
type RoleDetail = KbRole & { company: KbCompany | null; sources: KbSource[] };
type IngestResponse = { companyId: string | null; roleId: string | null; sourceId: string };

function normalizeRequirements(items: unknown): string[] {
  if (Array.isArray(items)) return items.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
  if (typeof items === "string" && items.trim()) return [items.trim()];
  return [];
}

function compactList(items: unknown): string {
  return normalizeRequirements(items).slice(0, 4).join(" · ") || "Keine Anforderungen erfasst";
}

function sourceLabel(source: KbSource): string {
  if (source.kind === "pdf") return source.urlOrPath;
  try {
    return new URL(source.urlOrPath).hostname.replace(/^www\./, "");
  } catch {
    return source.urlOrPath;
  }
}

function AddSourceModal({ onClose, onCreated }: {
  onClose: () => void;
  onCreated: (result: IngestResponse) => void;
}) {
  const [url, setUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);

  const ingest = useMutation({
    mutationFn: async () => {
      if (file) {
        const form = new FormData();
        form.append("file", file);
        const res = await api.post<IngestResponse>("/api/kb/ingest/pdf", form);
        return res.data;
      }
      if (!url.trim()) throw new Error("Bitte URL oder PDF wählen.");
      const res = await api.post<IngestResponse>("/api/kb/ingest/url", { url: url.trim() });
      return res.data;
    },
    onSuccess: onCreated,
    onError: () => setError(i18n.t("ui.kbSourceFailed"))
  });

  return (
    <>
      <div className="drawer-overlay" onClick={onClose} />
      <aside className="drawer" style={{ width: 460 }}>
        <div className="drawer-head">
          <div style={{ flex: 1 }}>
            <div className="eyebrow">Knowledge Base</div>
            <h2 style={{ margin: "3px 0 0", fontSize: 20 }}>{i18n.t("ui.kbAddSource")}</h2>
          </div>
          <button className="icon-btn" onClick={onClose}><Xmark width={15} height={15} /></button>
        </div>
        <div className="drawer-body">
          <div className="field">
            <label>Job-URL</label>
            <input
              className="input-line"
              value={url}
              onChange={(e) => { setUrl(e.target.value); setFile(null); }}
              placeholder="https://firma.ch/jobs/..."
            />
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10, color: "var(--fg-3)", fontSize: 11 }}>
            <div style={{ height: 1, background: "var(--border)", flex: 1 }} />
            oder PDF
            <div style={{ height: 1, background: "var(--border)", flex: 1 }} />
          </div>

          <label
            style={{
              border: "1px dashed var(--border)",
              borderRadius: 12,
              padding: 18,
              background: "var(--surface-2)",
              display: "flex",
              alignItems: "center",
              gap: 12,
              cursor: "pointer"
            }}
          >
            <Upload width={17} height={17} style={{ color: "var(--accent)" }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700 }}>{file ? file.name : "PDF auswählen"}</div>
              <div style={{ color: "var(--fg-3)", fontSize: 11 }}>{i18n.t("ui.kbSourceHint")}</div>
            </div>
            <input
              type="file"
              accept="application/pdf"
              style={{ display: "none" }}
              onChange={(e) => {
                setFile(e.target.files?.[0] ?? null);
                setUrl("");
              }}
            />
          </label>

          {error && <div style={{ color: "var(--red)", fontSize: 12 }}>{error}</div>}
        </div>
        <div className="drawer-footer">
          <button className="btn btn-ghost" onClick={onClose}>{i18n.t("ui.cancel")}</button>
          <button
            className="btn btn-primary"
            disabled={ingest.isPending || (!url.trim() && !file)}
            onClick={() => { setError(null); ingest.mutate(); }}
          >
            {ingest.isPending ? <RefreshCircle width={13} height={13} style={{ animation: "spin 1s linear infinite" }} /> : <Plus width={13} height={13} />}
            Importieren
          </button>
        </div>
      </aside>
    </>
  );
}

function RoleDrawer({ roleId, onClose }: { roleId: string; onClose: () => void }) {
  const { data: role } = useQuery<RoleDetail>({
    queryKey: ["kb-role", roleId],
    queryFn: () => api.get(`/api/kb/roles/${roleId}`).then((r) => r.data)
  });

  return (
    <>
      <div className="drawer-overlay" onClick={onClose} />
      <aside className="drawer" style={{ width: 520 }}>
        <div className="drawer-head">
          <div style={{ flex: 1 }}>
            <div className="eyebrow">{i18n.t("ui.kbRoleDetail")}</div>
            <h2 style={{ margin: "3px 0 0", fontSize: 20 }}>{role?.title ?? "Lade Rolle..."}</h2>
            {role?.company && <div style={{ color: "var(--fg-3)", fontSize: 12 }}>{role.company.name}</div>}
          </div>
          <button className="icon-btn" onClick={onClose}><Xmark width={15} height={15} /></button>
        </div>
        <div className="drawer-body">
          <div className="stat-box">
            <div className="stat-label">{i18n.t("ui.seniority")}</div>
            <div className="stat-value small">{role?.seniority ?? "Nicht erfasst"}</div>
          </div>
          <div className="stat-box">
            <div className="stat-label">{i18n.t("ui.salary")}</div>
            <div className="stat-value small">{role?.salaryRange ?? "Nicht erfasst"}</div>
          </div>
          <div className="card">
            <div className="eyebrow" style={{ marginBottom: 8 }}>{i18n.t("ui.requirements")}</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {(normalizeRequirements(role?.requirements).length ? normalizeRequirements(role?.requirements) : ["Keine Anforderungen erfasst"]).map((item) => (
                <div key={item} style={{ color: "var(--fg-2)", fontSize: 12 }}>• {item}</div>
              ))}
            </div>
          </div>
          <div className="card">
            <div className="eyebrow" style={{ marginBottom: 8 }}>{i18n.t("ui.sources")}</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {(role?.sources ?? []).map((source) => (
                <div key={source.id} style={{ display: "flex", gap: 8, alignItems: "center", color: "var(--fg-2)" }}>
                  <Page width={13} height={13} />
                  <span style={{ flex: 1 }}>{sourceLabel(source)}</span>
                  {source.kind === "url" && <OpenNewWindow width={12} height={12} />}
                </div>
              ))}
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}

// ─── Ratgeber & Links (curated, static — lib/knowledgeGuide.ts) ─────────────

const fold = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

function GuideCard({ link, lang }: { link: GuideLink; lang: GuideLang }) {
  const { t } = useTranslation();
  const url = guideUrl(link, lang);
  const internal = url.startsWith("/");
  const body = (
    <>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
        <strong style={{ flex: 1, fontSize: 13.5, lineHeight: 1.3 }}>{link.title[lang]}</strong>
        {internal ? <ArrowRight width={13} height={13} style={{ color: "var(--accent)", flexShrink: 0, marginTop: 2 }} />
          : <OpenNewWindow width={13} height={13} style={{ color: "var(--fg-3)", flexShrink: 0, marginTop: 2 }} />}
      </div>
      <div style={{ fontSize: 12, color: "var(--fg-2)", lineHeight: 1.45, marginTop: 4 }}>{link.desc[lang]}</div>
      <div className="mono" style={{ fontSize: 10.5, color: internal ? "var(--accent)" : "var(--fg-3)", marginTop: 8 }}>
        {internal ? t("knowledge.inApp") : link.source}
      </div>
    </>
  );
  const style: React.CSSProperties = {
    display: "block", textDecoration: "none", color: "var(--fg-1)", border: "1px solid var(--border)",
    background: "var(--surface)", borderRadius: 12, padding: 12, fontFamily: "var(--font-sans)",
  };
  return internal
    ? <Link to={url} style={style} className="kb-guide-card">{body}</Link>
    : <a href={url} target="_blank" rel="noreferrer" style={style} className="kb-guide-card">{body}</a>;
}

function GuideView() {
  const { t, i18n: inst } = useTranslation();
  const lang = (["de", "en", "fr"].includes(inst.language?.slice(0, 2)) ? inst.language.slice(0, 2) : "de") as GuideLang;
  const { isSchool, ravEnabled } = useProfileBasics();
  const [showAll, setShowAll] = useState(false);
  const [q, setQ] = useState("");
  const needle = fold(q.trim());
  const topics = topicsFor({ isSchool, ravEnabled, showAll: showAll || !!needle })
    .map(tp => ({ ...tp, links: needle ? tp.links.filter(l => fold(`${l.title[lang]} ${l.desc[lang]} ${l.source} ${tp.title[lang]}`).includes(needle)) : tp.links }))
    .filter(tp => tp.links.length);

  return (
    <main style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "18px 24px 40px" }}>
      <div style={{ maxWidth: 1100 }}>
        <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap", marginBottom: 6 }}>
          <div className="input-line-wrap" style={{ flex: "1 1 260px", maxWidth: 380 }}>
            <Search width={13} height={13} className="input-line-icon" />
            <input className="input-line" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("knowledge.guideSearch")} />
          </div>
          <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12, color: "var(--fg-2)", cursor: "pointer" }}>
            <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} /> {t("knowledge.showAll")}
          </label>
        </div>
        <div style={{ fontSize: 11.5, color: "var(--fg-3)", marginBottom: 18 }}>{t("knowledge.guideNote")}</div>
        {!topics.length && <div style={{ color: "var(--fg-3)", fontSize: 13 }}>{t("knowledge.noMatch")}</div>}
        {topics.map(tp => (
          <section key={tp.id} style={{ marginBottom: 26 }}>
            <h2 style={{ margin: "0 0 4px", fontSize: 17 }}>{tp.title[lang]}</h2>
            <div style={{ fontSize: 12.5, color: "var(--fg-2)", lineHeight: 1.5, marginBottom: 10, maxWidth: 760 }}>{tp.intro[lang]}</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(250px, 1fr))", gap: 10 }}>
              {tp.links.map(l => <GuideCard key={l.id} link={l} lang={lang} />)}
            </div>
          </section>
        ))}
      </div>
    </main>
  );
}

export function KnowledgeBasePage() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<"guide" | "companies">(() => {
    try { return localStorage.getItem("kb-tab") === "companies" ? "companies" : "guide"; } catch { return "guide"; }
  });
  const pick = (v: "guide" | "companies") => { setTab(v); try { localStorage.setItem("kb-tab", v); } catch { /* ignore */ } };
  const tabs = (
    <div className="tabs" style={{ padding: "0 24px", flexShrink: 0 }}>
      <button className={`tab${tab === "guide" ? " active" : ""}`} onClick={() => pick("guide")}>{t("knowledge.tabGuide")}</button>
      <button className={`tab${tab === "companies" ? " active" : ""}`} onClick={() => pick("companies")}>{t("knowledge.tabCompanies")}</button>
    </div>
  );
  return tab === "guide"
    ? <><Topbar title={t("nav.knowledge")} sub={t("knowledge.guideSub")} />{tabs}<GuideView /></>
    : <CompaniesView tabs={tabs} />;
}

function CompaniesView({ tabs }: { tabs: React.ReactNode }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [q, setQ] = useState("");
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(null);
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null);
  const [addingSource, setAddingSource] = useState(false);

  const { data: companiesResponse, isLoading } = useQuery<CompaniesResponse>({
    queryKey: ["kb-companies", q],
    queryFn: () => api.get("/api/kb/companies", { params: { q: q || undefined, limit: 50 } }).then((r) => r.data)
  });
  const companies = companiesResponse?.data ?? [];

  useEffect(() => {
    if (!selectedCompanyId && companies[0]) setSelectedCompanyId(companies[0].id);
  }, [companies, selectedCompanyId]);

  const { data: selectedCompany } = useQuery<CompanyDetail>({
    queryKey: ["kb-company", selectedCompanyId],
    enabled: Boolean(selectedCompanyId),
    queryFn: () => api.get(`/api/kb/companies/${selectedCompanyId}`).then((r) => r.data)
  });

  const addButton = (
    <button className="btn btn-primary" onClick={() => setAddingSource(true)}>
      <Plus width={13} height={13} /> Add Source
    </button>
  );

  return (
    <>
      <Topbar title={t("nav.knowledge")} sub={t("knowledge.companiesCount", { count: companies.length })} actions={addButton} />
      {tabs}
      <main style={{ flex: 1, minHeight: 0, display: "grid", gridTemplateColumns: "360px 1fr", gap: 0 }}>
        <section style={{ borderRight: "1px solid var(--border)", padding: 18, overflowY: "auto" }}>
          <div className="input-line-wrap" style={{ marginBottom: 14 }}>
            <Search width={13} height={13} className="input-line-icon" />
            <input
              className="input-line"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={i18n.t("ui.kbSearchPh")}
            />
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {isLoading && <div className="skeleton" style={{ height: 48 }} />}
            {companies.map((company) => (
              <button
                key={company.id}
                onClick={() => setSelectedCompanyId(company.id)}
                style={{
                  textAlign: "left",
                  border: `1px solid ${selectedCompanyId === company.id ? "var(--accent)" : "var(--border)"}`,
                  background: selectedCompanyId === company.id ? "var(--accent-08)" : "var(--surface)",
                  color: "var(--fg-1)",
                  borderRadius: 12,
                  padding: 12,
                  cursor: "pointer",
                  fontFamily: "var(--font-sans)"
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <Building width={15} height={15} style={{ color: "var(--accent)" }} />
                  <strong>{company.name}</strong>
                </div>
                <div style={{ marginTop: 4, color: "var(--fg-3)", fontSize: 11 }}>
                  {[company.industry, company.headquarters].filter(Boolean).join(" · ") || "Noch keine Metadaten"}
                </div>
              </button>
            ))}
          </div>
        </section>

        <section style={{ padding: 22, overflowY: "auto" }}>
          {!selectedCompany ? (
            <div className="card" style={{ height: "100%", display: "grid", placeItems: "center", color: "var(--fg-3)" }}>
              <div style={{ textAlign: "center" }}>
                <Database width={28} height={28} style={{ marginBottom: 8 }} />
                <div>Quelle hinzufügen, um die Knowledge Base aufzubauen.</div>
              </div>
            </div>
          ) : (
            <div style={{ maxWidth: 920 }}>
              <div style={{ display: "flex", gap: 14, alignItems: "flex-start", marginBottom: 20 }}>
                <div style={{ width: 44, height: 44, borderRadius: 12, background: "var(--accent-08)", color: "var(--accent)", display: "grid", placeItems: "center" }}>
                  <Building width={21} height={21} />
                </div>
                <div>
                  <div className="eyebrow">{selectedCompany.industry ?? "Company"}</div>
                  <h2 style={{ margin: "2px 0", fontSize: 28 }}>{selectedCompany.name}</h2>
                  <div style={{ color: "var(--fg-3)" }}>
                    {[selectedCompany.headquarters, selectedCompany.size, selectedCompany.website].filter(Boolean).join(" · ")}
                  </div>
                </div>
              </div>

              <div className="card" style={{ marginBottom: 14 }}>
                <div className="eyebrow" style={{ marginBottom: 8 }}>{i18n.t("ui.cultureNotes")}</div>
                <div style={{ color: "var(--fg-2)" }}>{selectedCompany.cultureNotes ?? "Keine Kulturnotizen extrahiert."}</div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                <div className="card">
                  <div className="eyebrow" style={{ marginBottom: 10 }}>{i18n.t("ui.linkedRoles")}</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {selectedCompany.roles.map((role) => (
                      <button
                        key={role.id}
                        onClick={() => setSelectedRoleId(role.id)}
                        style={{
                          border: "1px solid var(--border)",
                          background: "var(--surface-2)",
                          color: "var(--fg-1)",
                          borderRadius: 10,
                          padding: 11,
                          textAlign: "left",
                          cursor: "pointer",
                          fontFamily: "var(--font-sans)"
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <Bag width={14} height={14} style={{ color: "var(--accent)" }} />
                          <strong>{role.title}</strong>
                        </div>
                        <div style={{ color: "var(--fg-3)", fontSize: 11, marginTop: 4 }}>
                          {role.seniority ?? "Seniority offen"} · {compactList(role.requirements)}
                        </div>
                      </button>
                    ))}
                    {selectedCompany.roles.length === 0 && <div style={{ color: "var(--fg-3)" }}>{i18n.t("ui.noRoles")}</div>}
                  </div>
                </div>

                <div className="card">
                  <div className="eyebrow" style={{ marginBottom: 10 }}>{i18n.t("ui.sources")}</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {selectedCompany.sources.map((source) => (
                      <div key={source.id} style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--fg-2)" }}>
                        {source.kind === "pdf" ? <Page width={14} height={14} /> : <OpenNewWindow width={14} height={14} />}
                        <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {sourceLabel(source)}
                        </span>
                        <span className="mono" style={{ fontSize: 10, color: "var(--fg-3)" }}>{source.status}</span>
                      </div>
                    ))}
                    {selectedCompany.sources.length === 0 && <div style={{ color: "var(--fg-3)" }}>{i18n.t("ui.noSources")}</div>}
                  </div>
                </div>
              </div>
            </div>
          )}
        </section>
      </main>

      {addingSource && (
        <AddSourceModal
          onClose={() => setAddingSource(false)}
          onCreated={(result) => {
            queryClient.invalidateQueries({ queryKey: ["kb-companies"] });
            if (result.companyId) setSelectedCompanyId(result.companyId);
            setAddingSource(false);
          }}
        />
      )}
      {selectedRoleId && <RoleDrawer roleId={selectedRoleId} onClose={() => setSelectedRoleId(null)} />}
    </>
  );
}
