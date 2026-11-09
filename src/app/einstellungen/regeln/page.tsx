import { brauchtPlanung } from "@/lib/auth";
import { Seitenkopf } from "@/components/Seitenkopf";
import { ladeEinstellungen } from "@/lib/daten";
import { regelnSpeichernAktion } from "../aktionen";
import { RegelnFormular } from "../Formulare";

export const metadata = { title: "Regeln" };

export default async function RegelnSeite() {
  const konto = await brauchtPlanung();
  const e = await ladeEinstellungen(konto.teamId);
  return (
    <>
      <Seitenkopf titel="Regeln für die Planung" zurueck={{ href: "/einstellungen", text: "Einstellungen" }} />
      <RegelnFormular aktion={regelnSpeichernAktion} werte={e} />
    </>
  );
}
