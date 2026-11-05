// ─── CV-Check: layout facts from the rendered PDF ─────────────────────────────
// Reads what VMock's presentation checks need straight from the PDF: page count,
// margins, page fill, font sizes, bold/italic (from the embedded font names), text
// colours, images and coloured fills. Pure analysis — no scoring here (cv-rules.ts).
// Anything that cannot be read reliably is left undefined so the rule reports
// "nicht prüfbar" instead of guessing.

import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";

export type LayoutLine = {
  page: number; x: number; y: number; width: number; height: number;
  text: string; size: number; bold: boolean; italic: boolean; font: string;
};
export type LayoutPage = {
  width: number; height: number;
  margins: { left: number; right: number; top: number; bottom: number } | null;
  fill: number | null;            // share of the usable height covered by text (0–1)
};
export type ColouredRun = { page: number; text: string; color: string; isLink: boolean };
export type LayoutFacts = {
  pages: number;
  pageInfo: LayoutPage[];
  lines: LayoutLine[];
  maxFontSize: number;
  colouredText: ColouredRun[];    // text drawn in a colour other than black/near-black
  images: number;                 // painted raster images (logos, photos, icons)
  colouredFills: number;          // filled shapes in a colour (highlights, colour bars)
  fonts: string[];
};

const BOLD_RE = /(bold|black|heavy|semibold|demibold|extrabold|ultrabold)/i;
const ITALIC_RE = /(italic|oblique)/i;
const stripSubset = (n: string) => n.replace(/^[A-Z]{6}\+/, "");

