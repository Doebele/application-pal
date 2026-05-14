import { useState, useEffect, useCallback, useRef } from "react";
import {
  FileText, Link2, Image, Plus, Trash2, ExternalLink,
  Award, Users, GraduationCap, Briefcase, FolderOpen, Pencil, Check, X,
  List, LayoutGrid, Maximize2, Minimize2, Loader, FileEdit
} from "lucide-react";
import { Topbar } from "../components/Topbar";
import { api } from "../lib/api";
import { useUiStore } from "../lib/store";
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
  const { driveApplicationsFolderId } = useUiStore();
  const isGoogleCat = GOOGLE_ENABLED_CATEGORIES.includes(category);
  const [name, setName]         = useState("");
  const [url, setUrl]           = useState("");
  const [description, setDesc]  = useState("");
  const [tags, setTags]         = useState("");
  const [fileType, setFileType] = useState<FileType>(
    category === "figma" ? "figma" : isGoogleCat ? "gdoc" : "pdf"
  );
  const [saving, setSaving]   = useState(false);
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [driveConnected, setDriveConnected] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api.get<{ connected: boolean }>("/api/google/status")
      .then(r => setDriveConnected(r.data.connected)).catch(() => {});
  }, []);

  const handlePdfSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setPdfFile(f);
    if (!name.trim()) setName(f.name.replace(/\.pdf$/i, ""));
  };

  const uploadPdfToDrive = async (file: File): Promise<string | null> => {
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      if (driveApplicationsFolderId) form.append("parentFolderId", driveApplicationsFolderId);
      const r = await api.post<{ fileUrl: string }>("/api/drive/upload-pdf", form, {
        headers: { "Content-Type": "multipart/form-data" }
      });
      return r.data.fileUrl;
    } catch { return null; }
    finally { setUploading(false); }
  };

  // Available types based on category
  const availableTypes = isGoogleCat
    ? FILE_TYPES  // all types including gdoc
    : FILE_TYPES.filter((ft) => ft.value !== "gdoc");

  const submit = async () => {
    if (!name.trim()) return;
    setSaving(true); setSaveErr(null);
    try {
      let finalUrl = url.trim() || null;
      // Auto-upload PDF to Drive if file selected and Drive connected
      if (fileType === "pdf" && pdfFile) {
        if (driveConnected) {
          const driveUrl = await uploadPdfToDrive(pdfFile);
          if (driveUrl) finalUrl = driveUrl;
          // If upload failed, fall through with whatever URL is set (or null)
        }
        // If no Drive or upload failed and no manual URL, warn but still save
      }
      await onSave({ name: name.trim(), category, fileType, url: finalUrl, description: description.trim() || null, tags: tags.trim() || null });
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? "Fehler beim Speichern";
      setSaveErr(msg);
    } finally { setSaving(false); }
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

      {/* Google Doc create button OR PDF file picker OR URL field */}
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
      ) : fileType === "pdf" ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {/* PDF file picker */}
          <input ref={fileInputRef} type="file" accept=".pdf,application/pdf"
            style={{ display: "none" }} onChange={handlePdfSelect} />
          {pdfFile ? (
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", borderRadius: 8, background: "rgba(239,68,68,0.07)", border: "1px solid rgba(239,68,68,0.25)" }}>
              <span style={{ fontSize: 16 }}>📕</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: "var(--fg-1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{pdfFile.name}</div>
                {driveConnected && (
                  <div style={{ fontSize: 10, color: "#34d399" }}>→ wird beim Speichern auf Google Drive hochgeladen (Application-PDF)</div>
                )}
              </div>
              <button onClick={() => { setPdfFile(null); if (fileInputRef.current) fileInputRef.current.value = ""; }}
                style={{ background: "none", border: "none", cursor: "pointer", color: "var(--fg-3)", display: "flex" }}>
                <X size={13} />
              </button>
            </div>
          ) : (
            <button onClick={() => fileInputRef.current?.click()} style={{
              display: "flex", alignItems: "center", gap: 8, padding: "10px 14px",
              borderRadius: 8, border: "1.5px dashed var(--border)", background: "transparent",
              color: "var(--fg-2)", cursor: "pointer", fontFamily: "var(--font-sans)", fontSize: 12,
              width: "100%", justifyContent: "center", transition: "border-color 0.15s, color 0.15s"
            }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--border-strong)"; e.currentTarget.style.color = "var(--fg-1)"; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.color = "var(--fg-2)"; }}>
              📎 PDF-Datei auswählen
              {driveConnected && <span style={{ fontSize: 10, color: "var(--fg-3)" }}>(wird automatisch auf Drive hochgeladen)</span>}
            </button>
          )}
          {/* Alternative: manual URL */}
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
            <span style={{ fontSize: 10, color: "var(--fg-3)", whiteSpace: "nowrap" }}>oder URL direkt eingeben</span>
            <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
          </div>
          <input className="input-line" value={url} onChange={(e) => setUrl(e.target.value)}
            placeholder="https://…" style={{ fontFamily: "var(--font-mono)", fontSize: 12 }} />
        </div>
      ) : (
        <input className="input-line" value={url} onChange={(e) => setUrl(e.target.value)}
          placeholder={fileType === "figma" ? "https://figma.com/file/…" : "https://…"}
          style={{ fontFamily: "var(--font-mono)", fontSize: 12 }} />
      )}

      <input className="input-line" value={description} onChange={(e) => setDesc(e.target.value)}
        placeholder="Beschreibung (optional)" style={{ fontSize: 12 }} />
      <input className="input-line" value={tags} onChange={(e) => setTags(e.target.value)}
        placeholder="Tags (z.B. 2024, Deutsch, Final)" style={{ fontSize: 12 }} />

      {saveErr && (
        <div style={{ fontSize: 11, color: "#f87171", background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.2)", borderRadius: 7, padding: "6px 10px" }}>
          {saveErr}
        </div>
      )}
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button className="btn btn-ghost" style={{ fontSize: 12 }} onClick={onCancel}><X size={12} /> Abbrechen</button>
        <button className="btn btn-primary" style={{ fontSize: 12 }} disabled={!name.trim() || saving || uploading} onClick={submit}>
          {uploading ? <><Loader size={12} style={{ animation: "spin 1s linear infinite" }} /> Lade hoch…</>
           : saving  ? <><Loader size={12} style={{ animation: "spin 1s linear infinite" }} /> Speichern…</>
           : <><Check size={12} /> Speichern</>}
        </button>
      </div>
    </div>
  );
}

