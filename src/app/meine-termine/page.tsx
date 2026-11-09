import Link from "next/link";
import { Avatar } from "@/components/Avatar";
import { ART_TEXT } from "@/components/PlanAnsicht";
import { Seitenkopf } from "@/components/Seitenkopf";
import { Symbol } from "@/components/Symbole";
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
      <Seitenkopf titel="Meine Termine" unterzeile="Alle veröffentlichten Fachkonferenzen, an denen Sie teilnehmen.">
        {termine.length > 0 && <a className="knopf gruen-knopf" href="/export/meine-termine/ics"><Symbol name="download" /> Alle in Outlook übernehmen (.ics)</a>}
      </Seitenkopf>
      {termine.length === 0 ? (
        <div className="karte"><p className="leise">Zurzeit sind Sie in keinem veröffentlichten Plan eingeplant.</p></div>
      ) : (
        <div className="raster">
          {termine.map((t) => (
            <article key={`${t.tagId}-${t.gruppe}`} className="fallkarte" aria-labelledby={`t-${t.tagId}`}>
              <div className="fallkarte-kopf">
                <span className="kpi-symbol" style={{ width: 40, height: 40, borderRadius: 11 }}><Symbol name="plan" /></span>
                <div className="fallkarte-titel">
                  <strong id={`t-${t.tagId}`}>{datumLang(t.datum)}</strong>
                  <span className="unter">{t.raum ?? "Raum noch offen"}</span>
                </div>
              </div>
              <div className="fallkarte-meta">
                <span className="abzeichen"><Symbol name="uhr" /> {t.beginn}–{t.ende}</span>
                {t.gruppenAnzahl > 1 && <span className="abzeichen dunkel">Gruppe {t.gruppe}</span>}
                <span className={`abzeichen ${t.art === "EIGENER_FALL" ? "ok" : t.art === "AUFGEFUELLT" ? "warnung" : ""}`}>{ART_TEXT[t.art as keyof typeof ART_TEXT]}</span>
              </div>
              <div className="notiz" style={{ background: "var(--flaeche-leise)", color: "var(--text)" }}>
                <Symbol name="info" /><span><span className="nur-sr">Warum Sie dabei sind: </span>{t.begruendung}</span>
              </div>
              <h3 className="nur-sr">Fälle</h3>
              <ul className="teilnehmende" style={{ marginTop: "0.5rem" }}>
                {t.faelle.map((f) => (
                  <li key={f.kuerzel + f.beginn}>
                    <div className="zeile">
                      {f.eigener ? <Avatar name={konto.name} groesse="klein" /> : <span className="avatar avatar-klein" style={{ background: "#59615b" }} aria-hidden="true">FK</span>}
                      <span><strong>{f.kuerzel}</strong>{f.eigener && <> <span className="abzeichen ok">Ihr Fall</span></>}</span>
                      <span className="leise" style={{ flex: "none" }}>{f.beginn}–{f.ende}</span>
                    </div>
                  </li>
                ))}
              </ul>
              <div className="knopfleiste">
                <Link className="knopf zweitrangig klein breit" href={`/plan/${t.tagId}`}>Ganzen Plan ansehen</Link>
              </div>
            </article>
          ))}
        </div>
      )}
    </>
  );
}
