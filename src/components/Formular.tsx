/** Gemeinsame Bausteine für gut lesbare, barrierearme Formulare. */

export interface FormZustand {
  fehler?: Record<string, string>;
  meldung?: string;
  erfolg?: string;
  /** Zähler, damit Formulare nach Erfolg neu aufgebaut (geleert) werden können */
  runde?: number;
}

export function FehlerZusammenfassung({ zustand }: { zustand: FormZustand }) {
  const fehler = Object.entries(zustand.fehler ?? {});
  if (!zustand.meldung && fehler.length === 0) return null;
  return (
    <div className="meldung fehler" role="alert" tabIndex={-1}>
      <p><strong>{zustand.meldung ?? "Bitte prüfen Sie Ihre Eingaben:"}</strong></p>
      {fehler.length > 0 && (
        <ul>
          {fehler.map(([feld, text]) => (
            <li key={feld}><a href={`#${feld}`}>{text}</a></li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function Erfolg({ zustand }: { zustand: FormZustand }) {
  if (!zustand.erfolg) return null;
  return (
    <div className="meldung erfolg" role="status">
      <p><strong>{zustand.erfolg}</strong></p>
    </div>
  );
}

export function Feldfehler({ id, zustand }: { id: string; zustand: FormZustand }) {
  const text = zustand.fehler?.[id];
  if (!text) return null;
  return <p className="feldfehler" id={`${id}-fehler`}>{text}</p>;
}

/** aria-Attribute für ein Eingabefeld mit optionalem Hilfetext */
export function feldAttribute(id: string, zustand: FormZustand, mitHilfe = false) {
  const beschreibung = [mitHilfe ? `${id}-hilfe` : null, zustand.fehler?.[id] ? `${id}-fehler` : null].filter(Boolean).join(" ");
  return {
    id,
    name: id,
    "aria-invalid": zustand.fehler?.[id] ? (true as const) : undefined,
    "aria-describedby": beschreibung || undefined,
  };
}
