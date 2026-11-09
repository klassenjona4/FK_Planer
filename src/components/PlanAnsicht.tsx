import type { PlanEntwurf, TeilnahmeArt } from "@/planung";
import { zuMinuten, zuUhrzeit } from "@/planung/zeit";

export interface FallInfo {
  kuerzel: string;
  dauer: number;
  verantwortlichId: string;
  verantwortlich: string;
  dringend: boolean;
  vorgesetzt: boolean;
}

export interface AnsichtDaten {
  entwurf: PlanEntwurf;
  faelle: Record<string, FallInfo>;
  namen: Record<string, string>;
  raeume?: Array<string | null>;
  /** Hervorhebung für „meine“ Termine */
  eigenePersonId?: string;
}

export const ART_TEXT: Record<TeilnahmeArt, string> = {
  EIGENER_FALL: "Eigener Fall",
  ERFORDERLICH: "Erforderlich",
  VORGESETZT: "Vorgesetzt",
  AUFGEFUELLT: "Aufgefüllt",
};

const PX_PRO_MINUTE = 2;

/** Grafische Zeittabelle (nur Desktop). Die gleichen Inhalte stehen barrierefrei in den Karten darunter. */
export function Zeittabelle({ entwurf, faelle, eigenePersonId }: AnsichtDaten) {
  const punkte = entwurf.gruppen.flatMap((g) => g.punkte);
  if (punkte.length === 0) return null;
  const start = Math.min(...punkte.map((p) => zuMinuten(p.beginn)));
  const ende = Math.max(...punkte.map((p) => zuMinuten(p.ende)));
  const ersteVolle = Math.ceil(start / 30) * 30;
  const marken: number[] = [];
  for (let m = ersteVolle; m <= ende; m += 30) marken.push(m);
  const hoehe = (ende - start) * PX_PRO_MINUTE;

  return (
    <div className="karte zeittabelle-karte" aria-hidden="true">
      <div className="zeittabelle" style={{ ["--gruppen" as string]: entwurf.gruppen.length }}>
        <div />
        {entwurf.gruppen.map((g) => (
          <div key={g.nummer} className={`spalte-kopf gruppe-${g.nummer}`}>
            <strong>{entwurf.gruppen.length > 1 ? `Gruppe ${g.nummer}` : "Konferenz"}</strong>
          </div>
        ))}
        <div className="zeitachse" style={{ height: hoehe }}>
          {marken.map((m) => (
            <span key={m} style={{ top: (m - start) * PX_PRO_MINUTE }}>{zuUhrzeit(m)}</span>
          ))}
        </div>
        {entwurf.gruppen.map((g) => (
          <div key={g.nummer} className={`spalte gruppe-${g.nummer}`}>
            <div className="spalte-flaeche" style={{ height: hoehe }}>
              {g.punkte.map((p) => {
                const f = faelle[p.fallId];
                const oben = (zuMinuten(p.beginn) - start) * PX_PRO_MINUTE;
                const h = Math.max(28, (zuMinuten(p.ende) - zuMinuten(p.beginn)) * PX_PRO_MINUTE - 3);
                const eigener = eigenePersonId && (f?.verantwortlichId === eigenePersonId);
                return (
                  <div key={p.fallId} className={`block${eigener ? " eigener" : ""}`} style={{ top: oben, height: h }}>
                    <strong>{p.beginn}–{p.ende}</strong> · {f?.kuerzel ?? "?"}
                    {f?.dringend ? " · dringend" : ""}
                    {h > 50 && <><br />{f?.verantwortlich}</>}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Vollständige, barrierearme Darstellung je Gruppe: Fälle, Teilnehmende und Gründe. */
export function PlanKarten({ entwurf, faelle, namen, raeume, eigenePersonId, zeigeGruende = true }: AnsichtDaten & { zeigeGruende?: boolean }) {
  return (
    <div className="gruppen-raster">
      {entwurf.gruppen.map((g) => {
        const zeiten = g.punkte.map((p) => [zuMinuten(p.beginn), zuMinuten(p.ende)] as const);
        const von = zeiten.length ? zuUhrzeit(Math.min(...zeiten.map((z) => z[0]))) : "";
        const bis = zeiten.length ? zuUhrzeit(Math.max(...zeiten.map((z) => z[1]))) : "";
        const raum = raeume?.[g.nummer - 1];
        return (
          <section key={g.nummer} className={`karte gruppen-karte gruppe-${g.nummer}`} aria-labelledby={`gruppe-${g.nummer}-titel`}>
            <h3 id={`gruppe-${g.nummer}-titel`}>
              {entwurf.gruppen.length > 1 ? `Gruppe ${g.nummer}` : "Konferenz"}
              {von && `: ${von} bis ${bis} Uhr`}
            </h3>
            {raum && <p className="leise">Raum: {raum}</p>}
            <h4 className="nur-sr">Fälle</h4>
            <table>
              <caption className="nur-sr">Fälle in {entwurf.gruppen.length > 1 ? `Gruppe ${g.nummer}` : "der Konferenz"}</caption>
              <thead>
                <tr><th scope="col">Uhrzeit</th><th scope="col">Fall</th><th scope="col">Verantwortlich</th></tr>
              </thead>
              <tbody>
                {g.punkte.map((p) => {
                  const f = faelle[p.fallId];
                  const eigener = eigenePersonId && f?.verantwortlichId === eigenePersonId;
                  return (
                    <tr key={p.fallId}>
                      <td>{p.beginn}–{p.ende}</td>
                      <td>
                        <strong>{f?.kuerzel ?? "gelöscht"}</strong>
                        {f?.dringend && <> <span className="abzeichen dringend">dringend</span></>}
                        {eigener && <> <span className="abzeichen veroeffentlicht">Ihr Fall</span></>}
                      </td>
                      <td>{f?.verantwortlich ?? "–"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <h4>Teilnehmende ({g.teilnehmende.length})</h4>
            <ul className="teilnehmende">
              {g.teilnehmende.map((t) => (
                <li key={t.personId}>
                  <strong>{namen[t.personId] ?? "Unbekannt"}</strong>{" "}
                  <span className="art">· {ART_TEXT[t.art]}</span>
                  {t.personId === eigenePersonId && <> <span className="abzeichen veroeffentlicht">Sie</span></>}
                  {zeigeGruende && <span className="grund">{t.begruendung}</span>}
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
