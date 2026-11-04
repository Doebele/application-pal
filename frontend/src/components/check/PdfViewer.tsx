// pdf.js viewer with highlight overlay, shared by the CV-Check and the LinkedIn-Check.
// Highlights are located by text: each one's text is matched against the PDF's text
// lines (normalised: case, punctuation, hyphens and bullet glyphs ignored), so the
// caller only needs to know *what* to mark, not where it sits on the page.
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import * as pdfjs from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import type { PDFDocumentProxy, PDFPageProxy } from "pdfjs-dist";
import { ZoomIn, ZoomOut, RefreshCircle } from "iconoir-react";
import "./check.css";

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

export type PdfHighlight = { id: string; text: string; tone: "fail" | "accepted" | "pass" | "info"; title?: string };
type Rect = { x: number; y: number; w: number; h: number };
type Line = { text: string; norm: string; rect: Rect }; // rect in PDF units, top-left origin
type PageData = { page: PDFPageProxy; width: number; height: number; lines: Line[] };

const norm = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "")
  .replace(/[^\p{L}\p{N}]+/gu, " ").trim();

async function readPage(page: PDFPageProxy): Promise<PageData> {
  const vp = page.getViewport({ scale: 1 });
  const tc = await page.getTextContent();
  type Item = { str: string; transform: number[]; width: number; height: number };
  const items = (tc.items as Item[]).filter(i => typeof i.str === "string" && i.str.trim());
  const rows = new Map<number, Item[]>();
  for (const it of items) {
    const y = it.transform[5];
    const key = [...rows.keys()].find(k => Math.abs(k - y) <= 1.5) ?? y;
    rows.set(key, [...(rows.get(key) ?? []), it]);
  }
  const lines: Line[] = [...rows.entries()].map(([y, its]) => {
    its.sort((a, b) => a.transform[4] - b.transform[4]);
    const h = Math.max(...its.map(i => i.height || Math.hypot(i.transform[2], i.transform[3])));
    const x0 = its[0].transform[4], last = its[its.length - 1];
    const text = its.map(i => i.str).join(" ");
    return { text, norm: norm(text), rect: { x: x0, y: vp.height - y - h * 0.85, w: last.transform[4] + last.width - x0, h: h * 1.2 } };
  }).sort((a, b) => a.rect.y - b.rect.y || a.rect.x - b.rect.x);
  return { page, width: vp.width, height: vp.height, lines };
}

/** Rectangles (one per text line) covering `text` on a page; multi-line bullets included. */
function locate(lines: Line[], text: string): Rect[] {
  const target = norm(text);
  if (target.length < 3) return [];
  const probe = target.slice(0, 28), head = target.slice(0, 8);
  for (let i = 0; i < lines.length; i++) {
    const ln = lines[i].norm;
    const at = ln.indexOf(head);
    if (at < 0) continue;
    // Start line: holds the first 28 chars of the target, or ends early with a prefix of it (line wrap)
    const tail = ln.slice(at);
    if (!tail.startsWith(probe) && !(tail.length >= 8 && target.startsWith(tail))) continue;
    const rects = [lines[i].rect];
    let consumed = tail;
    for (let j = i + 1; j < lines.length && consumed.length < target.length - 3; j++) {
      const next = lines[j].norm;
      if (!next || !target.includes(next.slice(0, Math.min(next.length, 20)))) break;
      rects.push(lines[j].rect);
      consumed += " " + next;
    }
    return rects;
  }
  return [];
}

function PdfPage({ data, scale, highlights, activeId, onPick, pageNo }: {
  data: PageData; scale: number; highlights: Array<{ h: PdfHighlight; rects: Rect[] }>; activeId?: string | null; onPick?: (id: string) => void; pageNo: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(pageNo === 1);
  useEffect(() => {
    const el = wrapRef.current; if (!el) return;
    const io = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) setVisible(true); }, { rootMargin: "600px" });
    io.observe(el); return () => io.disconnect();
  }, []);
  useEffect(() => {
    if (!visible || !canvasRef.current) return;
    const dpr = window.devicePixelRatio || 1;
    const vp = data.page.getViewport({ scale: scale * dpr });
    const c = canvasRef.current;
    c.width = Math.floor(vp.width); c.height = Math.floor(vp.height);
    const task = data.page.render({ canvas: c, canvasContext: c.getContext("2d")!, viewport: vp });
    task.promise.catch(() => { /* cancelled on re-render */ });
    return () => task.cancel();
  }, [visible, scale, data]);
  const w = data.width * scale, h = data.height * scale;
  return (
    <div ref={wrapRef} className="pdf-page" style={{ width: w, height: h }} data-page={pageNo}>
      <canvas ref={canvasRef} style={{ width: w, height: h }} />
      <div className="pdf-hl-layer">
        {highlights.flatMap(({ h: hl, rects }) => rects.map((r, k) => (
          <button key={`${hl.id}-${k}`} type="button" className="pdf-hl" data-tone={hl.tone} data-active={activeId === hl.id}
            data-hl={hl.id} title={hl.title ?? hl.text}
            style={{ left: r.x * scale - 2, top: r.y * scale, width: r.w * scale + 4, height: r.h * scale }}
            onClick={() => onPick?.(hl.id)} aria-label={hl.title ?? hl.text} />
        )))}
      </div>
    </div>
  );
}

