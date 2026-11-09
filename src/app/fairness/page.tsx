import { brauchtAnmeldung } from "@/lib/auth";
import { ladeFairness } from "@/lib/daten";
import { datumZahl, durchschnittsQuote, formatZahl, zeitraumBeginn } from "@/planung";

export const metadata = { title: "Fairnessübersicht" };

export default async function FairnessSeite() {
  const konto = await brauchtAnmeldung();
  const { zeilen, wochen, stichtag: h } = await ladeFairness(konto.teamId);
  const schnitt = durchschnittsQuote(zeilen);
  const sortiert = [...zeilen].sort((a, b) => a.name.localeCompare(b.name, "de"));
  return (
    <>
      <h1>Fairnessübersicht des Teams</h1>
      <p>
        Zeitraum: {datumZahl(zeitraumBeginn(h, wochen))} bis {datumZahl(h)} ({wochen} Wochen). Es zählen nur veröffentlichte Pläne, auch für kommende Termine.
      </p>
      <div className="meldung info">
        <p><strong>So wird gerechnet:</strong> Teilnahmen ohne eigenen Fall (aufgefüllt oder als erforderlich angegeben) geteilt durch
        den Stellenanteil und den Anteil der Konferenztage, an denen die Person da war. Wer den niedrigsten Wert hat, wird als Nächstes aufgefüllt.
        Teilzeitkräfte werden dadurch anteilig seltener herangezogen. Vorgesetzte werden nur bei Bedarf eingeplant und erscheinen hier nicht.</p>
      </div>
      <div className="tabelle-huelle">
        <table className="tabelle-mobil">
          <caption>Teamdurchschnitt: {formatZahl(schnitt)} Teilnahmen ohne eigenen Fall je Vollzeitstelle</caption>
          <thead>
            <tr>
              <th scope="col">Person</th>
              <th scope="col" className="zahl">Stellenanteil</th>
              <th scope="col" className="zahl">Mit eigenem Fall</th>
              <th scope="col" className="zahl">Als erforderlich</th>
              <th scope="col" className="zahl">Aufgefüllt</th>
              <th scope="col" className="zahl">Ohne eigenen Fall gesamt</th>
              <th scope="col" className="zahl">Anwesend</th>
              <th scope="col" className="zahl">Je Vollzeitstelle</th>
            </tr>
          </thead>
          <tbody>
            {sortiert.map((z) => (
              <tr key={z.personId} style={z.personId === konto.personId ? { fontWeight: 700 } : undefined}>
                <td data-titel="Person">{z.name}{z.personId === konto.personId && " (Sie)"}</td>
                <td data-titel="Stellenanteil" className="zahl">{Math.round(z.stellenanteil * 100)} %</td>
                <td data-titel="Mit eigenem Fall" className="zahl">{z.mitEigenemFall}</td>
                <td data-titel="Als erforderlich" className="zahl">{z.erforderlich}</td>
                <td data-titel="Aufgefüllt" className="zahl">{z.aufgefuellt}</td>
                <td data-titel="Ohne eigenen Fall gesamt" className="zahl">{z.ohneEigenenFall} <span className="leise">({z.minutenOhneEigenenFall} Min.)</span></td>
                <td data-titel="Anwesend" className="zahl">{Math.round(z.anwesenheitsanteil * 100)} %</td>
                <td data-titel="Je Vollzeitstelle" className="zahl">
                  {Number.isFinite(z.quote) ? formatZahl(z.quote) : "–"}
                  {Number.isFinite(z.quote) && <span className="nur-sr"> {z.quote > schnitt ? "(über dem Durchschnitt)" : "(unter oder gleich dem Durchschnitt)"}</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
