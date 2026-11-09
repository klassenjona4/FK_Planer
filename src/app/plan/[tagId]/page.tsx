import Link from "next/link";
import { notFound } from "next/navigation";
import { KpiLeiste } from "@/components/Kpi";
import { PlanKarten, Zeittabelle, planKpis } from "@/components/PlanAnsicht";
import { Seitenkopf } from "@/components/Seitenkopf";
import { Symbol } from "@/components/Symbole";
import { brauchtAnmeldung, istPlanung } from "@/lib/auth";
import { ladeFaelle, ladePersonen, ladePlan, ladePlanungsEingabe, ladeTermin, ladeVerlauf } from "@/lib/daten";
import { fallInfos, namensListe } from "@/lib/fallinfo";
import { zeitstempel } from "@/lib/zeit-server";
import { datumLang } from "@/planung";
import { PlanEditor } from "./PlanEditor";

export const metadata = { title: "Plan" };

export default async function PlanTagSeite({ params }: { params: Promise<{ tagId: string }> }) {
  const konto = await brauchtAnmeldung();
  const { tagId } = await params;
  if (!/^[0-9a-f-]{36}$/.test(tagId)) notFound();
  const tag = await ladeTermin(konto.teamId, tagId);
  if (!tag) notFound();
  const planung = istPlanung(konto);
  const [plan, personen, alleFaelle] = await Promise.all([
    ladePlan(konto.teamId, tagId),
    ladePersonen(konto.teamId),
    ladeFaelle(konto.teamId, false),
  ]);
  const faelle = fallInfos(alleFaelle, personen);
  const namen = namensListe(personen);
  const raeume = [tag.raum1, tag.raum2];
  const titel = `Fachkonferenz am ${datumLang(tag.datum)}`;
  const status = plan?.status ?? null;

  const statusAbzeichen =
    status === "VEROEFFENTLICHT" ? <span className="abzeichen veroeffentlicht">Veröffentlicht</span>
    : status === "ENTWURF" ? <span className="abzeichen entwurf">{planung ? "Entwurf – noch nicht sichtbar für das Team" : "In Planung"}</span>
    : <span className="abzeichen leer">Noch kein Plan</span>;
  const kopf = (
    <Seitenkopf
      titel={titel}
      zurueck={{ href: "/plan", text: "Alle Termine" }}
      unterzeile={<>Beginn {tag.beginn} Uhr{tag.ende ? `, geplantes Ende ${tag.ende} Uhr` : ""} · {statusAbzeichen}</>}
    >
      {status === "VEROEFFENTLICHT" && (
        <>
          <a className="knopf zweitrangig" href={`/export/plan/${tagId}/pdf`}><Symbol name="download" /> PDF</a>
          <a className="knopf zweitrangig" href={`/export/plan/${tagId}/ics`}><Symbol name="plan" /> Meine Termine (.ics)</a>
          {planung && <a className="knopf zweitrangig" href={`/export/plan/${tagId}/ics?alle=1`}><Symbol name="plan" /> Alle Gruppen (.ics)</a>}
        </>
      )}
    </Seitenkopf>
  );

  if (!planung) {
    return (
      <>
        {kopf}
        {status !== "VEROEFFENTLICHT" || !plan ? (
          <div className="meldung info"><p>Der Plan für diesen Termin ist noch nicht veröffentlicht.</p></div>
        ) : (
          <>
            <KpiLeiste titel="Kennzahlen dieses Plans" eintraege={planKpis(plan.entwurf, tag.ende)} />
            <div className="meldung info"><p>{plan.entwurf.gruppenBegruendung}</p></div>
            <Zeittabelle entwurf={plan.entwurf} faelle={faelle} namen={namen} eigenePersonId={konto.personId} />
            <PlanKarten entwurf={plan.entwurf} faelle={faelle} namen={namen} raeume={raeume} eigenePersonId={konto.personId} />
          </>
        )}
      </>
    );
  }

  const [eingabe, verlauf] = await Promise.all([ladePlanungsEingabe(konto.teamId, tagId), ladeVerlauf(konto.teamId, tagId)]);
  if (!eingabe) notFound();
  return (
    <>
      {kopf}
      <PlanEditor
        key={plan ? `${plan.id}-${plan.version}-${plan.status}` : "leer"}
        tagId={tagId}
        eingabe={eingabe}
        plan={plan?.entwurf ?? null}
        status={status}
        faelle={faelle}
        namen={namen}
        raeume={raeume}
      />
      {verlauf.length > 0 && (
        <section aria-labelledby="verlauf-titel">
          <h2 id="verlauf-titel" className="abschnitt-titel">Änderungsverlauf</h2>
          <ol className="karte" style={{ paddingLeft: "2.5rem" }}>
            {verlauf.map((v) => (
              <li key={v.id} style={{ marginBottom: "0.75rem" }}>
                <strong>{zeitstempel(v.zeitpunkt)}</strong>
                {v.vorname && <> · {v.vorname} {v.nachname}</>}
                <br />
                {v.beschreibung}
              </li>
            ))}
          </ol>
        </section>
      )}
    </>
  );
}
