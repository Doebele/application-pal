// A4 PDF of the pupil CV (pdf-lib, standard Helvetica — no font files needed).
// Layout: title, name, photo top right, personal details, then each section as a
// two-column table (period / label left, text right), wrapped to the page width.
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { winAnsiSafe, type SchoolCvModel } from "./school-cv.js";

const MM = 72 / 25.4;
const PAGE_W = 210 * MM, PAGE_H = 297 * MM;
const MARGIN = 20 * MM;
const LEFT_COL = 42 * MM;
const INK = rgb(0.12, 0.12, 0.14), MUTED = rgb(0.38, 0.38, 0.42), RULE = rgb(0.8, 0.8, 0.82);

function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const out: string[] = [];
  for (const para of winAnsiSafe(text).split("\n")) {
    let line = "";
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const next = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(next, size) <= width || !line) line = next;
      else { out.push(line); line = word; }
    }
    out.push(line);
  }
  return out;
}

export async function schoolCvPdf(m: SchoolCvModel, photo: { bytes: Uint8Array; type: "jpeg" | "png" } | null): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`${m.title} ${m.name}`.trim());
  doc.setAuthor(m.name || "");
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  let page: PDFPage = doc.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H - MARGIN;
  const textW = PAGE_W - 2 * MARGIN;

  const newPageIfNeeded = (need: number) => {
    if (y - need < MARGIN) { page = doc.addPage([PAGE_W, PAGE_H]); y = PAGE_H - MARGIN; }
  };
  const draw = (t: string, x: number, size: number, font: PDFFont, color = INK) =>
    page.drawText(winAnsiSafe(t), { x, y, size, font, color });

  // Photo (35 × 45 mm, top right)
  const photoW = 35 * MM, photoH = 45 * MM;
  if (photo) {
    try {
      const img = photo.type === "png" ? await doc.embedPng(photo.bytes) : await doc.embedJpg(photo.bytes);
      // Contain-fit inside the 35 × 45 mm frame, centred (no clipping in pdf-lib)
      const scale = Math.min(photoW / img.width, photoH / img.height);
      const w = img.width * scale, h = img.height * scale;
      page.drawImage(img, { x: PAGE_W - MARGIN - photoW + (photoW - w) / 2, y: PAGE_H - MARGIN - photoH + (photoH - h) / 2, width: w, height: h });
      page.drawRectangle({ x: PAGE_W - MARGIN - photoW, y: PAGE_H - MARGIN - photoH, width: photoW, height: photoH, borderColor: RULE, borderWidth: 0.5 });
    } catch { /* unreadable image → no photo */ }
  }
  const headW = photo ? textW - photoW - 6 * MM : textW;

  y -= 8;
  draw(m.title.toUpperCase(), MARGIN, 10, bold, MUTED);
  y -= 26;
  for (const line of wrap(m.name || " ", bold, 22, headW)) { draw(line, MARGIN, 22, bold); y -= 26; }
  y -= 4;
  for (const p of m.personal) {
    const lines = wrap(p.value, regular, 10, headW - 30 * MM);
    draw(p.label, MARGIN, 9, regular, MUTED);
    for (const line of lines) { draw(line, MARGIN + 30 * MM, 10, regular); y -= 14; }
  }
  if (photo) y = Math.min(y, PAGE_H - MARGIN - photoH - 10);

  for (const sec of m.sections) {
    newPageIfNeeded(50);
    y -= 14;
    draw(sec.title.toUpperCase(), MARGIN, 10, bold);
    y -= 5;
    page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_W - MARGIN, y }, thickness: 0.5, color: RULE });
    y -= 14;
    for (const r of sec.rows) {
      const right = wrap(r.what, bold, 10, textW - LEFT_COL);
      const detail = r.detail ? wrap(r.detail, regular, 9.5, textW - LEFT_COL) : [];
      newPageIfNeeded((right.length + detail.length) * 13 + 4);
      if (r.when) draw(r.when, MARGIN, 9.5, regular, MUTED);
      for (const line of right) { draw(line, MARGIN + LEFT_COL, 10, bold); y -= 13; }
      for (const line of detail) { draw(line, MARGIN + LEFT_COL, 9.5, regular, MUTED); y -= 12.5; }
      y -= 4;
    }
  }
  return doc.save();
}
