import type { PlanEntwurf, TeilnahmeArt } from "@/planung";
import { gruppenSpanne } from "@/planung/pruefen";
import { zuMinuten, zuUhrzeit } from "@/planung/zeit";
import { Avatar } from "./Avatar";
import type { KpiEintrag } from "./Kpi";
import { Symbol } from "./Symbole";

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

export function gruppenTitel(plan: PlanEntwurf, nummer: number): string {
  return plan.gruppen.length > 1 ? `Gruppe ${nummer}` : "Konferenz";
}

export function spannenText(plan: PlanEntwurf, nummer: number): string {
  const g = plan.gruppen.find((x) => x.nummer === nummer);
  const s = g ? gruppenSpanne(g) : null;
  return s ? `${zuUhrzeit(s.von)}–${zuUhrzeit(s.bis)}` : "";
}

/** Kennzahlen eines Konferenztags (für Planung live, für alle beim Ansehen). */
export function planKpis(plan: PlanEntwurf, tagEnde: string | null, verstoesse?: number): KpiEintrag[] {
  const eingeplant = plan.gruppen.reduce((s, g) => s + g.punkte.length, 0);
  const offen = plan.nichtEingeplant.length;
  const enden = plan.gruppen.map((g) => gruppenSpanne(g)?.bis).filter((x): x is number => x !== undefined);
  const ende = enden.length ? Math.max(...enden) : null;
  const personen = plan.gruppen.reduce((s, g) => s + g.teilnehmende.length, 0);
  const aufgefuellt = plan.gruppen.reduce((s, g) => s + g.teilnehmende.filter((t) => t.art === "AUFGEFUELLT").length, 0);
  const kpis: KpiEintrag[] = [
    {
      titel: "Fälle im Plan", wert: eingeplant, zusatz: `von ${eingeplant + offen}`, symbol: "faelle",
      abzeichen: offen ? { text: `${offen} nicht eingeplant`, art: "warnung" } : { text: "alle eingeplant", art: "ok" },
    },
    {
      titel: "Ende der Konferenz", wert: ende === null ? "–" : zuUhrzeit(ende), zusatz: ende === null ? undefined : "Uhr", symbol: "uhr",
      abzeichen: ende !== null && tagEnde && ende > zuMinuten(tagEnde)
        ? { text: `nach ${tagEnde} Uhr`, art: "fehler" }
        : { text: plan.gruppen.length === 2 ? "2 Gruppen" : "1 Gruppe", art: "leer" },
    },
  ];
  if (verstoesse !== undefined) {
    kpis.push({
      titel: "Regelverstöße", wert: verstoesse, symbol: "warnung",
      abzeichen: verstoesse ? { text: "beheben", art: "fehler" } : { text: "alles eingehalten", art: "ok" },
    });
  }
  kpis.push({
    titel: "Teilnehmende", wert: personen, zusatz: personen === 1 ? "Person" : "Personen", symbol: "personen",
    abzeichen: { text: `${aufgefuellt} aufgefüllt`, art: "leer" },
  });
  return kpis;
}

const PX_PRO_MINUTE = 2;

