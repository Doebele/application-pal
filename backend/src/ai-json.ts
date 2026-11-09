// Parses the JSON a model answered with. Local models regularly break it inside long texts
// (an unescaped " in a description, a raw line break, a trailing comma), so a failed parse
// is repaired before it counts as an error.
import { jsonrepair } from "jsonrepair";

/** The answer holds no JSON that can be read, even after repair. */
export class ModelJsonError extends Error {
  constructor(cause: string) {
    super(`Die KI-Antwort war kein lesbares JSON (${cause.slice(0, 120)})`);
    this.name = "ModelJsonError";
  }
}

export function parseModelJson(raw: string): unknown {
  let s = raw.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
  s = s.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  const m = s.match(/\{[\s\S]*\}/);
  if (!m) throw new ModelJsonError("No JSON found in response");
  try {
    return JSON.parse(m[0]);
  } catch (first) {
    try {
      return JSON.parse(jsonrepair(m[0]));
    } catch {
      throw new ModelJsonError((first as Error).message);
    }
  }
}
