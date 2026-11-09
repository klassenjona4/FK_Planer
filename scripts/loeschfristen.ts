/**
 * Setzt die Löschfristen um (z. B. täglich per Cron aufrufen: npm run db:loeschfristen).
 * - Falleinträge (Fallkürzel, Notiz) werden X Monate nach dem Wunschtermin gelöscht.
 *   Die Teilnahmen bleiben ohne Fallbezug für die Fairnessstatistik erhalten.
 * - Texte im Änderungsverlauf, die Fallkürzel enthalten können, werden geleert.
 * - Abgelaufene Anmeldesitzungen werden entfernt.
 */
import { and, eq, inArray, lt } from "drizzle-orm";
import { db, schema as s } from "../src/db";
import { plusTage } from "../src/planung";
import { heute } from "../src/lib/zeit-server";

async function main() {
  const teams = await db.select().from(s.einstellungen);
  for (const e of teams) {
    const grenze = plusTage(heute(), -Math.round(e.loeschfristMonate * 30.44));
    const geloescht = await db
      .delete(s.falleintrag)
      .where(and(eq(s.falleintrag.teamId, e.teamId), lt(s.falleintrag.wunschBis, grenze)))
      .returning({ id: s.falleintrag.id });
    const alteTage = await db
      .select({ id: s.plan.id })
      .from(s.plan)
      .innerJoin(s.konferenztag, eq(s.plan.konferenztagId, s.konferenztag.id))
      .where(and(eq(s.plan.teamId, e.teamId), lt(s.konferenztag.datum, grenze)));
    if (alteTage.length) {
      await db
        .update(s.aenderung)
        .set({ beschreibung: "Details nach Ablauf der Löschfrist entfernt.", vorher: null, nachher: null })
        .where(inArray(s.aenderung.planId, alteTage.map((p) => p.id)));
    }
    console.log(`Team ${e.teamId}: ${geloescht.length} Falleinträge vor dem ${grenze} gelöscht.`);
  }
  await db.delete(s.loginSitzung).where(lt(s.loginSitzung.laeuftAbAm, new Date()));
  await db.$client.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
