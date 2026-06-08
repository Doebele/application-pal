import { useState } from "react";

type Token = { name: string; value: string; label?: string };

const COLOR_GROUPS: { title: string; tokens: Token[] }[] = [
  {
    title: "Backgrounds",
    tokens: [
      { name: "--bg",        value: "#0d0e12",  label: "bg" },
      { name: "--surface",   value: "#13141a",  label: "surface" },
      { name: "--surface-2", value: "#1a1b23",  label: "surface-2" },
      { name: "--bg-elevated", value: "#20212c", label: "bg-elevated" },
    ],
  },
  {
    title: "Text",
    tokens: [
      { name: "--fg-1", value: "#f0f1f5", label: "fg-1 (primary)" },
      { name: "--fg-2", value: "#b4bfcc", label: "fg-2 (secondary)" },
      { name: "--fg-3", value: "#8896a8", label: "fg-3 (muted)" },
    ],
  },
  {
    title: "Accent (default: Indigo)",
    tokens: [
      { name: "--accent",    value: "#3b82f6",              label: "accent" },
      { name: "--accent-08", value: "rgba(59,130,246,0.08)", label: "accent-08" },
      { name: "--accent-15", value: "rgba(59,130,246,0.15)", label: "accent-15" },
      { name: "--accent-35", value: "rgba(59,130,246,0.35)", label: "accent-35" },
    ],
  },
  {
    title: "Accent Presets",
    tokens: [
      { name: "indigo",  value: "#3b82f6", label: "Indigo" },
      { name: "violet",  value: "#8b5cf6", label: "Violet" },
      { name: "emerald", value: "#10b981", label: "Emerald" },
      { name: "amber",   value: "#f59e0b", label: "Amber" },
      { name: "rose",    value: "#f43f5e", label: "Rose" },
    ],
  },
  {
    title: "Semantic",
    tokens: [
      { name: "--green",  value: "#4ade80", label: "green (success)" },
      { name: "--red",    value: "#f87171", label: "red (danger)" },
      { name: "--yellow", value: "#fbbf24", label: "yellow (warning)" },
    ],
  },
  {
    title: "Borders",
    tokens: [
      { name: "--border",   value: "rgba(255,255,255,0.10)", label: "border" },
      { name: "--border-2", value: "rgba(255,255,255,0.06)", label: "border-2 (subtle)" },
    ],
  },
  {
    title: "Score Badges",
    tokens: [
      { name: "--score-high", value: "#34d399", label: "high" },
      { name: "--score-mid",  value: "#fbbf24", label: "mid" },
      { name: "--score-low",  value: "#f87171", label: "low" },
    ],
  },
  {
    title: "Application Stages",
    tokens: [
      { name: "--stage-import_validating", value: "#94a3b8", label: "Validating" },
      { name: "--stage-preparing_cv",      value: "#60a5fa", label: "Preparing CV" },
      { name: "--stage-preparing_letter",  value: "#22d3ee", label: "Preparing Letter" },
      { name: "--stage-application_sent",  value: "#a78bfa", label: "Application Sent" },
      { name: "--stage-pending",           value: "#fbbf24", label: "Pending" },
      { name: "--stage-interview_1",       value: "#34d399", label: "Interview 1" },
      { name: "--stage-interview_2",       value: "#10b981", label: "Interview 2" },
      { name: "--stage-rejected",          value: "#f87171", label: "Rejected" },
      { name: "--stage-accepted",          value: "#84cc16", label: "Accepted" },
    ],
  },
];

const FONT_FAMILIES = [
  { name: "--font-sans",  value: "'Fira Sans', system-ui, sans-serif",       sample: "Fira Sans — The primary UI typeface",                  weight: "300–700",  role: "Body / UI" },
  { name: "--font-serif", value: "'Libre Caslon Text', Georgia, serif",      sample: "Libre Caslon Text — Display & brand text",             weight: "400, 700", role: "Display / Brand" },
  { name: "--font-mono",  value: "'Fira Mono', ui-monospace, monospace",     sample: "Fira Mono — Numbers, code, metadata",                  weight: "400, 500", role: "Monospace / Numbers" },
];

