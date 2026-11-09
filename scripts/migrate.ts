import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL ?? "postgres://fk:fk@localhost:5432/fk_planer" });
  await migrate(drizzle(pool), { migrationsFolder: "./drizzle" });
  await pool.end();
  console.log("Datenbank ist auf dem neuesten Stand.");
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
