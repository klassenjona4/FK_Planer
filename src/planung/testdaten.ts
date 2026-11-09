/** Hilfsfunktionen für Tests: kleines, fiktives Team. */
import type { Einstellungen, Fall, Person, PlanungsEingabe } from "./typen";

export const STANDARD: Einstellungen = {
  minTeilnehmende: 3,
  minErsparnisMinuten: 30,
  auswertungszeitraumWochen: 26,
  wechselpauseMinuten: 0,
};

export function person(id: string, extra: Partial<Person> = {}): Person {
  return {
    id,
    vorname: id.toUpperCase(),
    nachname: `Test${id}`,
    stellenanteil: 1,
    istVorgesetzt: false,
    darfAufgefuelltWerden: true,
    ...extra,
  };
}

/** Leitung, Vertretung und acht Fachkräfte a–h */
export function team(): Person[] {
  return [
    person("lei", { vorname: "Lea", nachname: "Leitung", istVorgesetzt: true, vorgesetztRang: 1 }),
    person("ver", { vorname: "Viktor", nachname: "Vertretung", istVorgesetzt: true, vorgesetztRang: 2 }),
    ..."abcdefgh".split("").map((c) => person(c)),
  ];
}

let zaehler = 0;
export function fall(verantwortlichId: string, extra: Partial<Fall> = {}): Fall {
  zaehler++;
  const nr = String(zaehler).padStart(3, "0");
  return {
    id: extra.id ?? `f${nr}`,
    verantwortlichId,
    kuerzel: extra.kuerzel ?? `K-${nr}`,
    dauerMinuten: 30,
    wunsch: { art: "tag", datum: "2026-11-17" },
    vorgesetztErforderlich: false,
    erforderlichIds: [],
    dringend: false,
    erstelltAm: `2026-11-01T08:${String(zaehler % 60).padStart(2, "0")}:00Z`,
    ...extra,
  };
}

export function eingabe(extra: Partial<PlanungsEingabe> = {}): PlanungsEingabe {
  return {
    tag: { id: "t1", datum: "2026-11-17", beginn: "09:00", ende: null },
    personen: team(),
    abwesenheiten: [],
    faelle: [],
    einstellungen: STANDARD,
    historie: [],
    alleTermine: ["2026-11-03", "2026-11-10", "2026-11-17", "2026-11-24", "2026-12-01"],
    ...extra,
  };
}