const FONT_SIZES = [
  { label: "9px",   usage: "Section labels, rail section labels" },
  { label: "10px",  usage: "Stat labels, calendar day headers, badge text" },
  { label: "10.5px", usage: "Chips, tags, job footer, muted meta" },
  { label: "11px",  usage: "Topbar sub, page sub, eyebrow, settings sub" },
  { label: "12px",  usage: "Rail buttons, tabs, btns, column heads, select" },
  { label: "12.5px", usage: "Input fields, activity text, topbar search" },
  { label: "13px",  usage: "Body text (base), job title, field input, md-body" },
  { label: "16px",  usage: "Topbar h1, stat value (large)" },
  { label: "17px",  usage: "Brand name in rail header" },
  { label: "18px",  usage: "Stat value" },
  { label: "20px",  usage: "Page title" },
];

const FONT_WEIGHTS = [
  { weight: "400", label: "Regular",   usage: "Body text, descriptions, metadata" },
  { weight: "500", label: "Medium",    usage: "Rail buttons, mode toggles, input labels" },
  { weight: "600", label: "Semibold",  usage: "Tabs active, btn text, rail btn active" },
  { weight: "700", label: "Bold",      usage: "Headings, job title, stat values, brand" },
  { weight: "800", label: "Extrabold", usage: "Brand mark letter" },
];

const RADIUS_TOKENS = [
  { name: "--r-xs",   value: "4px" },
  { name: "--r-sm",   value: "5px" },
  { name: "--r-md",   value: "8px" },
  { name: "--r-lg",   value: "10px" },
  { name: "--r-xl",   value: "12px" },
  { name: "--r-2xl",  value: "18px" },
  { name: "--r-pill", value: "999px" },
];

function Swatch({ color, label, token }: { color: string; label?: string; token: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(color).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    });
  };

  const isTransparent = color.startsWith("rgba");
  const checkered = isTransparent
    ? "repeating-conic-gradient(#888 0% 25%, transparent 0% 50%) 0 0 / 8px 8px"
    : undefined;

  return (
    <div
      style={{ display: "flex", flexDirection: "column", gap: 6, cursor: "pointer", minWidth: 100, maxWidth: 140 }}
      onClick={copy}
      title={`Click to copy: ${color}`}
    >
      <div
        style={{
          height: 52,
          borderRadius: "var(--r-md)",
          background: checkered ? `${color}, ${checkered}` : color,
          border: "1px solid var(--border)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 11,
          fontFamily: "var(--font-mono)",
          color: "#fff",
          textShadow: "0 1px 2px rgba(0,0,0,0.6)",
          transition: "opacity 0.1s",
        }}
      >
        {copied ? "✓ copied" : ""}
      </div>
      <div style={{ fontSize: 11, fontWeight: 600, color: "var(--fg-1)" }}>{label ?? token}</div>
      <div style={{ fontSize: 10, fontFamily: "var(--font-mono)", color: "var(--fg-3)" }}>{color}</div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <h2 style={{ margin: 0, fontSize: 13, fontWeight: 700, color: "var(--fg-3)", textTransform: "uppercase", letterSpacing: "0.08em" }}>{title}</h2>
      {children}
    </div>
  );
}