// ─── Document Card — full card with icon, name, description, tags ─────────────
function DocCard({ doc, onDelete, onEdit, onUrlUpdate }: {
  doc: UserDocument;
  onDelete: (id: string) => void;
  onEdit: (doc: UserDocument) => void;
  onUrlUpdate?: (id: string, newUrl: string) => void;
}) {
  const [hov, setHov] = useState(false);
  const { driveApplicationsFolderId } = useUiStore();
  const [uploading, setUploading] = useState(false);
  const [uploadErr, setUploadErr] = useState<string | null>(null);
  const [driveConnected, setDriveConnected] = useState(false);

  const tags   = doc.tags ? doc.tags.split(",").map((t) => t.trim()).filter(Boolean) : [];
  const isGDoc = doc.fileType === "gdoc";
  const isPdf  = doc.fileType === "pdf";
  const iconColor = isGDoc ? "#4285f4" : fileTypeColor(doc.fileType);

  // Detect if URL is already a Google Drive link
  const isOnDrive = isPdf && !!doc.url && (
    doc.url.includes("drive.google.com") || doc.url.includes("docs.google.com")
  );

  useEffect(() => {
    if (!isPdf) return;
    api.get<{ connected: boolean }>("/api/google/status")
      .then(r => setDriveConnected(r.data.connected)).catch(() => {});
  }, [isPdf]);

  const handleDriveUpload = async () => {
    if (!doc.url) return;
    setUploading(true); setUploadErr(null);
    try {
      const r = await api.post<{ fileUrl: string; fileName: string }>(
        "/api/drive/upload-pdf-from-url",
        { url: doc.url, fileName: doc.name, parentFolderId: driveApplicationsFolderId || undefined }
      );
      await api.patch(`/api/documents/${doc.id}`, { url: r.data.fileUrl });
      onUrlUpdate?.(doc.id, r.data.fileUrl);
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? "Upload fehlgeschlagen";
      setUploadErr(msg);
    } finally { setUploading(false); }
  };

  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        display: "flex", flexDirection: "column", gap: 10,
        padding: "14px 16px", borderRadius: 12,
        background: "var(--surface)",
        border: `1px solid ${hov ? "var(--border-strong)" : "var(--border)"}`,
        transition: "border-color 0.15s, box-shadow 0.15s",
        boxShadow: hov ? "0 2px 12px rgba(0,0,0,0.12)" : "none",
        cursor: "default"
      }}
    >
      {/* Top row: icon + name + actions */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
        {/* Icon badge */}
        <div style={{
          width: 36, height: 36, borderRadius: 8, flexShrink: 0,
          background: `${iconColor}18`, border: `1px solid ${iconColor}30`,
          display: "flex", alignItems: "center", justifyContent: "center", color: iconColor
        }}>
          {fileTypeIcon(doc.fileType)}
        </div>

        {/* Name + description */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--fg-1)", lineHeight: 1.35, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" as const }}>
            {doc.name}
          </div>
          {doc.description && (
            <div style={{ fontSize: 11, color: "var(--fg-3)", marginTop: 3, lineHeight: 1.4, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" as const }}>
              {doc.description}
            </div>
          )}
        </div>

        {/* Actions */}
        <div style={{ display: "flex", gap: 2, flexShrink: 0, opacity: hov ? 1 : 0, transition: "opacity 0.12s" }}>
          <button onClick={() => onEdit(doc)} title="Bearbeiten" style={iconBtnStyle(false)}
            onMouseEnter={e => hoverBtn(e, false)} onMouseLeave={e => leaveBtn(e)}>
            <Pencil size={11} />
          </button>
          <button onClick={() => onDelete(doc.id)} title="Löschen" style={iconBtnStyle(true)}
            onMouseEnter={e => hoverBtn(e, true)} onMouseLeave={e => leaveBtn(e)}>
            <Trash2 size={11} />
          </button>
        </div>
      </div>

      {/* Tags row */}
      {tags.length > 0 && (
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          {tags.map((t) => (
            <span key={t} style={{ padding: "2px 7px", borderRadius: 999, fontSize: 10, fontWeight: 600, background: "var(--accent-08)", color: "var(--accent)", border: "1px solid var(--accent-15)" }}>{t}</span>
          ))}
        </div>
      )}

      {/* Footer: open link + Drive upload for PDFs */}
      <div style={{ borderTop: "1px solid var(--border)", paddingTop: 8, marginTop: 2, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        {doc.url && (
          <a href={doc.url} target="_blank" rel="noreferrer"
            style={{
              display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 600,
              color: isGDoc ? "#4285f4" : "var(--accent)",
              textDecoration: "none", padding: "3px 8px", borderRadius: 6,
              background: isGDoc ? "rgba(66,133,244,0.07)" : "var(--accent-08)",
              border: `1px solid ${isGDoc ? "rgba(66,133,244,0.2)" : "var(--accent-15)"}`
            }}>
            {isGDoc ? <GDocIcon size={11} /> : <ExternalLink size={11} />}
            {isGDoc ? "Google Doc öffnen" : "Öffnen"}
          </a>
        )}

        {/* Drive upload section for PDFs */}
        {isPdf && driveConnected && (
          isOnDrive ? (
            <span style={{
              display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10, fontWeight: 600,
              color: "#34d399", padding: "3px 8px", borderRadius: 6,
              background: "rgba(52,211,153,0.08)", border: "1px solid rgba(52,211,153,0.25)"
            }}>
              <Check size={10} /> Auf Google Drive
            </span>
          ) : doc.url ? (
            <button
              disabled={uploading}
              onClick={handleDriveUpload}
              style={{
                display: "inline-flex", alignItems: "center", gap: 5, fontSize: 10, fontWeight: 600,
                color: uploading ? "var(--fg-3)" : "#4285f4",
                padding: "3px 8px", borderRadius: 6, cursor: uploading ? "wait" : "pointer",
                background: "rgba(66,133,244,0.07)", border: "1px solid rgba(66,133,244,0.2)",
                fontFamily: "var(--font-sans)", transition: "opacity 0.15s"
              }}>
              {uploading
                ? <><Loader size={10} style={{ animation: "spin 1s linear infinite" }} /> Wird hochgeladen…</>
                : <>
                    <svg width="10" height="10" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
                    Auf Drive hochladen
                  </>}
            </button>
          ) : null
        )}

        {uploadErr && (
          <span style={{ fontSize: 10, color: "#f87171" }}>{uploadErr}</span>
        )}
      </div>
    </div>
  );
}

const iconBtnStyle = (danger: boolean): React.CSSProperties => ({
  width: 26, height: 26, borderRadius: 6, border: "1px solid transparent",
  background: "transparent", cursor: "pointer",
  display: "flex", alignItems: "center", justifyContent: "center",
  color: "var(--fg-3)", transition: "all 0.1s ease", flexShrink: 0
});
const hoverBtn = (e: React.MouseEvent<HTMLButtonElement>, danger: boolean) => {
  e.currentTarget.style.background = danger ? "rgba(244,63,94,0.1)" : "var(--surface-2)";
  e.currentTarget.style.borderColor = danger ? "#f43f5e" : "var(--border)";
  e.currentTarget.style.color = danger ? "#f43f5e" : "var(--fg-1)";
};
const leaveBtn = (e: React.MouseEvent<HTMLButtonElement>) => {
  e.currentTarget.style.background = "transparent";
  e.currentTarget.style.borderColor = "transparent";
  e.currentTarget.style.color = "var(--fg-3)";
};

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
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState<string | null>(null);

  const availableTypes = isGoogleCat ? FILE_TYPES : FILE_TYPES.filter((ft) => ft.value !== "gdoc");

  const submit = async () => {
    if (!name.trim()) return;
    setSaving(true); setSaveErr(null);
    try {
      await onSave(doc.id, {
        name: name.trim(), fileType,
        url: url.trim() || null,
        description: description.trim() || null,
        tags: tags.trim() || null
      });
      onClose();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? "Speichern fehlgeschlagen";
      setSaveErr(msg);
    } finally {
      setSaving(false);
    }
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

        {saveErr && (
          <div style={{ fontSize: 12, color: "#f87171", background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.2)", borderRadius: 7, padding: "8px 12px" }}>
            {saveErr}
          </div>
        )}

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", paddingTop: 4 }}>
          <button className="btn btn-ghost" style={{ fontSize: 12 }} onClick={onClose}><X size={12} /> Abbrechen</button>
          <button className="btn btn-primary" style={{ fontSize: 12 }} disabled={!name.trim() || saving} onClick={submit}>
            {saving
              ? <><Loader size={12} style={{ animation: "spin 1s linear infinite" }} /> Speichern…</>
              : <><Check size={12} /> Speichern</>}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Doc List (reused in list + tab view) ─────────────────────────────────────
function DocList({ cat, docs, onAdd, onDelete, onEdit, onUrlUpdate }: {
  cat: typeof CATEGORIES[number];
  docs: UserDocument[];
  onAdd: (d: Omit<UserDocument, "id" | "createdAt" | "updatedAt">) => Promise<void>;
  onDelete: (id: string) => void;
  onEdit: (doc: UserDocument) => void;
  onUrlUpdate?: (id: string, newUrl: string) => void;
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
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 }}>
          {docs.map((doc) => <DocCard key={doc.id} doc={doc} onDelete={onDelete} onEdit={onEdit} onUrlUpdate={onUrlUpdate} />)}
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
function ListSection({ cat, docs, onAdd, onDelete, onEdit, onUrlUpdate }: {
  cat: typeof CATEGORIES[number];
  docs: UserDocument[];
  onAdd: (d: Omit<UserDocument, "id" | "createdAt" | "updatedAt">) => Promise<void>;
  onDelete: (id: string) => void;
  onEdit: (doc: UserDocument) => void;
  onUrlUpdate?: (id: string, newUrl: string) => void;
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
        <DocList cat={cat} docs={docs} onAdd={onAdd} onDelete={onDelete} onEdit={onEdit} onUrlUpdate={onUrlUpdate} />
      </div>
    </div>
  );
}

// ─── Tab View ─────────────────────────────────────────────────────────────────
function TabView({ docs, onAdd, onDelete, onEdit, onUrlUpdate }: {
  docs: UserDocument[];
  onUrlUpdate?: (id: string, newUrl: string) => void;
  onAdd: (d: Omit<UserDocument, "id" | "createdAt" | "updatedAt">) => Promise<void>;
  onDelete: (id: string) => void;
  onEdit: (doc: UserDocument) => void;
}) {
  const [active, setActive] = useState<Category>("lebenslauf");
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canLeft,  setCanLeft]  = useState(false);
  const [canRight, setCanRight] = useState(false);
  const cat     = categoryMeta(active);
  const catDocs = docs.filter((d) => d.category === active);

  const checkScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    setCanLeft(el.scrollLeft > 4);
    setCanRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 4);
  };
  useEffect(() => { checkScroll(); }, []);

  const scrollBy = (dir: -1 | 1) => {
    scrollRef.current?.scrollBy({ left: dir * 180, behavior: "smooth" });
  };

  const selectTab = (val: Category) => {
    setActive(val);
    // Center the active tab in view
    setTimeout(() => {
      const el = scrollRef.current;
      if (!el) return;
      const btn = el.querySelector(`[data-tab="${val}"]`) as HTMLElement | null;
      if (!btn) return;
      const offset = btn.offsetLeft - el.clientWidth / 2 + btn.offsetWidth / 2;
      el.scrollTo({ left: offset, behavior: "smooth" });
    }, 30);
  };

  return (
    <div>
      {/* Tab bar with arrow navigation */}
      <div style={{ position: "relative", marginBottom: 24 }}>
        {/* Left fade + arrow */}
        {canLeft && (
          <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, zIndex: 2, display: "flex", alignItems: "center" }}>
            <div style={{ width: 40, height: "100%", background: "linear-gradient(to right, var(--bg) 60%, transparent)", pointerEvents: "none" }} />
            <button onClick={() => scrollBy(-1)} style={{
              position: "absolute", left: 0, width: 28, height: 28, borderRadius: "50%",
              border: "1px solid var(--border)", background: "var(--bg)", cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center", color: "var(--fg-2)"
            }}>‹</button>
          </div>
        )}

        {/* Scrollable tab strip — scrollbar hidden via CSS */}
        <div
          ref={scrollRef}
          onScroll={checkScroll}
          style={{
            display: "flex", gap: 0, overflowX: "auto", scrollbarWidth: "none",
            borderBottom: "1px solid var(--border)", paddingBottom: 0,
            msOverflowStyle: "none"
          }}
          className="hide-scrollbar"
        >
          {CATEGORIES.map((c) => {
            const count    = docs.filter((d) => d.category === c.value).length;
            const isActive = active === c.value;
            return (
              <button key={c.value} data-tab={c.value} onClick={() => selectTab(c.value as Category)} style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "10px 16px", fontSize: 13,
                fontWeight: isActive ? 700 : 500,
                color: isActive ? c.color : "var(--fg-3)",
                background: "transparent", border: "none",
                borderBottom: `2px solid ${isActive ? c.color : "transparent"}`,
                marginBottom: -1, cursor: "pointer", whiteSpace: "nowrap",
                fontFamily: "var(--font-sans)", transition: "color 0.12s, border-color 0.12s",
                flexShrink: 0
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

        {/* Right fade + arrow */}
        {canRight && (
          <div style={{ position: "absolute", right: 0, top: 0, bottom: 0, zIndex: 2, display: "flex", alignItems: "center" }}>
            <div style={{ width: 40, height: "100%", background: "linear-gradient(to left, var(--bg) 60%, transparent)", pointerEvents: "none" }} />
            <button onClick={() => scrollBy(1)} style={{
              position: "absolute", right: 0, width: 28, height: 28, borderRadius: "50%",
              border: "1px solid var(--border)", background: "var(--bg)", cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center", color: "var(--fg-2)"
            }}>›</button>
          </div>
        )}
      </div>

      <DocList cat={cat} docs={catDocs} onAdd={onAdd} onDelete={onDelete} onEdit={onEdit} onUrlUpdate={onUrlUpdate} />
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
    setDocs((prev) => prev.map((d) => (d.id === id ? res.data : d)));
  }, []);  // throws on error — EditModal catches it

  const handleUrlUpdate = useCallback((id: string, newUrl: string) => {
    setDocs((prev) => prev.map((d) => d.id === id ? { ...d, url: newUrl } : d));
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
          <TabView docs={docs} onAdd={handleAdd} onDelete={handleDelete} onEdit={setEditDoc} onUrlUpdate={handleUrlUpdate} />
        ) : (
          CATEGORIES.map((cat) => (
            <ListSection
              key={cat.value}
              cat={cat}
              docs={docs.filter((d) => d.category === cat.value)}
              onAdd={handleAdd}
              onDelete={handleDelete}
              onEdit={setEditDoc}
              onUrlUpdate={handleUrlUpdate}
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
