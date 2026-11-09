import type { Abwesenheit, Datum, Person } from "./typen";
import { ueberschneiden, zuMinuten, zuUhrzeit } from "./zeit";

const TAG_ENDE = 24 * 60;

export function personName(p: Pick<Person, "vorname" | "nachname">): string {
  return `${p.vorname} ${p.nachname}`;
}

export function istAktiv(p: Person, datum: Datum): boolean {
  if (p.aktivVon && datum < p.aktivVon) return false;
  if (p.aktivBis && datum > p.aktivBis) return false;
  return true;
}

/** Abwesenheitszeiträume einer Person an einem Tag in Minuten [von, bis). */
export function abwesenheitsIntervalle(
  personId: string,
  datum: Datum,
  abwesenheiten: Abwesenheit[],
): Array<[number, number]> {
  const ergebnis: Array<[number, number]> = [];
  for (const a of abwesenheiten) {
    if (a.personId !== personId) continue;
    if (datum < a.vonDatum || datum > a.bisDatum) continue;
    const von = datum === a.vonDatum && a.vonUhrzeit ? zuMinuten(a.vonUhrzeit) : 0;
    const bis = datum === a.bisDatum && a.bisUhrzeit ? zuMinuten(a.bisUhrzeit) : TAG_ENDE;
    if (bis > von) ergebnis.push([von, bis]);
  }
  return ergebnis.sort((x, y) => x[0] - y[0] || x[1] - y[1]);
}

/** Ist die Person im Zeitraum [von, bis) (Minuten) am Datum anwesend und aktiv? */
export function istVerfuegbar(
  p: Person,
  datum: Datum,
  von: number,
  bis: number,
  abwesenheiten: Abwesenheit[],
): boolean {
  if (!istAktiv(p, datum)) return false;
  return !abwesenheitsIntervalle(p.id, datum, abwesenheiten).some(([a, b]) =>
    ueberschneiden(von, bis, a, b),
  );
}

/** Ist die Person am Tag ganztägig abwesend oder nicht aktiv? */
export function istGanztaegigWeg(p: Person, datum: Datum, abwesenheiten: Abwesenheit[]): boolean {
  if (!istAktiv(p, datum)) return true;
  return abwesenheitsIntervalle(p.id, datum, abwesenheiten).some(([a, b]) => a <= 0 && b >= TAG_ENDE);
}

/** Verständliche Beschreibung, warum eine Person im Zeitraum nicht verfügbar ist. */
export function abwesenheitsText(
  p: Person,
  datum: Datum,
  von: number,
  bis: number,
  abwesenheiten: Abwesenheit[],
): string {
  const name = personName(p);
  if (!istAktiv(p, datum)) return `${name} ist an diesem Tag nicht im Team aktiv`;
  const iv = abwesenheitsIntervalle(p.id, datum, abwesenheiten).filter(([a, b]) =>
    ueberschneiden(von, bis, a, b),
  );
  if (iv.some(([a, b]) => a <= 0 && b >= TAG_ENDE)) return `${name} ist an diesem Tag abwesend`;
  const [a, b] = iv[0] ?? [0, TAG_ENDE];
  if (a <= 0) return `${name} ist erst ab ${zuUhrzeit(b)} Uhr da`;
  if (b >= TAG_ENDE) return `${name} ist nur bis ${zuUhrzeit(a)} Uhr da`;
  return `${name} ist von ${zuUhrzeit(a)} bis ${zuUhrzeit(b)} Uhr nicht da`;
}
