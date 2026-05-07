import { useQuery } from "@tanstack/react-query";
import type { Application } from "@application-pal/shared";
import { api } from "../lib/api";
import { Topbar } from "../components/Topbar";
import { SlidersHorizontal } from "lucide-react";

const STAGE_LABELS: Record<string, string> = {
  import_validating: "Inbox", preparing_cv: "Preparing CV",
  preparing_letter: "Preparing Letter", application_sent: "Submitted",
  pending: "Pending", interview_1: "1st Interview",
  interview_2: "2nd Interview", rejected: "Rejected", accepted: "Accepted"
};

function getCompanyColor(company: string): string {
  const colors = ["#3b82f6","#8b5cf6","#10b981","#f59e0b","#f43f5e","#06b6d4","#84cc16","#f97316"];
  let hash = 0;
  for (let i = 0; i < company.length; i++) hash = company.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
}

type ActivityEvent = {
  app: Application;
  text: string;
  time: Date;
};

export function TimelinePage() {
  const { data: applications = [] } = useQuery<Application[]>({
    queryKey: ["applications"],
    queryFn: () => api.get("/api/applications").then((r) => r.data)
  });

  const events: ActivityEvent[] = applications
    .flatMap((app) => {
      const evs: ActivityEvent[] = [
        { app, text: `Created application at ${app.company}`, time: new Date(app.createdAt) }
      ];
      if (app.appliedAt) {
        evs.push({ app, text: `Submitted application to ${app.company}`, time: new Date(app.appliedAt) });
      }
      if (new Date(app.updatedAt).getTime() !== new Date(app.createdAt).getTime()) {
        evs.push({
          app,
          text: `Updated — now in "${STAGE_LABELS[app.stage] ?? app.stage}"`,
          time: new Date(app.updatedAt)
        });
      }
      return evs;
    })
    .sort((a, b) => b.time.getTime() - a.time.getTime());

  return (
    <>
      <Topbar
        title="Timeline"
        sub="Workspace activity — all changes across applications"
        actions={
          <button className="btn btn-secondary"><SlidersHorizontal size={13} /> Filter</button>
        }
      />
      <div className="page-content" style={{ maxWidth: 640 }}>
        {events.length === 0 ? (
          <div style={{ color: "var(--fg-3)", fontSize: 13, textAlign: "center", padding: "60px 0" }}>
            No activity yet. Import your first application to get started.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
            {events.map((ev, i) => (
              <div key={i} style={{ display: "flex", gap: 16, paddingBottom: 16 }}>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 0 }}>
                  <div
                    style={{
                      width: 10, height: 10, borderRadius: 999,
                      background: getCompanyColor(ev.app.company),
                      flexShrink: 0, marginTop: 4
                    }}
                  />
                  {i < events.length - 1 && (
                    <div style={{ width: 1, flex: 1, background: "var(--border-2)", marginTop: 4 }} />
                  )}
                </div>
                <div style={{ flex: 1, paddingBottom: 8 }}>
                  <div style={{ fontSize: 12.5, color: "var(--fg-2)", fontWeight: 500 }}>
                    {ev.text}
                  </div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 3 }}>
                    <span style={{ fontSize: 10.5, color: "var(--fg-3)", fontFamily: "var(--font-mono)" }}>
                      {ev.time.toLocaleString()}
                    </span>
                    <span className={`chip chip-stage stage-${ev.app.stage}`} style={{ fontSize: 9.5, padding: "1px 6px" }}>
                      {STAGE_LABELS[ev.app.stage]}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
