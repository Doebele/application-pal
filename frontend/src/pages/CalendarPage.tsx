import { useQuery } from "@tanstack/react-query";
import type { Application } from "@application-pal/shared";
import { api } from "../lib/api";
import { Topbar } from "../components/Topbar";
import { Plus, ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTHS = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December"
];

const STAGE_COLORS: Record<string, string> = {
  interview_1: "#34d399", interview_2: "#10b981",
  application_sent: "#a78bfa", pending: "#fbbf24",
};

export function CalendarPage() {
  const { data: applications = [] } = useQuery<Application[]>({
    queryKey: ["applications"],
    queryFn: () => api.get("/api/applications").then((r) => r.data)
  });

  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());

  const firstDay = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  // Mon=0 offset
  let startOffset = firstDay.getDay() - 1;
  if (startOffset < 0) startOffset = 6;

  const cells: (number | null)[] = [
    ...Array(startOffset).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1)
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const interviewApps = applications.filter(
    (a) => a.stage === "interview_1" || a.stage === "interview_2"
  );

  const prev = () => { if (month === 0) { setMonth(11); setYear(y => y - 1); } else setMonth(m => m - 1); };
  const next = () => { if (month === 11) { setMonth(0); setYear(y => y + 1); } else setMonth(m => m + 1); };

  return (
    <>
      <Topbar
        title="Calendar"
        actions={
          <>
            <button className="btn btn-secondary" onClick={prev}><ChevronLeft size={14} /></button>
            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--fg-1)", minWidth: 130, textAlign: "center" }}>
              {MONTHS[month]} {year}
            </span>
            <button className="btn btn-secondary" onClick={next}><ChevronRight size={14} /></button>
            <button className="btn btn-primary"><Plus size={13} /> Event</button>
          </>
        }
      />
      <div className="page-content">
        {/* Interview cards */}
        {interviewApps.length > 0 && (
          <div style={{ marginBottom: 24 }}>
            <div className="eyebrow" style={{ marginBottom: 10 }}>Upcoming Interviews</div>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              {interviewApps.map((a) => (
                <div key={a.id} className="card" style={{ minWidth: 200, maxWidth: 280 }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <span
                      style={{
                        width: 10, height: 10, borderRadius: 2,
                        background: STAGE_COLORS[a.stage] ?? "var(--accent)",
                        flexShrink: 0
                      }}
                    />
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: "var(--fg-1)" }}>{a.company}</div>
                      <div style={{ fontSize: 11, color: "var(--fg-3)" }}>{a.role} · {a.stage === "interview_1" ? "1st Interview" : "2nd Interview"}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Calendar grid */}
        <div className="cal-grid">
          {DAYS.map((d) => (
            <div key={d} className="cal-day-header">{d}</div>
          ))}
          {cells.map((day, i) => (
            <div
              key={i}
              className={`cal-day${day === now.getDate() && month === now.getMonth() && year === now.getFullYear() ? " today" : ""}${!day ? " muted" : ""}`}
            >
              {day && <div className="cal-day-num">{day}</div>}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
