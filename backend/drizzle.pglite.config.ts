import type { Config } from "drizzle-kit";

// Desktop-Spike (M0): vollständige Schema-Migration für eingebettetes PGlite.
// Erzeugen: npx drizzle-kit generate --config backend/drizzle.pglite.config.ts
export default {
  schema: "../shared/src/schema.ts",
  out: "./drizzle-pglite",
  dialect: "postgresql",
} satisfies Config;
