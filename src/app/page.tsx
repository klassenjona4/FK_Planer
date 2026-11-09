import Link from "next/link";
import { eq } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { Avatar } from "@/components/Avatar";
import { KpiLeiste, type KpiEintrag } from "@/components/Kpi";
import { Seitenkopf } from "@/components/Seitenkopf";
import { Symbol } from "@/components/Symbole";
import { ART_TEXT } from "@/components/PlanAnsicht";
import { brauchtAnmeldung, istPlanung } from "@/lib/auth";
import { ladeAbwesenheiten, ladeEigeneTermine, ladeEinstellungen, ladeFaelle, ladePersonen, ladeTermine } from "@/lib/daten";
import { heute } from "@/lib/zeit-server";
import { datumKurz, datumLang, istGanztaegigWeg, wunschPasst } from "@/planung";

const fristFormat = new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export default async function Startseite({ searchParams }: { searchParams: Promise<{ fehler?: string }> }) {
  const konto = await brauchtAnmeldung();
  const sp = await searchParams;
  const h = heute();
  const [termine, eigene, faelle, personen, abwesenheiten, einst] = await Promise.all([
    ladeTermine(konto.teamId),
    ladeEigeneTermine(konto.teamId, konto.personId, h),
    ladeFaelle(konto.teamId),
    ladePersonen(konto.teamId),
    ladeAbwesenheiten(konto.teamId),
    ladeEinstellungen(konto.teamId),
  ]);
  const naechster = termine.find((t) => t.datum >= h);
  const vorname = konto.name.split(" ")[0];

  let kpis: KpiEintrag[] = [];
  if (naechster) {
    const [plan] = await db.select({ status: s.plan.status }).from(s.plan).where(eq(s.plan.konferenztagId, naechster.id));
    const passend = faelle.filter((f) => wunschPasst(f, naechster.datum));
    const meine = passend.filter((f) => f.verantwortlichId === konto.personId);
    const da = personen.filter((p) => !istGanztaegigWeg(p, naechster.datum, abwesenheiten)).length;
    const aktiv = personen.filter((p) => !istGanztaegigWeg(p, naechster.datum, [])).length;
    const fristVorbei = new Date() > naechster.frist;
    kpis = [
      {
        titel: istPlanung(konto) ? "Eingetragene Fälle" : "Ihre eingetragenen Fälle",
        wert: istPlanung(konto) ? passend.length : meine.length,
        zusatz: istPlanung(konto) ? (passend.length === 1 ? "Fall" : "Fälle") : `von ${passend.length}`,
        symbol: "faelle",
        abzeichen: passend.some((f) => f.dringend) ? { text: `${passend.filter((f) => f.dringend).length} dringend`, art: "fehler" } : undefined,
      },
      {
        titel: "Eintragungsfrist",
        wert: fristFormat.format(naechster.frist),
        symbol: "frist",
        abzeichen: fristVorbei ? { text: "abgelaufen", art: "fehler" } : { text: "offen", art: "ok" },
      },
      {
        titel: "Stand des Plans",
        wert: plan?.status === "VEROEFFENTLICHT" ? "Veröffentlicht" : plan?.status === "ENTWURF" ? (istPlanung(konto) ? "Entwurf" : "In Planung") : "Offen",
        symbol: "plan",
        abzeichen: plan?.status === "VEROEFFENTLICHT" ? { text: "fertig", art: "ok" } : { text: "ausstehend", art: "warnung" },
      },
      {
        titel: "Personen anwesend",
        wert: da,
        zusatz: `von ${aktiv}`,
        symbol: "personen",
        abzeichen: da < einst.minTeilnehmende ? { text: "zu wenige", art: "fehler" } : { text: "beschlussfähig", art: "ok" },
      },
    ];
  }

  return (
    <>
      {sp.fehler === "keine-berechtigung" && (
        <div className="meldung fehler" role="alert"><p>Für diese Seite fehlt Ihnen die Berechtigung. Sie ist der Planung vorbehalten.</p></div>
      )}
      <Seitenkopf
        titel={`Guten Tag, ${vorname}!`}
        unterzeile={naechster ? <>Nächste Fachkonferenz: <strong>{datumLang(naechster.datum)}</strong>, ab {naechster.beginn} Uhr</> : "Es sind noch keine Konferenztermine angelegt."}
      >
        {naechster && <Link className="knopf zweitrangig" href={`/plan/${naechster.id}`}><Symbol name="plan" /> Zum Plan</Link>}
      </Seitenkopf>

      {naechster && <KpiLeiste titel={`Kennzahlen für den ${datumKurz(naechster.datum)}`} eintraege={kpis} />}

      <h2 className="abschnitt-titel">Schnellzugriff</h2>
      <div className="raster">
        <Link className="kachel hervor" href="/fall-eintragen">
          <span className="kpi-symbol"><Symbol name="plus" /></span>
          <span><strong>Fall eintragen</strong>Einen Fall für die Fachkonferenz anmelden.</span>
        </Link>
        <Link className="kachel" href="/meine-termine">
          <span className="kpi-symbol"><Symbol name="termine" /></span>
          <span><strong>Meine Termine</strong>Wann und in welcher Gruppe Sie dabei sind.</span>
        </Link>
        <Link className="kachel" href="/abwesenheiten">
          <span className="kpi-symbol"><Symbol name="abwesend" /></span>
          <span><strong>Abwesenheit eintragen</strong>Urlaub, Fortbildung und andere Abwesenheiten.</span>
        </Link>
        <Link className="kachel" href="/plan">
          <span className="kpi-symbol"><Symbol name="plan" /></span>
          <span><strong>Plan ansehen</strong>Alle Konferenztage mit Gruppen und Uhrzeiten.</span>
        </Link>
      </div>

      <h2 className="abschnitt-titel">Ihre nächsten Termine</h2>
      {eigene.length === 0 ? (
        <div className="karte"><p className="leise">Zurzeit sind Sie in keinem veröffentlichten Plan eingeplant.</p></div>
      ) : (
        <div className="raster">
          {eigene.slice(0, 3).map((t) => (
            <article key={`${t.tagId}-${t.gruppe}`} className="fallkarte">
              <div className="fallkarte-kopf">
                <Avatar name={konto.name} />
                <div className="fallkarte-titel">
                  <strong><Link href={`/plan/${t.tagId}`}>{datumLang(t.datum)}</Link></strong>
                  <span className="unter">{ART_TEXT[t.art as keyof typeof ART_TEXT]}</span>
                </div>
              </div>
              <div className="fallkarte-meta">
                <span className="abzeichen"><Symbol name="uhr" /> {t.beginn}–{t.ende}</span>
                {t.gruppenAnzahl > 1 && <span className="abzeichen">Gruppe {t.gruppe}</span>}
                {t.raum && <span>{t.raum}</span>}
              </div>
            </article>
          ))}
        </div>
      )}
    </>
  );
}