export function PdfViewer({ url, highlights = [], activeId, onPick, reloadKey }: {
  url: string; highlights?: PdfHighlight[]; activeId?: string | null; onPick?: (id: string) => void; reloadKey?: string | number;
}) {
  const { t } = useTranslation();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [pages, setPages] = useState<PageData[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fitWidth, setFitWidth] = useState(600);
  const [zoom, setZoom] = useState(1); // relative to fit-width

  useEffect(() => {
    let doc: PDFDocumentProxy | null = null, cancelled = false;
    setPages(null); setError(null);
    pdfjs.getDocument({ url, withCredentials: true }).promise.then(async d => {
      doc = d;
      const all: PageData[] = [];
      for (let p = 1; p <= d.numPages; p++) all.push(await readPage(await d.getPage(p)));
      if (!cancelled) setPages(all);
    }).catch(e => { if (!cancelled) setError(String((e as Error)?.message ?? e)); });
    return () => { cancelled = true; void doc?.destroy(); };
  }, [url, reloadKey]);

  useEffect(() => {
    const el = scrollRef.current; if (!el) return;
    const ro = new ResizeObserver(() => setFitWidth(Math.max(200, el.clientWidth - 32)));
    ro.observe(el); return () => ro.disconnect();
  }, []);

  const scale = pages?.length ? (fitWidth / pages[0].width) * zoom : 1;

  const located = useMemo(() => (pages ?? []).map(pd =>
    highlights.map(h => ({ h, rects: locate(pd.lines, h.text) })).filter(x => x.rects.length)), [pages, highlights]);
  const found = useMemo(() => new Set(located.flat().map(x => x.h.id)), [located]);

  // Scroll the active highlight into view (e.g. after a click in the sidebar)
  const scrollTo = useCallback((id: string) => {
    // Scroll this container directly: a parallel scrollIntoView elsewhere (the sidebar card)
    // would cancel a second scrollIntoView animation in Chrome.
    const box = scrollRef.current;
    const el = box?.querySelector(`[data-hl="${CSS.escape(id)}"]`);
    if (!box || !el) return;
    const delta = el.getBoundingClientRect().top - box.getBoundingClientRect().top - box.clientHeight / 3;
    box.scrollTo({ top: box.scrollTop + delta, behavior: "smooth" });
  }, []);
  useEffect(() => { if (activeId && found.has(activeId)) requestAnimationFrame(() => scrollTo(activeId)); }, [activeId, found, scrollTo, scale]);

  return (
    <div className="pdf-viewer">
      <div className="pdf-toolbar">
        <span className="chk-muted">{pages ? t("check.pdf.pages", { count: pages.length }) : ""}
          {highlights.length > 0 && pages && <> · {t("check.pdf.marked", { found: found.size, total: highlights.length })}</>}</span>
        <div style={{ flex: 1 }} />
        <button type="button" className="btn btn-ghost btn-icon" style={{ padding: 4 }} onClick={() => setZoom(z => Math.max(0.5, +(z - 0.1).toFixed(2)))} title={t("check.pdf.zoomOut")}><ZoomOut width={13} height={13} /></button>
        <button type="button" className="btn btn-ghost" style={{ fontSize: 11, padding: "2px 6px", fontVariantNumeric: "tabular-nums" }} onClick={() => setZoom(1)} title={t("check.pdf.fit")}>{Math.round(zoom * 100)}%</button>
        <button type="button" className="btn btn-ghost btn-icon" style={{ padding: 4 }} onClick={() => setZoom(z => Math.min(3, +(z + 0.1).toFixed(2)))} title={t("check.pdf.zoomIn")}><ZoomIn width={13} height={13} /></button>
      </div>
      <div ref={scrollRef} className="pdf-scroll">
        {error && <div className="chk-note" data-tone="error" style={{ margin: 16 }}>{t("check.pdf.error")}: {error}</div>}
        {!pages && !error && <div className="pdf-loading"><RefreshCircle width={18} height={18} style={{ animation: "spin 1s linear infinite" }} /></div>}
        {pages?.map((pd, i) => (
          <PdfPage key={i} pageNo={i + 1} data={pd} scale={scale} highlights={located[i] ?? []} activeId={activeId} onPick={onPick} />
        ))}
      </div>
    </div>
  );
}
