import Link from "next/link";
import { brauchtPlanung } from "@/lib/auth";

export const metadata = { title: "Einstellungen" };

export default async function EinstellungenSeite() {
  await brauchtPlanung();
  return (
    <>
      <h1>Einstellungen</h1>
      <div className="raster">
        <Link className="kachel" href="/einstellungen/personen"><strong>Personen</strong>Teammitglieder, Stellenumfang, Vorgesetzte und Zugänge.</Link>
        <Link className="kachel" href="/einstellungen/termine"><strong>Termine</strong>Dienstage anlegen, Uhrzeiten und Räume festlegen.</Link>
        <Link className="kachel" href="/einstellungen/regeln"><strong>Regeln</strong>Mindestzahl, Aufteilung, Fristen und Fairnesszeitraum.</Link>
      </div>
    </>
  );
}
