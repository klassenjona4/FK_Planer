import Link from "next/link";
import { eq } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { brauchtAnmeldung, istPlanung } from "@/lib/auth";
import { ladeFaelle, ladeTermine } from "@/lib/daten";
import { heute } from "@/lib/zeit-server";
import { datumLang, wunschPasst } from "@/planung";

export const metadata = { title: "Plan" };

export default async function PlanUebersicht({ searchParams }: { searchParams: Promise<{ vergangen?: string }> }) {
  const konto = await brauchtAnmeldung();
  const sp = await searchParams;
  const [termine, plaene, faelle] = await Promise.all([
    ladeTermine(konto.teamId),
    db.select({ tagId: s.plan.konferenztagId, status: s.plan.status }).from(s.plan).where(eq(s.plan.teamId, konto.teamId)),
    ladeFaelle(konto.teamId),
  ]);
  const h = heute();
  const zeigeVergangene = sp.vergangen === "1";
  const liste = termine.filter((t) => (zeigeVergangene ? t.datum < h : t.datum >= h));
  const status = new Map(plaene.map((p) => [p.tagId, p.status]));

  return (
    <>
      <h1>Plan der Fachkonferenzen</h1>
      <div className="knopfleiste">
        <Link className="knopf zweitrangig" href={zeigeVergangene ? "/plan" : "/plan?vergangen=1"}>
          {zeigeVergangene ? "Kommende Termine anzeigen" : "Vergangene Termine anzeigen"}
        </Link>
      </div>
      {liste.length === 0 ? (
        <p>Keine Termine vorhanden.</p>
      ) : (
        <div className="tabelle-huelle">
          <table className="tabelle-mobil">
            <thead>
              <tr>
                <th scope="col">Termin</th>
                <th scope="col">Beginn</th>
                {istPlanung(konto) && <th scope="col" className="zahl">Passende Fälle</th>}
                {istPlanung(konto) && <th scope="col">Eintragungsfrist</th>}
                <th scope="col">Stand</th>
              </tr>
            </thead>
            <tbody>
              {(zeigeVergangene ? [...liste].reverse() : liste).map((t) => {
                const st = status.get(t.id);
                const anzahl = faelle.filter((f) => wunschPasst(f, t.datum)).length;
                return (
                  <tr key={t.id}>
                    <td data-titel="Termin"><Link href={`/plan/${t.id}`}>{datumLang(t.datum)}</Link></td>
                    <td data-titel="Beginn">{t.beginn} Uhr{t.ende ? ` bis ${t.ende} Uhr` : ""}</td>
                    {istPlanung(konto) && <td data-titel="Passende Fälle" className="zahl">{anzahl}</td>}
                    {istPlanung(konto) && (
                      <td data-titel="Eintragungsfrist">
                        {new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(t.frist)} Uhr
                      </td>
                    )}
                    <td data-titel="Stand">
                      {st === "VEROEFFENTLICHT" ? <span className="abzeichen veroeffentlicht">Veröffentlicht</span>
                        : st === "ENTWURF" ? <span className="abzeichen entwurf">{istPlanung(konto) ? "Entwurf" : "In Planung"}</span>
                        : <span className="abzeichen leer">Noch kein Plan</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
