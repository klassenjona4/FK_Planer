import { eq } from "drizzle-orm";
import { Seitenkopf } from "@/components/Seitenkopf";
import { db, schema as s } from "@/db";
import { brauchtPlanung } from "@/lib/auth";
import { ladeEinstellungen, ladeTermine } from "@/lib/daten";
import { heute } from "@/lib/zeit-server";
import { datumLang, wochentag } from "@/planung";
import { termineAnlegenAktion, terminAendernAktion, terminLoeschenAktion } from "../aktionen";
import { TermineAnlegenFormular, TerminZeile } from "../Formulare";

export const metadata = { title: "Termine" };

export default async function TermineSeite() {
  const konto = await brauchtPlanung();
  const [termine, e, plaene] = await Promise.all([
    ladeTermine(konto.teamId),
    ladeEinstellungen(konto.teamId),
    db.select({ tagId: s.plan.konferenztagId, status: s.plan.status }).from(s.plan).where(eq(s.plan.teamId, konto.teamId)),
  ]);
  const h = heute();
  const kommende = termine.filter((t) => t.datum >= h);
  const status = new Map(plaene.map((p) => [p.tagId, p.status]));
  return (
    <>
      <Seitenkopf titel="Konferenztermine" zurueck={{ href: "/einstellungen", text: "Einstellungen" }}
        unterzeile="Die Fachkonferenz findet dienstags statt. Beginn und Ende können für jeden Dienstag einzeln festgelegt werden." />
      <h2 className="abschnitt-titel">Dienstage anlegen</h2>
      <TermineAnlegenFormular aktion={termineAnlegenAktion} beginn={e.standardBeginn} ende={e.standardEnde} ab={h} />
      <h2 className="abschnitt-titel">Kommende Termine</h2>
      {kommende.length === 0 && <p>Keine kommenden Termine.</p>}
      {kommende.map((t) => {
        const titel = datumLang(t.datum);
        const st = status.get(t.id);
        return (
          <section key={t.id} className="karte" aria-label={titel}>
            <h3 style={{ marginTop: 0 }}>
              {titel} {wochentag(t.datum) !== "Dienstag" && <span className="abzeichen entwurf">kein Dienstag</span>}{" "}
              {st && <span className={`abzeichen ${st === "VEROEFFENTLICHT" ? "veroeffentlicht" : "entwurf"}`}>{st === "VEROEFFENTLICHT" ? "Plan veröffentlicht" : "Planentwurf"}</span>}
            </h3>
            <TerminZeile aktion={terminAendernAktion.bind(null, t.id)} titel={titel} werte={t} />
            {st !== "VEROEFFENTLICHT" && (
              <form action={terminLoeschenAktion.bind(null, t.id)} style={{ marginTop: "0.75rem" }}>
                <button type="submit" className="gefahr klein">Termin löschen<span className="nur-sr"> ({titel})</span></button>
              </form>
            )}
          </section>
        );
      })}
    </>
  );
}
