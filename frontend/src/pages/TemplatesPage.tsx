import { Topbar } from "../components/Topbar";
import { Plus } from "lucide-react";

const TEMPLATES = [
  { icon: "📄", title: "Software Engineer CV",        sub: "Generic template for tech roles",          category: "CV" },
  { icon: "📄", title: "Product Designer CV",          sub: "Portfolio-focused layout",                 category: "CV" },
  { icon: "📄", title: "Frontend Engineer CV",         sub: "React / TypeScript emphasis",              category: "CV" },
  { icon: "✉️", title: "Standard Cover Letter",        sub: "Formal, professional tone",                category: "Letter" },
  { icon: "✉️", title: "Startup Cover Letter",         sub: "Energetic, mission-driven",                category: "Letter" },
  { icon: "✉️", title: "Career-Change Letter",         sub: "Highlights transferable skills",           category: "Letter" },
  { icon: "🧩", title: "Summary Block — Senior",       sub: "10+ years experience framing",             category: "Block" },
  { icon: "🧩", title: "Summary Block — Mid-Level",    sub: "3–7 years, growth-oriented",               category: "Block" },
  { icon: "🧩", title: "Remote Work Block",            sub: "Async communication, time-zone experience",category: "Block" },
  { icon: "🧩", title: "Fintech Specialization Block", sub: "Compliance, regulated environments",       category: "Block" },
  { icon: "🧩", title: "Berlin / DACH Block",          sub: "German market conventions",                category: "Block" },
  { icon: "🧩", title: "Open Source Block",            sub: "Community contributions, OSS impact",     category: "Block" },
];

const CATEGORIES = ["All", "CV", "Letter", "Block"];

export function TemplatesPage() {
  return (
    <>
      <Topbar
        title="Templates"
        sub="Reusable CV blocks, cover letter starters, and summary snippets"
        actions={
          <button className="btn btn-primary"><Plus size={13} /> New template</button>
        }
      />
      <div className="page-content">
        {CATEGORIES.slice(1).map((cat) => {
          const items = TEMPLATES.filter((t) => t.category === cat);
          return (
            <div key={cat} style={{ marginBottom: 32 }}>
              <div className="eyebrow" style={{ marginBottom: 12 }}>{cat}</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12 }}>
                {items.map((tpl) => (
                  <div key={tpl.title} className="template-card">
                    <div className="template-card-icon">{tpl.icon}</div>
                    <div className="template-card-title">{tpl.title}</div>
                    <div className="template-card-sub">{tpl.sub}</div>
                  </div>
                ))}
                <div
                  className="template-card"
                  style={{ border: "1px dashed var(--border)", background: "transparent", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, color: "var(--fg-3)", fontSize: 12, minHeight: 90 }}
                >
                  <Plus size={14} /> New {cat}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
