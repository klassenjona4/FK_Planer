import Link from "next/link";
import { eq } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { brauchtAnmeldung, istPlanung } from "@/lib/auth";
import { ladeEigeneTermine, ladeFaelle, ladeTermine } from "@/lib/daten";
import { heute } from "@/lib/zeit-server";
import { datumLang, wunschPasst } from "@/planung";

export default async function Startseite({ searchParams }: { searchParams: Promise<{ fehler?: string }> }) {
  const konto = await brauchtAnmeldung();
  const sp = await searchParams;
  const h = heute();
  const [termine, eigene] = await Promise.all([ladeTermine(konto.teamId), ladeEigeneTermine(konto.teamId, konto.personId, h)]);
  const naechster = termine.find((t) => t.datum >= h);
  const naechsteEigene = eigene.slice(0, 3);
  const vorname = konto.name.split(" ")[0];

  let planungInfo: { anzahl: number; status: string | null } | null = null;
  if (istPlanung(konto) && naechster) {
    const [faelle, plaene] = await Promise.all([
      ladeFaelle(konto.teamId),
      db.select({ status: s.plan.status }).from(s.plan).where(eq(s.plan.konferenztagId, naechster.id)),
    ]);
    planungInfo = { anzahl: faelle.filter((f) => wunschPasst(f, naechster.datum)).length, status: plaene[0]?.status ?? null };
  }

  return (
    <>
      {sp.fehler === "keine-berechtigung" && (
        <div className="meldung fehler" role="alert"><p>Für diese Seite fehlt Ihnen die Berechtigung. Sie ist der Planung vorbehalten.</p></div>
      )}
      <h1>Guten Tag, {vorname}!</h1>

      {naechster && (
        <div className="meldung info">
          <p>
            Nächste Fachkonferenz: <strong>{datumLang(naechster.datum)}</strong>, ab {naechster.beginn} Uhr.
            <br />
            Fälle bitte eintragen bis{" "}
            <strong>
              {new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }).format(naechster.frist)} Uhr
            </strong>.
          </p>
        </div>
      )}

      {planungInfo && naechster && (
        <div className="karte">
          <h2 style={{ marginTop: 0 }}>Für die Planung</h2>
          <p>
            Für den {datumLang(naechster.datum)} sind <strong>{planungInfo.anzahl}</strong> {planungInfo.anzahl === 1 ? "Fall" : "Fälle"} eingetragen.
            Stand des Plans: <strong>{planungInfo.status === "VEROEFFENTLICHT" ? "veröffentlicht" : planungInfo.status === "ENTWURF" ? "Entwurf" : "noch nicht erzeugt"}</strong>.
          </p>
          <Link className="knopf" href={`/plan/${naechster.id}`}>Zum Plan dieses Termins</Link>
        </div>
      )}

      <h2>Was möchten Sie tun?</h2>
      <div className="raster">
        <Link className="kachel" href="/fall-eintragen"><strong>Fall eintragen</strong>Einen Fall für die Fachkonferenz anmelden.</Link>
        <Link className="kachel" href="/meine-termine"><strong>Meine Termine</strong>Wann und in welcher Gruppe Sie dabei sind.</Link>
        <Link className="kachel" href="/abwesenheiten"><strong>Abwesenheit eintragen</strong>Urlaub, Fortbildung oder andere Abwesenheiten.</Link>
        <Link className="kachel" href="/plan"><strong>Plan ansehen</strong>Alle Konferenztage mit Gruppen und Uhrzeiten.</Link>
      </div>

      <h2>Ihre nächsten Termine</h2>
      {naechsteEigene.length === 0 ? (
        <p>Zurzeit sind Sie in keinem veröffentlichten Plan eingeplant.</p>
      ) : (
        <ul>
          {naechsteEigene.map((t) => (
            <li key={`${t.tagId}-${t.gruppe}`}>
              <Link href={`/plan/${t.tagId}`}>{datumLang(t.datum)}</Link>, {t.beginn} bis {t.ende} Uhr
              {t.gruppenAnzahl > 1 ? `, Gruppe ${t.gruppe}` : ""}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
