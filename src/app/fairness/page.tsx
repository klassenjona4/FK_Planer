import { Avatar } from "@/components/Avatar";
import { KpiLeiste } from "@/components/Kpi";
import { Seitenkopf } from "@/components/Seitenkopf";
import { brauchtAnmeldung } from "@/lib/auth";
import { ladeFairness } from "@/lib/daten";
import { datumZahl, durchschnittsQuote, formatZahl, zeitraumBeginn } from "@/planung";

export const metadata = { title: "Fairnessübersicht" };

export default async function FairnessSeite() {
  const konto = await brauchtAnmeldung();
  const { zeilen, wochen, stichtag } = await ladeFairness(konto.teamId);
  const schnitt = durchschnittsQuote(zeilen);
  const sortiert = [...zeilen].sort((a, b) => a.name.localeCompare(b.name, "de"));
  const ich = zeilen.find((z) => z.personId === konto.personId);
  const maxQuote = Math.max(1, ...zeilen.map((z) => (Number.isFinite(z.quote) ? z.quote : 0)));
  const gesamtOhne = zeilen.reduce((s, z) => s + z.ohneEigenenFall, 0);
  const gesamtMit = zeilen.reduce((s, z) => s + z.mitEigenemFall, 0);

  return (
    <>
      <Seitenkopf
        titel="Fairnessübersicht des Teams"
        unterzeile={`Zeitraum ${datumZahl(zeitraumBeginn(stichtag, wochen))} bis ${datumZahl(stichtag)} (${wochen} Wochen). Es zählen nur veröffentlichte Pläne.`}
      />
      <KpiLeiste
        titel="Kennzahlen zur Fairness"
        eintraege={[
          { titel: "Teamdurchschnitt", wert: formatZahl(schnitt), zusatz: "je Vollzeitstelle", symbol: "fairness" },
          ...(ich ? [{
            titel: "Ihr Wert", wert: Number.isFinite(ich.quote) ? formatZahl(ich.quote) : "–", zusatz: "je Vollzeitstelle", symbol: "personen",
            abzeichen: ich.quote > schnitt * 1.2 ? { text: "über Durchschnitt", art: "warnung" as const } : { text: "im Rahmen", art: "ok" as const },
          }] : []),
          { titel: "Teilnahmen mit eigenem Fall", wert: gesamtMit, symbol: "faelle" },
          { titel: "Teilnahmen ohne eigenen Fall", wert: gesamtOhne, symbol: "gruppen" },
        ]}
      />
      <div className="meldung info">
        <p><strong>So wird gerechnet:</strong> Teilnahmen ohne eigenen Fall (aufgefüllt oder als erforderlich angegeben) geteilt durch
        den Stellenanteil und den Anteil der Konferenztage, an denen die Person da war. Wer den niedrigsten Wert hat, wird als Nächstes aufgefüllt.
        Teilzeitkräfte werden dadurch anteilig seltener herangezogen. Vorgesetzte werden nur bei Bedarf eingeplant und erscheinen hier nicht.</p>
      </div>
      <div className="tabelle-huelle">
        <table className="tabelle-mobil">
          <caption>Teilnahmen je Person</caption>
          <thead>
            <tr>
              <th scope="col">Person</th>
              <th scope="col" className="zahl">Stellenanteil</th>
              <th scope="col" className="zahl">Mit eigenem Fall</th>
              <th scope="col" className="zahl">Als erforderlich</th>
              <th scope="col" className="zahl">Aufgefüllt</th>
              <th scope="col" className="zahl">Anwesend</th>
              <th scope="col" className="zahl">Je Vollzeitstelle</th>
              <th scope="col"><span className="nur-sr">Balken</span></th>
            </tr>
          </thead>
          <tbody>
            {sortiert.map((z) => {
              const q = Number.isFinite(z.quote) ? z.quote : maxQuote;
              return (
                <tr key={z.personId} style={z.personId === konto.personId ? { background: "var(--gruen-leise)" } : undefined}>
                  <td data-titel="Person"><span className="person-zelle"><Avatar name={z.name} groesse="klein" /><span>{z.name}{z.personId === konto.personId && <strong> (Sie)</strong>}</span></span></td>
                  <td data-titel="Stellenanteil" className="zahl">{Math.round(z.stellenanteil * 100)} %</td>
                  <td data-titel="Mit eigenem Fall" className="zahl">{z.mitEigenemFall}</td>
                  <td data-titel="Als erforderlich" className="zahl">{z.erforderlich}</td>
                  <td data-titel="Aufgefüllt" className="zahl">{z.aufgefuellt}</td>
                  <td data-titel="Anwesend" className="zahl">{Math.round(z.anwesenheitsanteil * 100)} %</td>
                  <td data-titel="Je Vollzeitstelle" className="zahl">
                    <strong>{Number.isFinite(z.quote) ? formatZahl(z.quote) : "–"}</strong>
                    {Number.isFinite(z.quote) && <span className="nur-sr"> {z.quote > schnitt ? "(über dem Durchschnitt)" : "(unter oder gleich dem Durchschnitt)"}</span>}
                  </td>
                  <td data-titel="Balken" style={{ minWidth: 130 }}>
                    <div className={`fortschritt${z.quote > schnitt * 1.2 ? " hoch" : ""}`} aria-hidden="true"><span style={{ width: `${(q / maxQuote) * 100}%` }} /></div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
