import { and, asc, eq, gte } from "drizzle-orm";
import { Seitenkopf } from "@/components/Seitenkopf";
import { db, schema as s } from "@/db";
import { brauchtAnmeldung, istPlanung } from "@/lib/auth";
import { ladePersonen } from "@/lib/daten";
import { heute } from "@/lib/zeit-server";
import { datumZahl, personName } from "@/planung";
import { AbwesenheitFormular } from "./AbwesenheitFormular";
import { abwesenheitLoeschenAktion } from "./aktionen";

export const metadata = { title: "Abwesenheiten" };

export default async function AbwesenheitenSeite() {
  const konto = await brauchtAnmeldung();
  const planung = istPlanung(konto);
  const personen = await ladePersonen(konto.teamId);
  const name = new Map(personen.map((p) => [p.id, personName(p)]));
  const bedingungen = [eq(s.abwesenheit.teamId, konto.teamId), gte(s.abwesenheit.bisDatum, heute())];
  if (!planung) bedingungen.push(eq(s.abwesenheit.personId, konto.personId));
  const liste = await db.select().from(s.abwesenheit).where(and(...bedingungen)).orderBy(asc(s.abwesenheit.vonDatum));

  return (
    <>
      <Seitenkopf titel="Abwesenheiten" unterzeile="Urlaub, Fortbildung oder andere Abwesenheiten. An diesen Tagen werden Sie nicht eingeplant." />
      <h2 className="abschnitt-titel">Neue Abwesenheit</h2>
      <AbwesenheitFormular
        personen={planung ? personen.map((p) => ({ id: p.id, name: personName(p) })) : undefined}
        eigenePersonId={konto.personId}
      />
      <h2 className="abschnitt-titel">{planung ? "Aktuelle und kommende Abwesenheiten im Team" : "Meine aktuellen und kommenden Abwesenheiten"}</h2>
      {liste.length === 0 ? (
        <div className="karte"><p className="leise">Keine Abwesenheiten eingetragen.</p></div>
      ) : (
        <div className="tabelle-huelle">
          <table className="tabelle-mobil">
            <thead>
              <tr>
                {planung && <th scope="col">Person</th>}
                <th scope="col">Zeitraum</th>
                <th scope="col"><span className="nur-sr">Aktion</span></th>
              </tr>
            </thead>
            <tbody>
              {liste.map((a) => {
                const zeitraum =
                  (a.vonDatum === a.bisDatum ? datumZahl(a.vonDatum) : `${datumZahl(a.vonDatum)} bis ${datumZahl(a.bisDatum)}`) +
                  (a.vonUhrzeit ? `, ab ${a.vonUhrzeit} Uhr` : "") +
                  (a.bisUhrzeit ? `, wieder da ab ${a.bisUhrzeit} Uhr` : "");
                return (
                  <tr key={a.id}>
                    {planung && <td data-titel="Person">{name.get(a.personId)}</td>}
                    <td data-titel="Zeitraum">{zeitraum}</td>
                    <td data-titel="Aktion">
                      <form action={abwesenheitLoeschenAktion.bind(null, a.id)}>
                        <button type="submit" className="gefahr klein">Löschen<span className="nur-sr"> ({zeitraum})</span></button>
                      </form>
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
