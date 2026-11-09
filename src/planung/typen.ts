/**
 * Typen des Planungsmoduls.
 *
 * Das Modul ist bewusst frei von Datenbank-, Netzwerk- und Zufallszugriffen:
 * Gleiche Eingabe ergibt immer denselben Plan. Es läuft auf dem Server und im
 * Browser (Live-Prüfung beim manuellen Bearbeiten).
 *
 * Datumswerte: "JJJJ-MM-TT", Uhrzeiten: "HH:MM" (Ortszeit Europe/Berlin).
 */

export type Id = string;
export type Datum = string;
export type Uhrzeit = string;

export interface Person {
  id: Id;
  vorname: string;
  nachname: string;
  /** Stellenanteil, 1 = Vollzeit, 0,5 = halbe Stelle */
  stellenanteil: number;
  istVorgesetzt: boolean;
  /** 1 = Teamleitung, 2 = Stellvertretung … (nur bei Vorgesetzten) */
  vorgesetztRang?: number | null;
  darfAufgefuelltWerden: boolean;
  aktivVon?: Datum | null;
  aktivBis?: Datum | null;
}

export interface Abwesenheit {
  personId: Id;
  vonDatum: Datum;
  bisDatum: Datum;
  /** Optional: Abwesenheit beginnt erst um diese Uhrzeit am ersten Tag */
  vonUhrzeit?: Uhrzeit | null;
  /** Optional: Abwesenheit endet um diese Uhrzeit am letzten Tag */
  bisUhrzeit?: Uhrzeit | null;
}

export type Wunsch =
  | { art: "tag"; datum: Datum }
  | { art: "zeitraum"; von: Datum; bis: Datum };

export interface Fall {
  id: Id;
  verantwortlichId: Id;
  kuerzel: string;
  dauerMinuten: number;
  wunsch: Wunsch;
  vorgesetztErforderlich: boolean;
  /** Weitere zwingend benötigte Personen (ohne die fallverantwortliche Person) */
  erforderlichIds: Id[];
  dringend: boolean;
  /** ISO-Zeitstempel der Eintragung */
  erstelltAm: string;
}

export interface Einstellungen {
  minTeilnehmende: number;
  minErsparnisMinuten: number;
  auswertungszeitraumWochen: number;
  wechselpauseMinuten: number;
}

export interface Konferenztag {
  id: Id;
  datum: Datum;
  beginn: Uhrzeit;
  /** Optionales spätestes Ende. Ohne Ende dauert die Konferenz so lange wie nötig. */
  ende?: Uhrzeit | null;
}

export type TeilnahmeArt = "EIGENER_FALL" | "ERFORDERLICH" | "VORGESETZT" | "AUFGEFUELLT";

/** Eine Teilnahme aus einem veröffentlichten Plan (für die Fairnessstatistik). */
export interface HistorischeTeilnahme {
  personId: Id;
  datum: Datum;
  art: TeilnahmeArt;
  minuten: number;
}

export interface PlanPunkt {
  fallId: Id;
  beginn: Uhrzeit;
  ende: Uhrzeit;
}

export interface PlanTeilnahme {
  personId: Id;
  art: TeilnahmeArt;
  begruendung: string;
  /** true, wenn von der Planung von Hand hinzugefügt oder geändert */
  manuell?: boolean;
}

export interface PlanGruppe {
  nummer: number;
  punkte: PlanPunkt[];
  teilnehmende: PlanTeilnahme[];
}

export interface NichtEingeplant {
  fallId: Id;
  grund: string;
  loesungen: string[];
  /** Wunschzeitraum reicht noch weiter: Fall wird für diesen späteren Termin vorgemerkt. */
  vorgemerktFuer?: Datum;
}

export interface PlanEntwurf {
  tagId: Id;
  datum: Datum;
  gruppen: PlanGruppe[];
  gruppenBegruendung: string;
  nichtEingeplant: NichtEingeplant[];
  /** Hinweise für die Planung, wenn kein (vollständiger) Plan möglich ist */
  hinweise: string[];
}

export interface PlanungsEingabe {
  tag: Konferenztag;
  personen: Person[];
  abwesenheiten: Abwesenheit[];
  /** Alle offenen Fälle; das Modul wählt die für diesen Tag passenden aus. */
  faelle: Fall[];
  einstellungen: Einstellungen;
  /** Teilnahmen aus veröffentlichten Plänen (andere Tage) */
  historie: HistorischeTeilnahme[];
  /** Alle Konferenztage (Datum), für Fairnessfaktor und Lösungsvorschläge */
  alleTermine: Datum[];
}

export type Schwere = "fehler" | "warnung";

export interface Verstoss {
  regel:
    | "BESCHLUSSFAEHIGKEIT"
    | "PFLICHTPERSON_FEHLT"
    | "VORGESETZT_FEHLT"
    | "DOPPELBELEGUNG"
    | "ABWESEND"
    | "NICHT_AKTIV"
    | "ZEITFENSTER"
    | "FALL_DOPPELT"
    | "UEBERSCHNEIDUNG"
    | "UNBEKANNT"
    | "VORGESETZT_UNNOETIG"
    | "NICHT_AUFFUELLBAR"
    | "GRUPPENZAHL";
  schwere: Schwere;
  text: string;
  gruppe?: number;
  fallId?: Id;
  personId?: Id;
}

export interface FairnessZeile {
  personId: Id;
  name: string;
  stellenanteil: number;
  mitEigenemFall: number;
  erforderlich: number;
  aufgefuellt: number;
  /** erforderlich + aufgefüllt */
  ohneEigenenFall: number;
  minutenOhneEigenenFall: number;
  /** Anteil der Konferenztage im Zeitraum, an denen die Person beschäftigt und anwesend war (0–1) */
  anwesenheitsanteil: number;
  /** ohneEigenenFall / (stellenanteil × anwesenheitsanteil) */
  quote: number;
  letzteTeilnahmeOhneFall: Datum | null;
}
