import { FallFormular } from "@/components/FallFormular";
import { brauchtAnmeldung, istPlanung } from "@/lib/auth";
import { terminAuswahl } from "@/lib/ansicht";
import { ladePersonen, ladeTermine } from "@/lib/daten";
import { personName } from "@/planung";
import { fallEintragenAktion } from "./aktionen";

export const metadata = { title: "Fall eintragen" };

export default async function FallEintragenSeite() {
  const konto = await brauchtAnmeldung();
  const [personen, termine] = await Promise.all([ladePersonen(konto.teamId), ladeTermine(konto.teamId)]);
  const auswahl = terminAuswahl(termine);
  return (
    <>
      <h1>Fall für die Fachkonferenz eintragen</h1>
      {auswahl.length === 0 ? (
        <div className="meldung warnung"><p>Es sind noch keine kommenden Konferenztermine angelegt. Bitte wenden Sie sich an die Planung.</p></div>
      ) : (
        <FallFormular
          aktion={fallEintragenAktion}
          personen={personen.map((p) => ({ id: p.id, name: personName(p), istVorgesetzt: p.istVorgesetzt }))}
          termine={auswahl}
          istPlanung={istPlanung(konto)}
          eigenePersonId={konto.personId}
          eigenerName={konto.name}
          knopfText="Fall eintragen"
        />
      )}
    </>
  );
}