/** Grafische Zeittabelle (nur Desktop). Die gleichen Inhalte stehen barrierefrei in den Spalten darunter. */
export function Zeittabelle({ entwurf, faelle, eigenePersonId }: AnsichtDaten) {
  const punkte = entwurf.gruppen.flatMap((g) => g.punkte);
  if (punkte.length === 0) return null;
  const start = Math.min(...punkte.map((p) => zuMinuten(p.beginn)));
  const ende = Math.max(...punkte.map((p) => zuMinuten(p.ende)));
  const marken: number[] = [];
  for (let m = Math.ceil(start / 30) * 30; m <= ende; m += 30) marken.push(m);
  const hoehe = (ende - start) * PX_PRO_MINUTE;

  return (
    <div className="karte zeittabelle-karte" aria-hidden="true">
      <div className="zeittabelle" style={{ ["--gruppen" as string]: entwurf.gruppen.length }}>
        <div />
        {entwurf.gruppen.map((g) => (
          <div key={g.nummer} className={`spalte-kopf gruppe-${g.nummer}`}>{gruppenTitel(entwurf, g.nummer)}</div>
        ))}
        <div className="zeitachse" style={{ height: hoehe }}>
          {marken.map((m) => <span key={m} style={{ top: (m - start) * PX_PRO_MINUTE }}>{zuUhrzeit(m)}</span>)}
        </div>
        {entwurf.gruppen.map((g) => (
          <div key={g.nummer} className={`spalte gruppe-${g.nummer}`}>
            <div className="spalte-flaeche" style={{ height: hoehe }}>
              {g.punkte.map((p) => {
                const f = faelle[p.fallId];
                const oben = (zuMinuten(p.beginn) - start) * PX_PRO_MINUTE;
                const h = Math.max(28, (zuMinuten(p.ende) - zuMinuten(p.beginn)) * PX_PRO_MINUTE - 4);
                const eigener = eigenePersonId && f?.verantwortlichId === eigenePersonId;
                return (
                  <div key={p.fallId} className={`block${eigener ? " eigener" : ""}`} style={{ top: oben, height: h }}>
                    <strong>{p.beginn}–{p.ende}</strong> · {f?.kuerzel ?? "?"}{f?.dringend ? " · dringend" : ""}
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

/** Teilnehmendenliste einer Gruppe (Ansicht). */
export function TeilnehmendeListe({ teilnehmende, namen, eigenePersonId, zeigeGruende = true }: {
  teilnehmende: PlanEntwurf["gruppen"][number]["teilnehmende"]; namen: Record<string, string>; eigenePersonId?: string; zeigeGruende?: boolean;
}) {
  return (
    <ul className="teilnehmende">
      {teilnehmende.map((t) => (
        <li key={t.personId}>
          <div className="zeile">
            <Avatar name={namen[t.personId] ?? "?"} groesse="klein" />
            <span>
              <strong>{namen[t.personId] ?? "Unbekannt"}</strong>{" "}
              {t.personId === eigenePersonId && <span className="abzeichen ok">Sie</span>}
              <span className="art" style={{ display: "block" }}>{ART_TEXT[t.art]}</span>
            </span>
          </div>
          {zeigeGruende && <span className="grund">{t.begruendung}</span>}
        </li>
      ))}
    </ul>
  );
}

/** Vollständige, barrierearme Darstellung je Gruppe als Board-Spalten. */
export function PlanKarten({ entwurf, faelle, namen, raeume, eigenePersonId, zeigeGruende = true }: AnsichtDaten & { zeigeGruende?: boolean }) {
  return (
    <div className="board">
      {entwurf.gruppen.map((g) => {
        const raum = raeume?.[g.nummer - 1];
        const titel = gruppenTitel(entwurf, g.nummer);
        return (
          <section key={g.nummer} className={`board-spalte gruppe-${g.nummer}`} aria-labelledby={`gruppe-${g.nummer}-titel`}>
            <div className="spalten-kopf">
              <h3 id={`gruppe-${g.nummer}-titel`}>{titel}</h3>
              <span className="anzahl"><span className="nur-sr">Fälle: </span>{g.punkte.length}</span>
              <span className="hinweis">{spannenText(entwurf, g.nummer)} Uhr{raum ? ` · ${raum}` : ""}</span>
            </div>
            <div className="spalten-inhalt">
              {g.punkte.map((p) => {
                const f = faelle[p.fallId];
                const eigener = eigenePersonId && f?.verantwortlichId === eigenePersonId;
                return (
                  <article key={p.fallId} className="fallkarte" aria-label={`Fall ${f?.kuerzel ?? ""}, ${p.beginn} bis ${p.ende} Uhr`}>
                    <div className="fallkarte-kopf">
                      <Avatar name={f?.verantwortlich ?? "?"} />
                      <div className="fallkarte-titel">
                        <strong>{f?.kuerzel ?? "gelöscht"}</strong>
                        <span className="unter">{f?.verantwortlich ?? "–"}</span>
                      </div>
                      {f?.dringend && <span className="abzeichen dringend">dringend</span>}
                    </div>
                    <div className="fallkarte-meta">
                      <span className="abzeichen"><Symbol name="uhr" /> {p.beginn}–{p.ende}</span>
                      <span>{f?.dauer} Min.</span>
                      {eigener && <span className="abzeichen ok">Ihr Fall</span>}
                    </div>
                  </article>
                );
              })}
              <div className="fallkarte">
                <h4 style={{ marginTop: 0 }}>Teilnehmende ({g.teilnehmende.length})</h4>
                <TeilnehmendeListe teilnehmende={g.teilnehmende} namen={namen} eigenePersonId={eigenePersonId} zeigeGruende={zeigeGruende} />
              </div>
            </div>
          </section>
        );
      })}
    </div>
  );
}
