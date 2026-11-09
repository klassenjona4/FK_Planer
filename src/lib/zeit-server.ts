/** Heutiges Datum in Europe/Berlin als "JJJJ-MM-TT". */
export function heute(): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" }).format(new Date());
}

/** Aktuelle Uhrzeit-unabhängige Formatierung eines Zeitstempels in Berliner Ortszeit. */
export function zeitstempel(d: Date): string {
  return new Intl.DateTimeFormat("de-DE", {
    timeZone: "Europe/Berlin",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d) + " Uhr";
}

/**
 * Zeitpunkt (UTC) für ein Datum und eine Uhrzeit in Berliner Ortszeit.
 * Berücksichtigt Sommer- und Winterzeit.
 */
export function berlinZuDate(datum: string, uhrzeit: string): Date {
  const [j, m, t] = datum.split("-").map(Number) as [number, number, number];
  const [h, min] = uhrzeit.split(":").map(Number) as [number, number];
  const alsUtc = Date.UTC(j, m - 1, t, h, min);
  // Versatz Berlin ↔ UTC zu diesem Zeitpunkt bestimmen
  const teile = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Berlin",
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(new Date(alsUtc));
  const wert = (typ: string) => Number(teile.find((p) => p.type === typ)?.value);
  const berlinAlsUtc = Date.UTC(wert("year"), wert("month") - 1, wert("day"), wert("hour"), wert("minute"));
  return new Date(alsUtc - (berlinAlsUtc - alsUtc));
}