/** True for black and very dark greys (#000 … #404040) — VMock accepts these as "black". */
export function isBlackish(hex: string): boolean {
  const m = hex.match(/^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (!m) return true;
  const [r, g, b] = [m[1], m[2], m[3]].map(h => parseInt(h, 16));
  return Math.max(r, g, b) <= 0x40 && Math.max(r, g, b) - Math.min(r, g, b) <= 0x10;
}
const isWhitish = (hex: string) => /^#?(f[a-f0-9]){3}$/i.test(hex) || hex.toLowerCase() === "#ffffff";

type TextItem = { str: string; fontName: string; transform: number[]; width: number; height: number };

export async function analyzePdfLayout(data: Uint8Array): Promise<LayoutFacts> {
  const doc = await pdfjs.getDocument({ data, disableFontFace: true, useSystemFonts: false, verbosity: 0, isEvalSupported: false }).promise;
  const names = Object.fromEntries(Object.entries(pdfjs.OPS).map(([k, v]) => [v as number, k]));
  const lines: LayoutLine[] = [];
  const pageInfo: LayoutPage[] = [];
  const colouredText: ColouredRun[] = [];
  const fontSet = new Set<string>();
  let images = 0, colouredFills = 0;

  try {
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      const vp = page.getViewport({ scale: 1 });
      const ops = await page.getOperatorList(); // also loads the fonts into commonObjs
      const tc = await page.getTextContent();
      const fontName = (id: string): string => {
        try { return stripSubset((page.commonObjs.get(id) as { name?: string })?.name ?? id); } catch { return id; }
      };

      // ── Lines: group text items by baseline ──
      const items = (tc.items as TextItem[]).filter(i => typeof i.str === "string" && i.str.trim());
      const byLine = new Map<number, TextItem[]>();
      for (const it of items) {
        const y = Math.round(it.transform[5]);
        const key = [...byLine.keys()].find(k => Math.abs(k - y) <= 1.5) ?? y;
        byLine.set(key, [...(byLine.get(key) ?? []), it]);
      }
      for (const [y, its] of byLine) {
        its.sort((a, b) => a.transform[4] - b.transform[4]);
        const text = its.map(i => i.str).join(" ").replace(/\s+/g, " ").trim();
        const chars = (pred: (i: TextItem) => boolean) => its.filter(pred).reduce((n, i) => n + i.str.trim().length, 0);
        const total = chars(() => true) || 1;
        const fontsOf = its.map(i => fontName(i.fontName));
        fontsOf.forEach(f => fontSet.add(f));
        const dominant = its.reduce((a, b) => (b.str.length > a.str.length ? b : a));
        const x0 = its[0].transform[4];
        const last = its[its.length - 1];
        lines.push({
          page: p, x: x0, y, width: last.transform[4] + last.width - x0,
          height: Math.max(...its.map(i => i.height || Math.hypot(i.transform[2], i.transform[3]))),
          text, size: Math.round(Math.max(...its.map(i => Math.hypot(i.transform[0], i.transform[1]))) * 10) / 10,
          bold: chars(i => BOLD_RE.test(fontName(i.fontName))) / total > 0.6,
          italic: chars(i => ITALIC_RE.test(fontName(i.fontName))) / total > 0.6,
          font: fontName(dominant.fontName),
        });
      }

      // ── Margins + fill ──
      if (items.length) {
        const xs = items.map(i => i.transform[4]);
        const xe = items.map(i => i.transform[4] + i.width);
        const ys = items.map(i => i.transform[5]);
        const ye = items.map(i => i.transform[5] + (i.height || Math.hypot(i.transform[2], i.transform[3])));
        const margins = {
          left: Math.min(...xs), right: vp.width - Math.max(...xe),
          top: vp.height - Math.max(...ye), bottom: Math.min(...ys),
        };
        const usable = vp.height - 2 * 54; // usable height at the midpoint of the allowed margin range
        pageInfo.push({ width: vp.width, height: vp.height, margins, fill: Math.min(1, (Math.max(...ye) - Math.min(...ys)) / usable) });
      } else {
        pageInfo.push({ width: vp.width, height: vp.height, margins: null, fill: 0 });
      }

      // ── Colours, images, coloured fills from the operator list ──
      const links = (await page.getAnnotations()).filter((a: { subtype?: string }) => a.subtype === "Link") as Array<{ rect: number[] }>;
      void links; // link areas are matched by text below (emails/URLs), rects not needed
      const stack: string[] = [];
      let fill = "#000000";
      let pathPending = false;
      for (let i = 0; i < ops.fnArray.length; i++) {
        const op = names[ops.fnArray[i]];
        const args = ops.argsArray[i] as unknown[];
        if (op === "save") stack.push(fill);
        else if (op === "restore") fill = stack.pop() ?? "#000000";
        else if (op === "setFillRGBColor") fill = typeof args[0] === "string" ? args[0] : "#000000";
        else if (op === "setFillGray") { const v = Math.round(Number(args[0]) * 255).toString(16).padStart(2, "0"); fill = `#${v}${v}${v}`; }
        else if (op === "constructPath") pathPending = true;
        else if ((op === "fill" || op === "eoFill" || op === "fillStroke" || op === "eoFillStroke") && pathPending) {
          if (!isBlackish(fill) && !isWhitish(fill)) colouredFills++;
          pathPending = false;
        } else if (op === "endPath") pathPending = false;
        else if (op === "paintImageXObject" || op === "paintInlineImageXObject" || op === "paintImageMaskXObject") images++;
        else if (op === "showText" && !isBlackish(fill) && !isWhitish(fill)) {
          const glyphs = (args[0] ?? []) as Array<{ unicode?: string } | number | null>;
          const text = glyphs.map(g => (g && typeof g === "object" ? g.unicode ?? "" : typeof g === "number" && g < -200 ? " " : "")).join("").trim();
          if (text) {
            const prev = colouredText[colouredText.length - 1];
            if (prev && prev.page === p && prev.color === fill) prev.text += text;
            else colouredText.push({ page: p, text, color: fill, isLink: false });
          }
        }
      }
      page.cleanup();
    }
  } finally {
    await doc.destroy();
  }

  for (const r of colouredText) r.isLink = /@|linkedin|https?:|www\.|\.(com|ch|de|net|org)\b/i.test(r.text);
  return {
    pages: pageInfo.length, pageInfo, lines,
    maxFontSize: Math.max(0, ...lines.map(l => l.size)),
    colouredText, images, colouredFills, fonts: [...fontSet],
  };
}

const norm = (s: string) => s.toLowerCase().replace(/[‐-―−]/g, "-").replace(/\s+/g, " ").trim();

/** First line whose text contains `text` (or its first 40 chars). */
export function findLine(facts: LayoutFacts, text: string | null | undefined, from = 0): LayoutLine | undefined {
  if (!text?.trim()) return undefined;
  const n = norm(text);
  const probe = n.length > 40 ? n.slice(0, 40) : n;
  return facts.lines.slice(from).find(l => norm(l.text).includes(probe)) ?? facts.lines.slice(from).find(l => probe.includes(norm(l.text)) && norm(l.text).length > 3);
}
