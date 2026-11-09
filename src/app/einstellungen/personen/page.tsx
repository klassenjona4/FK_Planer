import Link from "next/link";
import { Seitenkopf } from "@/components/Seitenkopf";
import { eq } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { brauchtPlanung } from "@/lib/auth";
import { Avatar } from "@/components/Avatar";
import { ladePersonen } from "@/lib/daten";
import { heute } from "@/lib/zeit-server";
import { personName } from "@/planung";
import { personSpeichernAktion } from "../aktionen";
import { PersonFormular } from "../Formulare";

export const metadata = { title: "Personen" };

export default async function PersonenSeite() {
  const konto = await brauchtPlanung();
  const [personen, konten] = await Promise.all([
    ladePersonen(konto.teamId),
    db.select({ personId: s.benutzerkonto.personId, rolle: s.benutzerkonto.rolle, gesperrt: s.benutzerkonto.gesperrt }).from(s.benutzerkonto).where(eq(s.benutzerkonto.teamId, konto.teamId)),
  ]);
  const k = new Map(konten.map((x) => [x.personId, x]));
  const h = heute();
  return (
    <>
      <Seitenkopf titel="Personen im Team" zurueck={{ href: "/einstellungen", text: "Einstellungen" }} />
      <div className="tabelle-huelle">
        <table className="tabelle-mobil">
          <thead>
            <tr>
              <th scope="col">Name</th>
              <th scope="col" className="zahl">Stellenumfang</th>
              <th scope="col">Funktion</th>
              <th scope="col">Zugang</th>
              <th scope="col"><span className="nur-sr">Aktion</span></th>
            </tr>
          </thead>
          <tbody>
            {personen.map((p) => {
              const ausgeschieden = p.aktivBis && p.aktivBis < h;
              return (
                <tr key={p.id}>
                  <td data-titel="Name"><span className="person-zelle"><Avatar name={personName(p)} groesse="klein" />{personName(p)}</span>{ausgeschieden && <span className="grund">nicht mehr im Team</span>}</td>
                  <td data-titel="Stellenumfang" className="zahl">{Math.round(p.stellenanteil * 100)} %</td>
                  <td data-titel="Funktion">
                    {p.istVorgesetzt ? (p.vorgesetztRang === 1 ? "Teamleitung" : "Vertretung") : "Fachkraft"}
                    {!p.istVorgesetzt && !p.darfAufgefuelltWerden && <span className="grund">wird nicht aufgefüllt</span>}
                  </td>
                  <td data-titel="Zugang">
                    {k.get(p.id) ? (k.get(p.id)!.gesperrt ? "gesperrt" : k.get(p.id)!.rolle === "PLANUNG" ? "Planung" : "Mitarbeitende") : "kein Zugang"}
                  </td>
                  <td data-titel="Aktion"><Link href={`/einstellungen/personen/${p.id}`}>Bearbeiten<span className="nur-sr"> ({personName(p)})</span></Link></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <h2 className="abschnitt-titel">Neue Person anlegen</h2>
      <PersonFormular aktion={personSpeichernAktion.bind(null, null)} neu />
    </>
  );
}
