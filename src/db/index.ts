import { drizzle } from "drizzle-orm/node-postgres";
import { Pool, type PoolConfig } from "pg";
import * as schema from "./schema";
import { SUPABASE_ROOT_CA } from "./supabase-ca";

const globalFuerDb = globalThis as unknown as { fkPool?: Pool };

/**
 * Verschlüsselte Verbindung für gehostete Datenbanken. Das Serverzertifikat wird immer geprüft:
 * - DATABASE_SSL=supabase → gegen das mitgelieferte öffentliche Supabase-Stammzertifikat
 * - DATABASE_SSL=1        → gegen DATABASE_CA (PEM) oder die Systemzertifikate
 */
function sslEinstellung(): PoolConfig["ssl"] {
  if (process.env.DATABASE_SSL === "supabase") return { ca: SUPABASE_ROOT_CA, rejectUnauthorized: true };
  if (process.env.DATABASE_SSL !== "1") return undefined;
  const ca = process.env.DATABASE_CA?.replace(/\\n/g, "\n");
  return ca ? { ca, rejectUnauthorized: true } : { rejectUnauthorized: true };
}

const pool =
  globalFuerDb.fkPool ??
  new Pool({
    connectionString: process.env.DATABASE_URL ?? "postgres://fk:fk@localhost:5432/fk_planer",
    // In Serverless-Umgebungen (Vercel) genügt eine Verbindung je Instanz
    max: process.env.VERCEL ? 1 : 10,
    ssl: sslEinstellung(),
  });
globalFuerDb.fkPool = pool;

export const db = drizzle(pool, { schema });
export type Db = typeof db;
export { schema };
