import Link from "next/link";
import { ART_TEXT } from "@/components/PlanAnsicht";
import { brauchtAnmeldung } from "@/lib/auth";
import { ladeEigeneTermine } from "@/lib/daten";
import { heute } from "@/lib/zeit-server";
import { datumLang } from "@/planung";

export const metadata = { title: "Meine Termine" };

export default async function MeineTermineSeite() {
  const konto = await brauchtAnmeldung();
  const termine = await ladeEigeneTermine(konto.teamId, konto.personId, heute());
  return (
    <>
      <h1>Meine Termine</h1>
      <p>Hier stehen alle veröffentlichten Fachkonferenzen, an denen Sie teilnehmen.</p>
      {termine.length > 0 && (
        <div className="knopfleiste">
          <a className="knopf" href="/export/meine-termine/ics">Alle meine Termine in Outlook übernehmen (.ics)</a>
        </div>
      )}
      {termine.length === 0 ? (
        <div className="meldung info"><p>Zurzeit sind Sie in keinem veröffentlichten Plan eingeplant.</p></div>
      ) : (
        termine.map((t) => (
          <section key={`${t.tagId}-${t.gruppe}`} className="karte" aria-labelledby={`t-${t.tagId}`}>
            <h2 id={`t-${t.tagId}`} style={{ marginTop: 0 }}>{datumLang(t.datum)}</h2>
            <dl className="angaben">
              <dt>Uhrzeit</dt><dd>{t.beginn} bis {t.ende} Uhr</dd>
              {t.gruppenAnzahl > 1 && (<><dt>Gruppe</dt><dd>Gruppe {t.gruppe}</dd></>)}
              {t.raum && (<><dt>Raum</dt><dd>{t.raum}</dd></>)}
              <dt>Ihre Rolle</dt><dd>{ART_TEXT[t.art as keyof typeof ART_TEXT]}</dd>
              <dt>Warum Sie dabei sind</dt><dd>{t.begruendung}</dd>
              <dt>Fälle</dt>
              <dd>
                <ul style={{ margin: 0, paddingLeft: "1.2rem" }}>
                  {t.faelle.map((f) => (
                    <li key={f.kuerzel + f.beginn}>{f.beginn}–{f.ende} Uhr: {f.kuerzel}{f.eigener && <strong> (Ihr Fall)</strong>}</li>
                  ))}
                </ul>
              </dd>
            </dl>
            <p style={{ marginTop: "1rem", marginBottom: 0 }}><Link href={`/plan/${t.tagId}`}>Ganzen Plan ansehen</Link></p>
          </section>
        ))
      )}
    </>
  );
}
