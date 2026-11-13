import { readFile } from "node:fs/promises";
import path from "node:path";
import { drizzle as drizzlePg, type NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "@application-pal/shared";
import { env } from "./env.js";

// Schmale DB-Schicht (Desktop-Spike M0).
// DB_DRIVER=postgres (Default, Docker/Web) → node-postgres Pool auf DATABASE_URL.
// DB_DRIVER=pglite → eingebettetes Postgres (WASM) in PGLITE_DATA_DIR, Schema per
//   drizzle-Migration aus MIGRATIONS_DIR (backend/drizzle-pglite) beim Start.
// Beide Treiber sprechen den Postgres-Dialekt; nach aussen sieht der Rest des
// Backends nur `db` mit dem Typ von node-postgres.

export type Db = NodePgDatabase<typeof schema>;

async function createPglite(): Promise<Db> {
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");

  // In einem kompilierten Sidecar (bun --compile) findet PGlite seine WASM-/Data-
  // Dateien nicht über import.meta.url. Dann liefert PGLITE_ASSETS_DIR sie von Hand.
  const assets = process.env.PGLITE_ASSETS_DIR;
  const extra: Record<string, unknown> = {};
  if (assets) {
    const [wasm, initdb, data] = await Promise.all([
      readFile(path.join(assets, "pglite.wasm")),
      readFile(path.join(assets, "initdb.wasm")),
      readFile(path.join(assets, "pglite.data")),
    ]);
    extra.pgliteWasmModule = await WebAssembly.compile(wasm);
    extra.initdbWasmModule = await WebAssembly.compile(initdb);
    extra.fsBundle = new Blob([data]);
  }

  const dataDir = env.PGLITE_DATA_DIR;
  const t0 = Date.now();
  const client = await PGlite.create({ dataDir: dataDir || undefined, ...extra });
  closeHook = () => client.close();
  const pdb = drizzle(client, { schema });
  const migrationsFolder = env.MIGRATIONS_DIR ?? path.resolve(process.cwd(), "backend/drizzle-pglite");
  await migrate(pdb, { migrationsFolder });
  console.log(`[db] PGlite bereit (${dataDir || "in-memory"}) in ${Date.now() - t0} ms`);
  return pdb as unknown as Db;
}

let closeHook: (() => Promise<void>) | null = null;
/** Flushes and closes the embedded database (PGlite). No-op for Postgres. */
export async function closeDb(): Promise<void> {
  const hook = closeHook;
  closeHook = null;
  if (hook) await hook();
}

async function createPostgres(): Promise<Db> {
  const { Pool } = (await import("pg")).default;
  if (!env.DATABASE_URL) throw new Error("DATABASE_URL fehlt (DB_DRIVER=postgres)");
  const pool = new Pool({ connectionString: env.DATABASE_URL });
  return drizzlePg(pool, { schema });
}

export const db: Db = env.DB_DRIVER === "pglite" ? await createPglite() : await createPostgres();
