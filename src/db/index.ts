import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

const globalFuerDb = globalThis as unknown as { fkPool?: Pool };

const pool =
  globalFuerDb.fkPool ??
  new Pool({ connectionString: process.env.DATABASE_URL ?? "postgres://fk:fk@localhost:5432/fk_planer", max: 10 });
if (process.env.NODE_ENV !== "production") globalFuerDb.fkPool = pool;

export const db = drizzle(pool, { schema });
export type Db = typeof db;
export { schema };
