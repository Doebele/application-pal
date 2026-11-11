// Desktop-Spike (M0): pdfjs-dist braucht DOMMatrix/ImageData/Path2D schon beim Laden.
// Unter Node holt pdf-parse sie zur Laufzeit aus @napi-rs/canvas; in einem
// bun --compile-Binary schlägt dieser dynamische require fehl. Ein statischer
// Import bettet das native Addon ins Binary ein und setzt die Globals vorab.
// Muss der erste Import in index.ts bleiben.
import * as canvas from "@napi-rs/canvas";

const g = globalThis as Record<string, unknown>;
for (const name of ["DOMMatrix", "ImageData", "Path2D"] as const) {
  if (!g[name] && (canvas as Record<string, unknown>)[name]) g[name] = (canvas as Record<string, unknown>)[name];
}

// pdfjs lädt seinen "fake worker" per import("./pdf.worker.mjs") relativ zu sich
// selbst — im Binary gibt es diesen Pfad nicht. Liegt der Worker als
// globalThis.pdfjsWorker vor, nimmt pdfjs ihn direkt (gilt auch für pdf-parse).
// @ts-expect-error — pdfjs liefert für die Worker-Datei keine Typen
import * as pdfjsWorker from "pdfjs-dist/legacy/build/pdf.worker.mjs";
g.pdfjsWorker ??= pdfjsWorker;
