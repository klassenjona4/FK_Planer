import Link from "next/link";
import { brauchtPlanung } from "@/lib/auth";
import { ladeEinstellungen } from "@/lib/daten";
import { regelnSpeichernAktion } from "../aktionen";
import { RegelnFormular } from "../Formulare";

export const metadata = { title: "Regeln" };

export default async function RegelnSeite() {
  const konto = await brauchtPlanung();
  const e = await ladeEinstellungen(konto.teamId);
  return (
    <>
      <p><Link href="/einstellungen">← Einstellungen</Link></p>
      <h1>Regeln für die Planung</h1>
      <RegelnFormular aktion={regelnSpeichernAktion} werte={e} />
    </>
  );
}
