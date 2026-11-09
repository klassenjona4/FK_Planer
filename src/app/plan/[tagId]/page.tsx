import Link from "next/link";
import { notFound } from "next/navigation";
import { PlanKarten, Zeittabelle } from "@/components/PlanAnsicht";
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

  const kopf = (
    <>
      <p><Link href="/plan">← Alle Termine</Link></p>
      <h1>{titel}</h1>
      <p>
        Beginn {tag.beginn} Uhr{tag.ende ? `, geplantes Ende ${tag.ende} Uhr` : ""} ·{" "}
        {status === "VEROEFFENTLICHT" ? (
          <span className="abzeichen veroeffentlicht">Veröffentlicht</span>
        ) : status === "ENTWURF" ? (
          <span className="abzeichen entwurf">Entwurf – noch nicht sichtbar für das Team</span>
        ) : (
          <span className="abzeichen leer">Noch kein Plan</span>
        )}
      </p>
      {status === "VEROEFFENTLICHT" && (
        <div className="knopfleiste">
          <a className="knopf zweitrangig" href={`/export/plan/${tagId}/pdf`}>Als PDF herunterladen</a>
          <a className="knopf zweitrangig" href={`/export/plan/${tagId}/ics`}>Meine Termine dieses Tages für Outlook (.ics)</a>
          {planung && <a className="knopf zweitrangig" href={`/export/plan/${tagId}/ics?alle=1`}>Alle Gruppen für Outlook (.ics)</a>}
        </div>
      )}
    </>
  );

  if (!planung) {
    return (
      <>
        {kopf}
        {status !== "VEROEFFENTLICHT" || !plan ? (
          <div className="meldung info"><p>Der Plan für diesen Termin ist noch nicht veröffentlicht.</p></div>
        ) : (
          <>
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
          <h2 id="verlauf-titel">Änderungsverlauf</h2>
          <ol className="karte">
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
