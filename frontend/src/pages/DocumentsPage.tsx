import { useState, useEffect, useCallback } from "react";
import {
  FileText, Link2, Image, Plus, Trash2, ExternalLink,
  Award, Users, GraduationCap, Briefcase, FolderOpen, Pencil, Check, X,
  List, LayoutGrid, Maximize2, Minimize2, Loader, FileEdit
} from "lucide-react";
import { Topbar } from "../components/Topbar";
import { api } from "../lib/api";
import type { UserDocument } from "@application-pal/shared";

// ─── Types ────────────────────────────────────────────────────────────────────
type Category = "lebenslauf" | "motivationsschreiben" | "zeugnis" | "referenz" | "zertifikat" | "figma" | "portfolio" | "sonstiges";
type FileType  = "pdf" | "link" | "figma" | "image" | "gdoc";
type ViewMode  = "list" | "tabs";

// ─── Custom Icons ─────────────────────────────────────────────────────────────
const FigmaIcon = ({ size = 14 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 5.5A3.5 3.5 0 0 1 8.5 2H12v7H8.5A3.5 3.5 0 0 1 5 5.5z"/>
    <path d="M12 2h3.5a3.5 3.5 0 1 1 0 7H12V2z"/>
    <path d="M12 12.5a3.5 3.5 0 1 1 7 0 3.5 3.5 0 1 1-7 0z"/>
    <path d="M5 19.5A3.5 3.5 0 0 1 8.5 16H12v3.5a3.5 3.5 0 1 1-7 0z"/>
    <path d="M5 12.5A3.5 3.5 0 0 1 8.5 9H12v7H8.5A3.5 3.5 0 0 1 5 12.5z"/>
  </svg>
);

// Google Docs colored icon
const GDocIcon = ({ size = 14 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <rect x="4" y="2" width="16" height="20" rx="2" fill="#4285f4" opacity="0.15" stroke="#4285f4" strokeWidth="1.5"/>
    <path d="M14 2v5h5" stroke="#4285f4" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    <line x1="8" y1="13" x2="16" y2="13" stroke="#4285f4" strokeWidth="1.5" strokeLinecap="round"/>
    <line x1="8" y1="17" x2="14" y2="17" stroke="#4285f4" strokeWidth="1.5" strokeLinecap="round"/>
  </svg>
);

// ─── Constants ────────────────────────────────────────────────────────────────
const GOOGLE_ENABLED_CATEGORIES: Category[] = ["lebenslauf", "motivationsschreiben"];

const CATEGORIES: { value: Category; label: string; icon: React.ReactNode; color: string; googleDocs?: boolean }[] = [
  { value: "lebenslauf",          label: "Lebenslauf",           icon: <FileEdit size={14} />,      color: "#4285f4", googleDocs: true },
  { value: "motivationsschreiben",label: "Motivationsschreiben", icon: <FileText size={14} />,      color: "#0f9d58", googleDocs: true },
  { value: "zeugnis",             label: "Zeugnisse",            icon: <GraduationCap size={14} />, color: "#3b82f6" },
  { value: "referenz",            label: "Referenzen",           icon: <Users size={14} />,         color: "#10b981" },
  { value: "zertifikat",          label: "Zertifikate",          icon: <Award size={14} />,         color: "#f59e0b" },
  { value: "portfolio",           label: "Portfolio",            icon: <Briefcase size={14} />,     color: "#8b5cf6" },
  { value: "figma",               label: "Figma",                icon: <FigmaIcon size={14} />,     color: "#f24e1e" },
  { value: "sonstiges",           label: "Sonstiges",            icon: <FolderOpen size={14} />,    color: "var(--fg-3)" },
];

const FILE_TYPES: { value: FileType; label: string; icon: React.ReactNode }[] = [
  { value: "gdoc",  label: "Google Doc", icon: <GDocIcon size={12} /> },
  { value: "pdf",   label: "PDF",        icon: <FileText size={12} /> },
  { value: "link",  label: "Link",       icon: <Link2 size={12} /> },
  { value: "figma", label: "Figma",      icon: <FigmaIcon size={12} /> },
  { value: "image", label: "Bild",       icon: <Image size={12} /> },
];

function fileTypeIcon(ft: string) {
  if (ft === "gdoc") return <GDocIcon size={13} />;
  return FILE_TYPES.find((f) => f.value === ft)?.icon ?? <Link2 size={13} />;
}
function fileTypeColor(ft: string) {
  if (ft === "gdoc")  return "#4285f4";
  if (ft === "pdf")   return "#3b82f6";
  if (ft === "figma") return "#f24e1e";
  return "var(--fg-2)";
}
function categoryMeta(cat: string) {
  return CATEGORIES.find((c) => c.value === cat) ?? CATEGORIES[CATEGORIES.length - 1];
}

// ─── Google Doc Create Button ─────────────────────────────────────────────────
function CreateGDocButton({ title, onCreated }: {
  title: string;
  onCreated: (url: string) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  const create = async () => {
    if (!title.trim()) { setError("Bitte zuerst einen Namen eingeben"); return; }
    setLoading(true);
    setError(null);
    try {
      const res = await api.post<{ docUrl: string; docId: string }>("/api/google/docs/create", { title: title.trim() });
      onCreated(res.data.docUrl);
    } catch {
      setError("Google nicht verbunden – bitte in Settings verbinden");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <button
        onClick={create}
        disabled={loading}
        style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: "8px 14px", borderRadius: 8, border: "1px solid #4285f4",
          background: "rgba(66,133,244,0.08)", color: "#4285f4",
          fontSize: 12, fontWeight: 600, cursor: loading ? "wait" : "pointer",
          fontFamily: "var(--font-sans)", transition: "all 0.12s ease",
          opacity: loading ? 0.7 : 1
        }}
        onMouseEnter={(e) => { if (!loading) e.currentTarget.style.background = "rgba(66,133,244,0.15)"; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(66,133,244,0.08)"; }}
      >
        {loading
          ? <Loader size={13} style={{ animation: "spin 1s linear infinite" }} />
          : <GDocIcon size={14} />}
        {loading ? "Erstelle Google Doc…" : "Neues Google Doc erstellen"}
      </button>
      {error && <div style={{ fontSize: 11, color: "var(--red, #f43f5e)" }}>{error}</div>}
    </div>
  );
}

// ─── Add Form ─────────────────────────────────────────────────────────────────
function AddDocForm({ category, onSave, onCancel }: {
  category: Category;
  onSave: (doc: Omit<UserDocument, "id" | "createdAt" | "updatedAt">) => Promise<void>;
  onCancel: () => void;
}) {
  const isGoogleCat = GOOGLE_ENABLED_CATEGORIES.includes(category);
  const [name, setName]         = useState("");
  const [url, setUrl]           = useState("");
  const [description, setDesc]  = useState("");
  const [tags, setTags]         = useState("");
  const [fileType, setFileType] = useState<FileType>(
    category === "figma" ? "figma" : isGoogleCat ? "gdoc" : "pdf"
  );
  const [saving, setSaving] = useState(false);

  // Available types based on category
  const availableTypes = isGoogleCat
    ? FILE_TYPES  // all types including gdoc
    : FILE_TYPES.filter((ft) => ft.value !== "gdoc");

  const submit = async () => {
    if (!name.trim()) return;
    setSaving(true);
    await onSave({ name: name.trim(), category, fileType, url: url.trim() || null, description: description.trim() || null, tags: tags.trim() || null });
    setSaving(false);
  };

  return (
    <div style={{
      background: "var(--surface-2)", border: "1px solid var(--border)",
      borderRadius: 10, padding: "14px 16px", marginBottom: 8,
      display: "flex", flexDirection: "column", gap: 10
    }}>
      {/* Type toggle */}
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
        {availableTypes.map((ft) => (
          <button key={ft.value} onClick={() => setFileType(ft.value)} style={{
            padding: "3px 9px", borderRadius: 6, fontSize: 11, fontWeight: 600,
            border: `1px solid ${fileType === ft.value ? (ft.value === "gdoc" ? "#4285f4" : "var(--accent)") : "var(--border)"}`,
            background: fileType === ft.value ? (ft.value === "gdoc" ? "rgba(66,133,244,0.1)" : "var(--accent-08)") : "transparent",
            color: fileType === ft.value ? (ft.value === "gdoc" ? "#4285f4" : "var(--accent)") : "var(--fg-3)",
            cursor: "pointer", display: "flex", alignItems: "center", gap: 4, fontFamily: "var(--font-sans)"
          }}>{ft.icon}{ft.label}</button>
        ))}
      </div>

      {/* Name */}
      <input className="input-line" autoFocus value={name} onChange={(e) => setName(e.target.value)}
        placeholder="Name / Titel *" style={{ fontSize: 14, fontWeight: 600 }}
        onKeyDown={(e) => e.key === "Enter" && submit()} />

      {/* Google Doc create button OR URL field */}
      {fileType === "gdoc" ? (
        url ? (
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <a href={url} target="_blank" rel="noreferrer" style={{
              flex: 1, display: "flex", alignItems: "center", gap: 6,
              padding: "6px 10px", borderRadius: 8, border: "1px solid #4285f4",
              background: "rgba(66,133,244,0.08)", color: "#4285f4",
              fontSize: 12, fontWeight: 600, textDecoration: "none"
            }}>
              <GDocIcon size={13} /> Google Doc geöffnet → bearbeiten
              <ExternalLink size={11} style={{ marginLeft: "auto" }} />
            </a>
            <button onClick={() => setUrl("")} title="Anderen Link verwenden"
              style={{ padding: "4px 8px", borderRadius: 6, border: "1px solid var(--border)", background: "transparent", color: "var(--fg-3)", cursor: "pointer", fontSize: 11, fontFamily: "var(--font-sans)" }}>
              Ändern
            </button>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <CreateGDocButton title={name} onCreated={(docUrl) => setUrl(docUrl)} />
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
              <span style={{ fontSize: 10, color: "var(--fg-3)", whiteSpace: "nowrap" }}>oder bestehendes Dokument verknüpfen</span>
              <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
            </div>
            <input className="input-line" value={url} onChange={(e) => setUrl(e.target.value)}
              placeholder="https://docs.google.com/document/d/…"
              style={{ fontFamily: "var(--font-mono)", fontSize: 11 }} />
          </div>
        )
      ) : (
        <input className="input-line" value={url} onChange={(e) => setUrl(e.target.value)}
          placeholder={fileType === "figma" ? "https://figma.com/file/…" : "https://…"}
          style={{ fontFamily: "var(--font-mono)", fontSize: 12 }} />
      )}

      <input className="input-line" value={description} onChange={(e) => setDesc(e.target.value)}
        placeholder="Beschreibung (optional)" style={{ fontSize: 12 }} />
      <input className="input-line" value={tags} onChange={(e) => setTags(e.target.value)}
        placeholder="Tags (z.B. 2024, Deutsch, Final)" style={{ fontSize: 12 }} />

      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button className="btn btn-ghost" style={{ fontSize: 12 }} onClick={onCancel}><X size={12} /> Abbrechen</button>
        <button className="btn btn-primary" style={{ fontSize: 12 }} disabled={!name.trim() || saving} onClick={submit}><Check size={12} /> Speichern</button>
      </div>
    </div>
  );
}

// ─── Document Card — Notion-style compact row ─────────────────────────────────
function DocCard({ doc, onDelete, onEdit }: {
  doc: UserDocument;
  onDelete: (id: string) => void;
  onEdit: (doc: UserDocument) => void;
}) {
  const [hov, setHov] = useState(false);
  const tags   = doc.tags ? doc.tags.split(",").map((t) => t.trim()).filter(Boolean) : [];
  const isGDoc = doc.fileType === "gdoc";

  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        display: "flex", alignItems: "center", gap: 8,
        padding: "5px 6px", borderRadius: 6,
        background: hov ? "var(--surface-2)" : "transparent",
        transition: "background 0.1s ease"
      }}
    >
      {/* File-type icon */}
      <span style={{ color: isGDoc ? "#4285f4" : fileTypeColor(doc.fileType), flexShrink: 0, display: "flex", alignItems: "center" }}>
        {fileTypeIcon(doc.fileType)}
      </span>

      {/* Name */}
      <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: "var(--fg-1)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
        {doc.name}
      </span>

      {/* Description — only when hovered would clutter; show as muted inline */}
      {doc.description && (
        <span style={{ fontSize: 11, color: "var(--fg-3)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 160, flexShrink: 1 }}>
          {doc.description}
        </span>
      )}

      {/* Tags */}
      {tags.map((t) => (
        <span key={t} style={{ padding: "1px 6px", borderRadius: 999, fontSize: 10, fontWeight: 600, background: "var(--accent-08)", color: "var(--accent)", whiteSpace: "nowrap", flexShrink: 0 }}>{t}</span>
      ))}

      {/* Actions — only visible on hover */}
      <div style={{ display: "flex", gap: 2, alignItems: "center", flexShrink: 0, opacity: hov ? 1 : 0, transition: "opacity 0.1s ease" }}>
        {doc.url && (
          <a href={doc.url} target="_blank" rel="noreferrer" title={isGDoc ? "Google Doc öffnen" : "Öffnen"}
            style={{
              display: "flex", alignItems: "center", gap: 4,
              padding: isGDoc ? "3px 7px" : "3px 5px",
              height: 24, borderRadius: 5,
              border: `1px solid ${isGDoc ? "#4285f4" : "var(--border)"}`,
              background: isGDoc ? "rgba(66,133,244,0.08)" : "transparent",
              color: isGDoc ? "#4285f4" : "var(--fg-2)",
              fontSize: 11, fontWeight: isGDoc ? 600 : 400,
              textDecoration: "none", whiteSpace: "nowrap"
            }}>
            {isGDoc ? <><GDocIcon size={11} /> Öffnen</> : <ExternalLink size={11} />}
          </a>
        )}
        {([
          { icon: <Pencil size={11} />,  action: () => onEdit(doc),      title: "Bearbeiten", danger: false },
          { icon: <Trash2 size={11} />,  action: () => onDelete(doc.id), title: "Löschen",    danger: true  },
        ]).map(({ icon, action, title, danger }) => (
          <button key={title} onClick={action} title={title} style={{
            width: 24, height: 24, borderRadius: 5, border: "1px solid transparent",
            background: "transparent", color: "var(--fg-3)", cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.1s ease",
            flexShrink: 0
          }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = danger ? "rgba(244,63,94,0.1)" : "var(--surface-2)";
              e.currentTarget.style.borderColor = danger ? "#f43f5e" : "var(--border)";
              e.currentTarget.style.color = danger ? "#f43f5e" : "var(--fg-1)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "transparent";
              e.currentTarget.style.borderColor = "transparent";
              e.currentTarget.style.color = "var(--fg-3)";
            }}>
            {icon}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Edit Modal ───────────────────────────────────────────────────────────────
function EditModal({ doc, onSave, onClose }: {
  doc: UserDocument;
  onSave: (id: string, patch: Partial<UserDocument>) => Promise<void>;
  onClose: () => void;
}) {
  const isGoogleCat = GOOGLE_ENABLED_CATEGORIES.includes(doc.category as Category);
  const [name, setName]         = useState(doc.name);
  const [url, setUrl]           = useState(doc.url ?? "");
  const [description, setDesc]  = useState(doc.description ?? "");
  const [tags, setTags]         = useState(doc.tags ?? "");
  const [fileType, setFileType] = useState<FileType>(doc.fileType as FileType);
  const [saving, setSaving]     = useState(false);

  const availableTypes = isGoogleCat ? FILE_TYPES : FILE_TYPES.filter((ft) => ft.value !== "gdoc");

  const submit = async () => {
    if (!name.trim()) return;
    setSaving(true);
    await onSave(doc.id, { name: name.trim(), fileType, url: url.trim() || null, description: description.trim() || null, tags: tags.trim() || null });
    setSaving(false);
    onClose();
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 100, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center" }} onClick={onClose}>
      <div style={{ background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 14, padding: 24, width: 480, display: "flex", flexDirection: "column", gap: 14 }} onClick={(e) => e.stopPropagation()}>
        <div style={{ fontWeight: 700, fontSize: 15 }}>Dokument bearbeiten</div>

        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          {availableTypes.map((ft) => (
            <button key={ft.value} onClick={() => setFileType(ft.value)} style={{
              padding: "3px 9px", borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: "pointer",
              border: `1px solid ${fileType === ft.value ? (ft.value === "gdoc" ? "#4285f4" : "var(--accent)") : "var(--border)"}`,
              background: fileType === ft.value ? (ft.value === "gdoc" ? "rgba(66,133,244,0.1)" : "var(--accent-08)") : "transparent",
              color: fileType === ft.value ? (ft.value === "gdoc" ? "#4285f4" : "var(--accent)") : "var(--fg-3)",
              fontFamily: "var(--font-sans)", display: "flex", alignItems: "center", gap: 4
            }}>{ft.icon}{ft.label}</button>
          ))}
        </div>

        {([ ["Name *", name, setName, { fontWeight: 600 }], ["URL / Google Docs Link", url, setUrl, { fontFamily: "var(--font-mono)", fontSize: 12 }], ["Beschreibung", description, setDesc, {}], ["Tags", tags, setTags, {}] ] as [string, string, React.Dispatch<React.SetStateAction<string>>, React.CSSProperties][]).map(([label, val, setter, style]) => (
          <div key={label}>
            <div style={{ fontSize: 9, fontWeight: 700, color: "var(--fg-3)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 2 }}>{label}</div>
            <input className="input-line" value={val} onChange={(e) => setter(e.target.value)} style={style} />
          </div>
        ))}

        {/* Create new Google Doc button in edit mode too */}
        {fileType === "gdoc" && !url && (
          <CreateGDocButton title={name} onCreated={(docUrl) => setUrl(docUrl)} />
        )}

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", paddingTop: 4 }}>
          <button className="btn btn-ghost" style={{ fontSize: 12 }} onClick={onClose}><X size={12} /> Abbrechen</button>
          <button className="btn btn-primary" style={{ fontSize: 12 }} disabled={!name.trim() || saving} onClick={submit}><Check size={12} /> Speichern</button>
        </div>
      </div>
    </div>
  );
}

// ─── Doc List (reused in list + tab view) ─────────────────────────────────────
function DocList({ cat, docs, onAdd, onDelete, onEdit }: {
  cat: typeof CATEGORIES[number];
  docs: UserDocument[];
  onAdd: (d: Omit<UserDocument, "id" | "createdAt" | "updatedAt">) => Promise<void>;
  onDelete: (id: string) => void;
  onEdit: (doc: UserDocument) => void;
}) {
  const [adding, setAdding] = useState(false);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {adding && (
        <AddDocForm category={cat.value} onSave={async (d) => { await onAdd(d); setAdding(false); }} onCancel={() => setAdding(false)} />
      )}
      {docs.length === 0 && !adding ? (
        <div onClick={() => setAdding(true)} style={{
          border: "1px dashed var(--border)", borderRadius: 10, padding: "20px 16px",
          textAlign: "center", fontSize: 12, color: "var(--fg-3)", cursor: "pointer",
          transition: "border-color 0.15s, color 0.15s"
        }}
          onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--border-strong)"; e.currentTarget.style.color = "var(--fg-2)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.color = "var(--fg-3)"; }}>
          {cat.googleDocs ? "＋ Google Doc erstellen oder verknüpfen" : `＋ ${cat.label} hinzufügen`}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column" }}>
          {docs.map((doc) => <DocCard key={doc.id} doc={doc} onDelete={onDelete} onEdit={onEdit} />)}
        </div>
      )}
      {docs.length > 0 && !adding && (
        <button className="btn btn-ghost" style={{ fontSize: 11, alignSelf: "flex-start", gap: 4, padding: "3px 6px", marginTop: 2 }} onClick={() => setAdding(true)}>
          <Plus size={11} /> Neu
        </button>
      )}
    </div>
  );
}

// ─── List Section with Expand-Logik ──────────────────────────────────────────
function ListSection({ cat, docs, onAdd, onDelete, onEdit }: {
  cat: typeof CATEGORIES[number];
  docs: UserDocument[];
  onAdd: (d: Omit<UserDocument, "id" | "createdAt" | "updatedAt">) => Promise<void>;
  onDelete: (id: string) => void;
  onEdit: (doc: UserDocument) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div style={{
      marginBottom: expanded ? 0 : 32,
      ...(expanded ? {
        position: "absolute", top: 57, left: 0, right: 0, bottom: 0,
        zIndex: 10, background: "var(--bg)", padding: "24px 32px",
        display: "flex", flexDirection: "column", overflow: "auto"
      } : {})
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <span style={{ color: cat.color }}>{cat.icon}</span>
        <div className="eyebrow" style={{ flex: 1, color: "var(--fg-2)" }}>{cat.label}</div>
        {cat.googleDocs && (
          <span style={{ fontSize: 10, color: "#4285f4", fontWeight: 600, display: "flex", alignItems: "center", gap: 3, marginRight: 4 }}>
            <GDocIcon size={10} /> Google Docs
          </span>
        )}
        {docs.length > 0 && (
          <span style={{ fontSize: 11, color: "var(--fg-3)", fontWeight: 600, marginRight: 4 }}>{docs.length}</span>
        )}
        <button className="btn btn-ghost btn-icon" onClick={() => setExpanded((v) => !v)}
          title={expanded ? "Minimieren" : "Maximieren"} style={{ padding: 4 }}>
          {expanded ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
        </button>
      </div>
      <div style={expanded ? { flex: 1, overflow: "auto" } : {}}>
        <DocList cat={cat} docs={docs} onAdd={onAdd} onDelete={onDelete} onEdit={onEdit} />
      </div>
    </div>
  );
}

// ─── Tab View ─────────────────────────────────────────────────────────────────
function TabView({ docs, onAdd, onDelete, onEdit }: {
  docs: UserDocument[];
  onAdd: (d: Omit<UserDocument, "id" | "createdAt" | "updatedAt">) => Promise<void>;
  onDelete: (id: string) => void;
  onEdit: (doc: UserDocument) => void;
}) {
  const [active, setActive] = useState<Category>("lebenslauf");
  const cat     = categoryMeta(active);
  const catDocs = docs.filter((d) => d.category === active);

  return (
    <div>
      {/* Tab bar */}
      <div style={{ display: "flex", gap: 0, borderBottom: "1px solid var(--border)", marginBottom: 24, overflowX: "auto" }}>
        {CATEGORIES.map((c) => {
          const count    = docs.filter((d) => d.category === c.value).length;
          const isActive = active === c.value;
          return (
            <button key={c.value} onClick={() => setActive(c.value)} style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "8px 14px", fontSize: 13,
              fontWeight: isActive ? 700 : 500,
              color: isActive ? c.color : "var(--fg-3)",
              background: "transparent", border: "none",
              borderBottom: `2px solid ${isActive ? c.color : "transparent"}`,
              marginBottom: -1, cursor: "pointer", whiteSpace: "nowrap",
              fontFamily: "var(--font-sans)", transition: "color 0.12s, border-color 0.12s"
            }}
              onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.color = "var(--fg-1)"; }}
              onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.color = "var(--fg-3)"; }}>
              <span style={{ color: isActive ? c.color : "inherit" }}>{c.icon}</span>
              {c.label}
              {count > 0 && (
                <span style={{
                  fontSize: 10, fontWeight: 700, padding: "1px 5px", borderRadius: 999,
                  background: isActive ? `${c.color}22` : "var(--surface-2)",
                  color: isActive ? c.color : "var(--fg-3)"
                }}>{count}</span>
              )}
              {c.googleDocs && (
                <span title="Google Docs Integration" style={{ opacity: 0.6 }}><GDocIcon size={10} /></span>
              )}
            </button>
          );
        })}
      </div>
      <DocList cat={cat} docs={catDocs} onAdd={onAdd} onDelete={onDelete} onEdit={onEdit} />
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export function DocumentsPage() {
  const [docs, setDocs]         = useState<UserDocument[]>([]);
  const [loading, setLoading]   = useState(true);
  const [editDoc, setEditDoc]   = useState<UserDocument | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("list");

  useEffect(() => {
    api.get<UserDocument[]>("/api/documents")
      .then((r) => setDocs(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleAdd = useCallback(async (payload: Omit<UserDocument, "id" | "createdAt" | "updatedAt">) => {
    const res = await api.post<UserDocument>("/api/documents", payload);
    setDocs((prev) => [res.data, ...prev]);
  }, []);

  const handleDelete = useCallback(async (id: string) => {
    await api.delete(`/api/documents/${id}`).catch(() => {});
    setDocs((prev) => prev.filter((d) => d.id !== id));
  }, []);

  const handleEdit = useCallback(async (id: string, patch: Partial<UserDocument>) => {
    const res = await api.patch<UserDocument>(`/api/documents/${id}`, patch);
    setDocs((prev) => prev.map((d) => d.id === id ? res.data : d));
  }, []);

  if (loading) return (
    <>
      <Topbar title="Dokumente" />
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", flex: 1, color: "var(--fg-3)", fontSize: 13 }}>Laden…</div>
    </>
  );

  const viewToggle = (
    <div style={{ display: "flex", gap: 2, background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 8, padding: 2 }}>
      {([
        { mode: "list" as ViewMode, icon: <List size={13} />,       title: "Listenansicht" },
        { mode: "tabs" as ViewMode, icon: <LayoutGrid size={13} />, title: "Tab-Ansicht" },
      ]).map(({ mode, icon, title }) => (
        <button key={mode} onClick={() => setViewMode(mode)} title={title} style={{
          width: 28, height: 24, borderRadius: 6, border: "none", cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center",
          background: viewMode === mode ? "var(--bg)" : "transparent",
          color: viewMode === mode ? "var(--fg-1)" : "var(--fg-3)",
          boxShadow: viewMode === mode ? "0 1px 3px rgba(0,0,0,0.15)" : "none",
          transition: "all 0.12s ease"
        }}>{icon}</button>
      ))}
    </div>
  );

  return (
    <>
      <Topbar
        title="Dokumente"
        sub="Zeugnisse, Referenzen, Zertifikate, Figma-Prototypen und mehr"
        actions={viewToggle}
      />
      <div className="page-content" style={{ maxWidth: 760 }}>
        {viewMode === "tabs" ? (
          <TabView docs={docs} onAdd={handleAdd} onDelete={handleDelete} onEdit={setEditDoc} />
        ) : (
          CATEGORIES.map((cat) => (
            <ListSection
              key={cat.value}
              cat={cat}
              docs={docs.filter((d) => d.category === cat.value)}
              onAdd={handleAdd}
              onDelete={handleDelete}
              onEdit={setEditDoc}
            />
          ))
        )}
      </div>

      {editDoc && (
        <EditModal doc={editDoc} onSave={handleEdit} onClose={() => setEditDoc(null)} />
      )}
    </>
  );
}
