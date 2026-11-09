import type { ReactNode } from "react";
import { Symbol } from "./Symbole";

export interface KpiEintrag {
  titel: string;
  wert: ReactNode;
  zusatz?: ReactNode;
  symbol: string;
  abzeichen?: { text: string; art: "ok" | "warnung" | "fehler" | "leer" };
}

/** Kennzahlen-Leiste wie im Dashboard: Symbol, Titel, großer Wert, Status-Abzeichen. */
export function KpiLeiste({ eintraege, titel }: { eintraege: KpiEintrag[]; titel: string }) {
  return (
    <section className="kpi-leiste" aria-label={titel}>
      {eintraege.map((e) => (
        <div className="kpi" key={e.titel}>
          <span className="kpi-symbol"><Symbol name={e.symbol} /></span>
          <div className="kpi-text">
            <p className="kpi-titel">{e.titel}</p>
            <div className="kpi-zeile">
              <span className="kpi-wert">{e.wert}{e.zusatz && <small> {e.zusatz}</small>}</span>
              {e.abzeichen && <span className={`abzeichen ${e.abzeichen.art}`}>{e.abzeichen.text}</span>}
            </div>
          </div>
        </div>
      ))}
    </section>
  );
}
