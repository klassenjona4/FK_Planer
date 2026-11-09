import type { Datum, Uhrzeit } from "./typen";

/** "HH:MM" → Minuten seit Mitternacht */
export function zuMinuten(uhrzeit: Uhrzeit): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(uhrzeit);
  if (!m) throw new Error(`Ungültige Uhrzeit: ${uhrzeit}`);
  return Number(m[1]) * 60 + Number(m[2]);
}

/** Minuten seit Mitternacht → "HH:MM" */
export function zuUhrzeit(minuten: number): Uhrzeit {
  const h = Math.floor(minuten / 60);
  const m = minuten % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

const MONATE = [
  "Januar", "Februar", "März", "April", "Mai", "Juni",
  "Juli", "August", "September", "Oktober", "November", "Dezember",
];
const WOCHENTAGE = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"];

function teile(datum: Datum): [number, number, number] {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(datum);
  if (!m) throw new Error(`Ungültiges Datum: ${datum}`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

/** "2026-11-16" → "16. November" */
export function datumKurz(datum: Datum): string {
  const [, mo, t] = teile(datum);
  return `${t}. ${MONATE[mo - 1]}`;
}

/** "2026-11-16" → "Montag, 16. November 2026" */
export function datumLang(datum: Datum): string {
  const [j, mo, t] = teile(datum);
  return `${wochentag(datum)}, ${t}. ${MONATE[mo - 1]} ${j}`;
}

/** "2026-11-16" → "16.11.2026" */
export function datumZahl(datum: Datum): string {
  const [j, mo, t] = teile(datum);
  return `${String(t).padStart(2, "0")}.${String(mo).padStart(2, "0")}.${j}`;
}

export function wochentag(datum: Datum): string {
  const [j, mo, t] = teile(datum);
  return WOCHENTAGE[new Date(Date.UTC(j, mo - 1, t)).getUTCDay()]!;
}

/** Tage addieren (UTC-basiert, daher ohne Sommerzeitprobleme) */
export function plusTage(datum: Datum, tage: number): Datum {
  const [j, mo, t] = teile(datum);
  const d = new Date(Date.UTC(j, mo - 1, t + tage));
  return d.toISOString().slice(0, 10);
}

/** Überschneiden sich [a1, a2) und [b1, b2)? */
export function ueberschneiden(a1: number, a2: number, b1: number, b2: number): boolean {
  return a1 < b2 && b1 < a2;
}

export function formatZahl(wert: number, stellen = 1): string {
  return wert.toFixed(stellen).replace(".", ",");
}
