import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { FallFormular } from "@/components/FallFormular";
import { brauchtAnmeldung, istPlanung } from "@/lib/auth";
import { terminAuswahl } from "@/lib/ansicht";
import { ladePersonen, ladeTermine } from "@/lib/daten";
import { personName } from "@/planung";
import { fallAendernAktion, fallZurueckziehenAktion } from "../../fall-eintragen/aktionen";

export const metadata = { title: "Fall bearbeiten" };

export default async function FallBearbeitenSeite({ params }: { params: Promise<{ id: string }> }) {
  const konto = await brauchtAnmeldung();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const [f] = await db.select().from(s.falleintrag).where(and(eq(s.falleintrag.id, id), eq(s.falleintrag.teamId, konto.teamId)));
  if (!f || (!istPlanung(konto) && f.verantwortlichId !== konto.personId)) notFound();
  const [personen, termine, erf, imPlan] = await Promise.all([
    ladePersonen(konto.teamId),
    ladeTermine(konto.teamId),
    db.select().from(s.fallErforderlich).where(eq(s.fallErforderlich.falleintragId, f.id)),
    db
      .select({ status: s.plan.status })
      .from(s.planPunkt)
      .innerJoin(s.gruppe, eq(s.planPunkt.gruppeId, s.gruppe.id))
      .innerJoin(s.plan, eq(s.gruppe.planId, s.plan.id))
      .where(eq(s.planPunkt.falleintragId, f.id)),
  ]);
  const veroeffentlicht = imPlan.some((p) => p.status === "VEROEFFENTLICHT");
  const tag = f.wunschVon === f.wunschBis ? termine.find((t) => t.datum === f.wunschVon) : undefined;

  return (
    <>
      <p><Link href="/faelle">← Zurück zur Übersicht</Link></p>
      <h1>Fall {f.fallkuerzel} bearbeiten</h1>
      {veroeffentlicht && !istPlanung(konto) ? (
        <div className="meldung info"><p>Dieser Fall steht bereits in einem veröffentlichten Plan. Für Änderungen wenden Sie sich bitte an die Planung.</p></div>
      ) : (
        <>
          {imPlan.length > 0 && (
            <div className="meldung warnung">
              <p>Dieser Fall steht bereits in einem Plan. Änderungen hier passen den Plan nicht automatisch an – bitte den Plan danach prüfen oder neu erzeugen.</p>
            </div>
          )}
          <FallFormular
            aktion={fallAendernAktion.bind(null, f.id)}
            personen={personen.map((p) => ({ id: p.id, name: personName(p), istVorgesetzt: p.istVorgesetzt }))}
            termine={terminAuswahl(termine)}
            istPlanung={istPlanung(konto)}
            eigenePersonId={konto.personId}
            eigenerName={personName(personen.find((p) => p.id === f.verantwortlichId)!)}
            knopfText="Änderungen speichern"
            startwerte={{
              verantwortlich: f.verantwortlichId,
              fallkuerzel: f.fallkuerzel,
              dauer: f.dauerMinuten,
              wunschArt: tag ? "tag" : "zeitraum",
              termin: tag?.id,
              von: f.wunschVon,
              bis: f.wunschBis,
              vorgesetzt: f.vorgesetztErforderlich,
              erforderlich: erf.map((e) => e.personId),
              dringend: f.dringend,
              notiz: f.notiz ?? "",
            }}
          />
          <h2>Fall zurückziehen</h2>
          <p>Wenn der Fall nicht mehr besprochen werden muss, können Sie ihn zurückziehen.</p>
          <form action={fallZurueckziehenAktion.bind(null, f.id)}>
            <button type="submit" className="gefahr">Fall {f.fallkuerzel} zurückziehen</button>
          </form>
        </>
      )}
    </>
  );
}