export function DesignSystemPage() {
  return (
    <div className="page-content" style={{ background: "var(--bg)", minHeight: "100%", padding: "24px 32px" }}>
      <div className="page-header">
        <div>
          <h1 className="page-title">Design System</h1>
          <p className="page-sub">All design tokens — colors, typography, radius, and stylesheets overview</p>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 40 }}>

        {/* ── COLORS ───────────────────────────────────────────────── */}
        <Section title="Colors">
          <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
            {COLOR_GROUPS.map((group) => (
              <div key={group.title} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "var(--fg-2)" }}>{group.title}</div>
                <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                  {group.tokens.map((t) => (
                    <Swatch key={t.name} color={t.value} label={t.label} token={t.name} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Section>

        {/* ── TYPOGRAPHY ──────────────────────────────────────────── */}
        <Section title="Typography">
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {FONT_FAMILIES.map((f) => (
              <div
                key={f.name}
                style={{
                  background: "var(--surface)",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--r-xl)",
                  padding: "16px 20px",
                  display: "flex",
                  flexDirection: "column",
                  gap: 6,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span className="chip" style={{ fontFamily: "var(--font-mono)", fontSize: 10 }}>{f.role}</span>
                  <span style={{ fontSize: 10, fontFamily: "var(--font-mono)", color: "var(--fg-3)" }}>{f.name}</span>
                </div>
                <div style={{ fontSize: 22, fontFamily: f.value, color: "var(--fg-1)", lineHeight: 1.3 }}>{f.sample}</div>
                <div style={{ fontSize: 10.5, color: "var(--fg-3)" }}>
                  Stack: <span style={{ fontFamily: "var(--font-mono)" }}>{f.value}</span> · Weights: {f.weight}
                </div>
              </div>
            ))}
          </div>
        </Section>

        {/* ── FONT SIZES ──────────────────────────────────────────── */}
        <Section title="Font Sizes">
          <div
            style={{
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: "var(--r-xl)",
              overflow: "hidden",
            }}
          >
            {FONT_SIZES.map((s, i) => (
              <div
                key={s.label}
                style={{
                  display: "flex",
                  alignItems: "baseline",
                  gap: 16,
                  padding: "10px 20px",
                  borderBottom: i < FONT_SIZES.length - 1 ? "1px solid var(--border-2)" : undefined,
                }}
              >
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--fg-3)", minWidth: 48 }}>{s.label}</span>
                <span style={{ fontSize: s.label, color: "var(--fg-1)", flex: 1, lineHeight: 1.4 }}>Aa Bb Cc — {s.usage}</span>
              </div>
            ))}
          </div>
        </Section>

        {/* ── FONT WEIGHTS ────────────────────────────────────────── */}
        <Section title="Font Weights">
          <div
            style={{
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: "var(--r-xl)",
              overflow: "hidden",
            }}
          >
            {FONT_WEIGHTS.map((w, i) => (
              <div
                key={w.weight}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 16,
                  padding: "12px 20px",
                  borderBottom: i < FONT_WEIGHTS.length - 1 ? "1px solid var(--border-2)" : undefined,
                }}
              >
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--fg-3)", minWidth: 32 }}>{w.weight}</span>
                <span style={{ fontSize: 15, fontWeight: parseInt(w.weight), color: "var(--fg-1)", minWidth: 100 }}>{w.label}</span>
                <span style={{ fontSize: 11, color: "var(--fg-3)" }}>{w.usage}</span>
              </div>
            ))}
          </div>
        </Section>

        {/* ── BORDER RADIUS ───────────────────────────────────────── */}
        <Section title="Border Radius">
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            {RADIUS_TOKENS.map((r) => (
              <div
                key={r.name}
                style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}
              >
                <div
                  style={{
                    width: 56,
                    height: 56,
                    background: "var(--accent-15)",
                    border: "1px solid var(--accent-35)",
                    borderRadius: r.value,
                  }}
                />
                <div style={{ fontSize: 10.5, fontFamily: "var(--font-mono)", color: "var(--fg-2)", textAlign: "center" }}>{r.name}</div>
                <div style={{ fontSize: 10, color: "var(--fg-3)" }}>{r.value}</div>
              </div>
            ))}
          </div>
        </Section>

        {/* ── STYLESHEET REFERENCE ────────────────────────────────── */}
        <Section title="Stylesheet Reference">
          <div
            style={{
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: "var(--r-xl)",
              overflow: "hidden",
            }}
          >
            {[
              { file: "src/index.css",             role: "Global design tokens (CSS vars), base reset, layout, all component classes" },
              { file: "tailwind.config.ts",         role: "Tailwind theme extension — maps CSS vars to Tailwind color utilities (bg, surface, text, muted, accent)" },
              { file: "postcss.config.js",          role: "PostCSS pipeline — Tailwind + Autoprefixer" },
            ].map((s, i, arr) => (
              <div
                key={s.file}
                style={{
                  display: "flex",
                  gap: 12,
                  padding: "14px 20px",
                  borderBottom: i < arr.length - 1 ? "1px solid var(--border-2)" : undefined,
                }}
              >
                <code style={{ fontFamily: "var(--font-mono)", fontSize: 11.5, color: "var(--accent)", minWidth: 200 }}>{s.file}</code>
                <span style={{ fontSize: 12.5, color: "var(--fg-2)" }}>{s.role}</span>
              </div>
            ))}
          </div>
        </Section>

      </div>
    </div>
  );
}
