import Link from "next/link";
import { Seitenkopf } from "@/components/Seitenkopf";
import { brauchtPlanung } from "@/lib/auth";
import { Symbol } from "@/components/Symbole";

export const metadata = { title: "Einstellungen" };

export default async function EinstellungenSeite() {
  await brauchtPlanung();
  return (
    <>
      <Seitenkopf titel="Einstellungen" unterzeile="Personen, Termine und Regeln für die Planung." />
      <div className="raster">
        <Link className="kachel" href="/einstellungen/personen"><span className="kpi-symbol"><Symbol name="personen" /></span><span><strong>Personen</strong>Teammitglieder, Stellenumfang, Vorgesetzte und Zugänge.</span></Link>
        <Link className="kachel" href="/einstellungen/termine"><span className="kpi-symbol"><Symbol name="plan" /></span><span><strong>Termine</strong>Dienstage anlegen, Uhrzeiten und Räume festlegen.</span></Link>
        <Link className="kachel" href="/einstellungen/regeln"><span className="kpi-symbol"><Symbol name="einstellungen" /></span><span><strong>Regeln</strong>Mindestzahl, Aufteilung, Fristen und Fairnesszeitraum.</span></Link>
      </div>
    </>
  );
}
