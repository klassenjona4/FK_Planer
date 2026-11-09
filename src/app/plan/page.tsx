import Link from "next/link";
import { eq } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { Seitenkopf } from "@/components/Seitenkopf";
import { Symbol } from "@/components/Symbole";
import { brauchtAnmeldung, istPlanung } from "@/lib/auth";
import { ladeFaelle, ladeTermine } from "@/lib/daten";
import { heute } from "@/lib/zeit-server";
import { datumLang, wunschPasst } from "@/planung";

export const metadata = { title: "Plan" };

const fristFormat = new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export default async function PlanUebersicht({ searchParams }: { searchParams: Promise<{ vergangen?: string }> }) {
  const konto = await brauchtAnmeldung();
  const planung = istPlanung(konto);
  const sp = await searchParams;
  const [termine, plaene, faelle] = await Promise.all([
    ladeTermine(konto.teamId),
    db.select({ tagId: s.plan.konferenztagId, status: s.plan.status }).from(s.plan).where(eq(s.plan.teamId, konto.teamId)),
    ladeFaelle(konto.teamId, false),
  ]);
  const h = heute();
  const vergangen = sp.vergangen === "1";
  const kommende = termine.filter((t) => t.datum >= h);
  const fruehere = termine.filter((t) => t.datum < h).reverse();
  const liste = vergangen ? fruehere : kommende;
  const status = new Map(plaene.map((p) => [p.tagId, p.status]));

  return (
    <>
      <Seitenkopf titel="Plan der Fachkonferenzen" unterzeile="Die Fachkonferenz findet dienstags statt. Wählen Sie einen Termin.">
        {planung && <Link className="knopf zweitrangig" href="/einstellungen/termine"><Symbol name="einstellungen" /> Termine verwalten</Link>}
      </Seitenkopf>
      <nav className="chips" aria-label="Zeitraum">
        <Link className="chip" href="/plan" aria-current={!vergangen ? "true" : undefined}>Kommende <span className="anzahl">{kommende.length}</span></Link>
        <Link className="chip" href="/plan?vergangen=1" aria-current={vergangen ? "true" : undefined}>Vergangene <span className="anzahl">{fruehere.length}</span></Link>
      </nav>
      {liste.length === 0 ? (
        <div className="karte"><p className="leise">Keine Termine vorhanden.</p></div>
      ) : (
        <div className="raster" style={{ marginTop: "1rem" }}>
          {liste.map((t) => {
            const st = status.get(t.id);
            const anzahl = faelle.filter((f) => wunschPasst(f, t.datum)).length;
            const fristVorbei = new Date() > t.frist;
            return (
              <article key={t.id} className="fallkarte" aria-labelledby={`t-${t.id}`}>
                <div className="fallkarte-kopf">
                  <span className="kpi-symbol" style={{ width: 40, height: 40, borderRadius: 11 }}><Symbol name="plan" /></span>
                  <div className="fallkarte-titel">
                    <strong id={`t-${t.id}`}><Link href={`/plan/${t.id}`}>{datumLang(t.datum)}</Link></strong>
                    <span className="unter">ab {t.beginn} Uhr{t.ende ? ` bis ${t.ende} Uhr` : ""}</span>
                  </div>
                </div>
                <div className="fallkarte-meta">
                  {st === "VEROEFFENTLICHT" ? <span className="abzeichen ok">Veröffentlicht</span>
                    : st === "ENTWURF" ? <span className="abzeichen warnung">{planung ? "Entwurf" : "In Planung"}</span>
                    : <span className="abzeichen leer">Noch kein Plan</span>}
                  {planung && <span className="abzeichen"><Symbol name="faelle" /> {anzahl} {anzahl === 1 ? "Fall" : "Fälle"}</span>}
                  {planung && !vergangen && (
                    <span className={`abzeichen ${fristVorbei ? "fehler" : ""}`}><Symbol name="frist" /> Frist {fristFormat.format(t.frist)}</span>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </>
  );
}
