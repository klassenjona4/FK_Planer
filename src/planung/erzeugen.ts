import { berechneFairness, durchschnittsQuote, vergleicheKandidaten } from "./fairness";
import type {
  Datum,
  Fall,
  FairnessZeile,
  HistorischeTeilnahme,
  NichtEingeplant,
  Person,
  PlanEntwurf,
  PlanGruppe,
  PlanTeilnahme,
  PlanungsEingabe,
  TeilnahmeArt,
} from "./typen";
import {
  abwesenheitsText,
  istGanztaegigWeg,
  istVerfuegbar,
  personName,
} from "./verfuegbarkeit";
import { datumKurz, formatZahl, zuMinuten, zuUhrzeit } from "./zeit";

/** Bis zu dieser Zahl von Blöcken werden alle Aufteilungen exakt durchgerechnet. */
const MAX_BLOECKE_EXAKT = 16;

// ---------------------------------------------------------------------------
// Hilfsfunktionen
// ---------------------------------------------------------------------------

function vgl(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function wunschPasst(f: Fall, datum: Datum): boolean {
  return f.wunsch.art === "tag"
    ? f.wunsch.datum === datum
    : f.wunsch.von <= datum && datum <= f.wunsch.bis;
}

function spaetestesDatum(f: Fall): Datum {
  return f.wunsch.art === "tag" ? f.wunsch.datum : f.wunsch.bis;
}

/** Feste Reihenfolge: dringend → frühestes „spätestens“ → Eintragungszeit → ID */
export function vergleicheFaelle(a: Fall, b: Fall): number {
  if (a.dringend !== b.dringend) return a.dringend ? -1 : 1;
  return (
    vgl(spaetestesDatum(a), spaetestesDatum(b)) ||
    vgl(a.erstelltAm, b.erstelltAm) ||
    vgl(a.id, b.id)
  );
}

/** Personen, die bei einem Fall zwingend dabei sein müssen (ohne „irgendeine“ vorgesetzte Person). */
export function pflichtPersonen(f: Fall): string[] {
  return [...new Set([f.verantwortlichId, ...f.erforderlichIds])];
}

function kuerzelListe(faelle: Fall[]): string {
  return faelle.map((f) => f.kuerzel).join(", ");
}

function prozent(anteil: number): string {
  return `${Math.round(anteil * 100)} %`;
}

// ---------------------------------------------------------------------------
// Bewertung einer Gruppeneinteilung
// ---------------------------------------------------------------------------

type Problem =
  | { art: "quorum"; gruppe: number; verfuegbar: number }
  | { art: "vorgesetzt"; gruppe: number }
  | { art: "teilweise"; gruppe: number; personId: string }
  | { art: "zeitfenster"; gruppe: number };

interface GruppenBewertung {
  faelle: Fall[];
  dauer: number;
  von: number;
  bis: number;
  /** Person → Art der Teilnahme (ohne Aufgefüllte) */
  mitglieder: Map<string, { art: TeilnahmeArt; begruendung: string }>;
  pool: string[];
  bedarf: number;
}

interface Bewertung {
  gruppen: GruppenBewertung[];
  ende: number;
  problem?: Problem;
}

interface Kontext {
  e: PlanungsEingabe;
  datum: Datum;
  beginn: number;
  endeMax: number | null;
  personen: Map<string, Person>;
  vorgesetzte: Person[];
}

function dauerVon(faelle: Fall[], pause: number): number {
  if (faelle.length === 0) return 0;
  return faelle.reduce((s, f) => s + f.dauerMinuten, 0) + pause * (faelle.length - 1);
}

function verfuegbar(k: Kontext, p: Person, von: number, bis: number): boolean {
  return istVerfuegbar(p, k.datum, von, bis, k.e.abwesenheiten);
}

function bewerte(k: Kontext, einteilung: Fall[][]): Bewertung {
  const pause = k.e.einstellungen.wechselpauseMinuten;
  const min = k.e.einstellungen.minTeilnehmende;
  const gruppen: GruppenBewertung[] = einteilung.map((faelle) => {
    const dauer = dauerVon(faelle, pause);
    return { faelle, dauer, von: k.beginn, bis: k.beginn + dauer, mitglieder: new Map(), pool: [], bedarf: 0 };
  });
  const ende = Math.max(...gruppen.map((g) => g.bis));
  let problem: Problem | undefined;
  const setze = (p: Problem) => {
    if (!problem) problem = p;
  };

  // 1. Pflichtpersonen (eigener Fall, erforderlich)
  gruppen.forEach((g) => {
    for (const f of g.faelle) {
      const art = g.mitglieder.get(f.verantwortlichId);
      const eigene = g.faelle.filter((x) => x.verantwortlichId === f.verantwortlichId);
      if (!art || art.art !== "EIGENER_FALL") {
        g.mitglieder.set(f.verantwortlichId, {
          art: "EIGENER_FALL",
          begruendung: `Bringt eigenen Fall ein: ${kuerzelListe(eigene)}.`,
        });
      }
      for (const id of f.erforderlichIds) {
        if (id === f.verantwortlichId) continue;
        const vorhanden = g.mitglieder.get(id);
        if (vorhanden?.art === "EIGENER_FALL") continue;
        const fuer = g.faelle.filter((x) => x.erforderlichIds.includes(id) && x.verantwortlichId !== id);
        const person = k.personen.get(id);
        g.mitglieder.set(id, {
          art: person?.istVorgesetzt ? "VORGESETZT" : "ERFORDERLICH",
          begruendung: `Als erforderlich angegeben für Fall ${kuerzelListe(fuer)}.`,
        });
      }
    }
  });

  // 2. Vorgesetzte Person, wo erforderlich
  const belegt = new Set<string>();
  gruppen.forEach((g) => g.mitglieder.forEach((_, id) => belegt.add(id)));
  gruppen.forEach((g, i) => {
    const vgFaelle = g.faelle.filter((f) => f.vorgesetztErforderlich);
    if (vgFaelle.length === 0) return;
    const schonDa = [...g.mitglieder.keys()]
      .map((id) => k.personen.get(id))
      .find((p) => p?.istVorgesetzt);
    if (schonDa) {
      const m = g.mitglieder.get(schonDa.id)!;
      m.begruendung += ` Zugleich vorgesetzte Person für Fall ${kuerzelListe(vgFaelle)}.`;
      return;
    }
    const kandidaten = k.vorgesetzte.filter((p) => !belegt.has(p.id) && verfuegbar(k, p, g.von, g.bis));
    const wahl = kandidaten[0];
    if (!wahl) {
      setze({ art: "vorgesetzt", gruppe: i });
      return;
    }
    belegt.add(wahl.id);
    let begruendung = `Vorgesetzte Person erforderlich für Fall ${kuerzelListe(vgFaelle)}.`;
    const vorrangig = k.vorgesetzte.filter((p) => (p.vorgesetztRang ?? 99) < (wahl.vorgesetztRang ?? 99));
    if (vorrangig.length > 0) {
      const v = vorrangig[0]!;
      begruendung += belegt.has(v.id) && verfuegbar(k, v, g.von, g.bis)
        ? ` Vertretung, weil ${personName(v)} in der anderen Gruppe ist.`
        : ` Vertretung, weil ${personName(v)} nicht verfügbar ist.`;
    }
    g.mitglieder.set(wahl.id, { art: "VORGESETZT", begruendung });
  });

  // 3. Pflichtpersonen müssen die ganze Sitzung über verfügbar sein
  gruppen.forEach((g, i) => {
    for (const id of g.mitglieder.keys()) {
      const p = k.personen.get(id);
      if (!p || !verfuegbar(k, p, g.von, g.bis)) setze({ art: "teilweise", gruppe: i, personId: id });
    }
  });

  // 4. Beschlussfähigkeit: genug freie Personen zum Auffüllen?
  const auffuellbar = k.e.personen.filter(
    (p) => !p.istVorgesetzt && p.darfAufgefuelltWerden && !belegt.has(p.id),
  );
  gruppen.forEach((g) => {
    g.pool = auffuellbar.filter((p) => verfuegbar(k, p, g.von, g.bis)).map((p) => p.id);
    g.bedarf = Math.max(0, min - g.mitglieder.size);
  });
  gruppen.forEach((g, i) => {
    if (g.bedarf > g.pool.length) {
      setze({ art: "quorum", gruppe: i, verfuegbar: g.mitglieder.size + g.pool.length });
    }
  });
  if (gruppen.length === 2 && !problem) {
    const [a, b] = gruppen as [GruppenBewertung, GruppenBewertung];
    const gemeinsam = new Set([...a.pool, ...b.pool]);
    if (a.bedarf + b.bedarf > gemeinsam.size) {
      setze({ art: "quorum", gruppe: 1, verfuegbar: a.mitglieder.size + b.mitglieder.size + gemeinsam.size });
    }
  }

  // 5. Zeitfenster
  if (k.endeMax !== null) {
    gruppen.forEach((g, i) => {
      if (g.bis > k.endeMax!) setze({ art: "zeitfenster", gruppe: i });
    });
  }

  return { gruppen, ende, problem };
}

// ---------------------------------------------------------------------------
// Aufteilung in Blöcke und beste Zweier-Aufteilung
// ---------------------------------------------------------------------------

/** Fälle, die eine Person gemeinsam brauchen, bilden einen Block (immer dieselbe Gruppe). */
export function bildeBloecke(faelle: Fall[]): Fall[][] {
  const eltern = faelle.map((_, i) => i);
  const finde = (i: number): number => (eltern[i] === i ? i : (eltern[i] = finde(eltern[i]!)));
  const erstesVorkommen = new Map<string, number>();
  faelle.forEach((f, i) => {
    for (const id of pflichtPersonen(f)) {
      const j = erstesVorkommen.get(id);
      if (j === undefined) erstesVorkommen.set(id, i);
      else {
        const a = finde(i);
        const b = finde(j);
        if (a !== b) eltern[Math.max(a, b)] = Math.min(a, b);
      }
    }
  });
  const bloecke = new Map<number, Fall[]>();
  faelle.forEach((f, i) => {
    const w = finde(i);
    if (!bloecke.has(w)) bloecke.set(w, []);
    bloecke.get(w)!.push(f);
  });
  return [...bloecke.entries()].sort((a, b) => a[0] - b[0]).map(([, v]) => v);
}

function besteZweierAufteilung(k: Kontext, faelle: Fall[]): { beste?: Bewertung; besteUngueltig?: Bewertung; bloecke: number } {
  const bloecke = bildeBloecke(faelle);
  const n = bloecke.length;
  if (n < 2) return { bloecke: n };
  const pause = k.e.einstellungen.wechselpauseMinuten;
  const reihenfolge = new Map(faelle.map((f, i) => [f.id, i]));
  const sortiere = (fs: Fall[]) => [...fs].sort((a, b) => reihenfolge.get(a.id)! - reihenfolge.get(b.id)!);

  const kandidaten: Array<{ maske: number; g1: Fall[]; g2: Fall[]; makespan: number; differenz: number }> = [];
  const fuegeHinzu = (maske: number, g1: Fall[], g2: Fall[]) => {
    const d1 = dauerVon(g1, pause);
    const d2 = dauerVon(g2, pause);
    kandidaten.push({ maske, g1: sortiere(g1), g2: sortiere(g2), makespan: Math.max(d1, d2), differenz: Math.abs(d1 - d2) });
  };

  if (n <= MAX_BLOECKE_EXAKT) {
    // Block 0 (wichtigster Fall) liegt immer in Gruppe 1 → keine spiegelbildlichen Doppelungen
    for (let maske = 1; maske < 1 << (n - 1); maske++) {
      const g1: Fall[] = [...bloecke[0]!];
      const g2: Fall[] = [];
      for (let i = 1; i < n; i++) ((maske >> (i - 1)) & 1 ? g2 : g1).push(...bloecke[i]!);
      fuegeHinzu(maske, g1, g2);
    }
  } else {
    // Sehr viele Blöcke: deterministische Näherung (größte Blöcke zuerst in die kürzere Gruppe)
    const sortiert = bloecke
      .map((b, i) => ({ b, i, d: dauerVon(b, pause) }))
      .sort((x, y) => y.d - x.d || x.i - y.i);
    const g1: Fall[] = [];
    const g2: Fall[] = [];
    for (const { b } of sortiert) (dauerVon(g1, pause) <= dauerVon(g2, pause) ? g1 : g2).push(...b);
    fuegeHinzu(0, g1, g2);
  }

  kandidaten.sort((a, b) => a.makespan - b.makespan || a.differenz - b.differenz || a.maske - b.maske);
  let besteUngueltig: Bewertung | undefined;
  for (const kand of kandidaten) {
    const b = bewerte(k, [kand.g1, kand.g2]);
    if (!b.problem) return { beste: b, besteUngueltig, bloecke: n };
    // Für die Begründung: Zeitfenster-Probleme sind weniger aussagekräftig als fehlende Personen
    if (!besteUngueltig || (besteUngueltig.problem?.art === "zeitfenster" && b.problem.art !== "zeitfenster")) {
      besteUngueltig = b;
    }
  }
  return { besteUngueltig, bloecke: n };
}

// ---------------------------------------------------------------------------
// Lösungsvorschläge
// ---------------------------------------------------------------------------

function spaetereTermine(k: Kontext): Datum[] {
  return [...new Set(k.e.alleTermine)].filter((d) => d > k.datum).sort();
}

/** Nächster Termin, an dem alle Pflichtpersonen (und ggf. eine vorgesetzte Person) da sind. */
function naechsterMoeglicherTermin(k: Kontext, f: Fall, bis?: Datum): Datum | undefined {
  for (const d of spaetereTermine(k)) {
    if (bis && d > bis) return undefined;
    const pflichtDa = pflichtPersonen(f).every((id) => {
      const p = k.personen.get(id);
      return p && !istGanztaegigWeg(p, d, k.e.abwesenheiten);
    });
    const vgDa = !f.vorgesetztErforderlich || k.vorgesetzte.some((p) => !istGanztaegigWeg(p, d, k.e.abwesenheiten));
    if (pflichtDa && vgDa) return d;
  }
  return undefined;
}

function nichtEingeplant(k: Kontext, f: Fall, grund: string, weitereLoesungen: string[]): NichtEingeplant {
  const bisWunsch = f.wunsch.art === "zeitraum" ? f.wunsch.bis : undefined;
  const imZeitraum = bisWunsch ? naechsterMoeglicherTermin(k, f, bisWunsch) : undefined;
  if (imZeitraum) {
    return {
      fallId: f.id,
      grund,
      loesungen: [`Der Fall wird automatisch für den ${datumKurz(imZeitraum)} vorgemerkt (liegt im Wunschzeitraum).`, ...weitereLoesungen],
      vorgemerktFuer: imZeitraum,
    };
  }
  const naechster = naechsterMoeglicherTermin(k, f);
  const loesungen = [
    naechster
      ? `Wunschtermin auf den ${datumKurz(naechster)} ändern – dann sind alle Beteiligten da.`
      : "Einen weiteren Konferenztermin anlegen.",
    ...weitereLoesungen,
  ];
  return { fallId: f.id, grund, loesungen };
}

// ---------------------------------------------------------------------------
// Hauptfunktion
// ---------------------------------------------------------------------------

export function erzeugePlan(e: PlanungsEingabe): PlanEntwurf {
  const datum = e.tag.datum;
  const personenSortiert = [...e.personen].sort((a, b) => vgl(a.id, b.id));
  const vorgesetzte = personenSortiert
    .filter((p) => p.istVorgesetzt)
    .sort(
      (a, b) =>
        (a.vorgesetztRang ?? 99) - (b.vorgesetztRang ?? 99) ||
        a.nachname.localeCompare(b.nachname, "de") ||
        vgl(a.id, b.id),
    );
  const k: Kontext = {
    e: { ...e, personen: personenSortiert },
    datum,
    beginn: zuMinuten(e.tag.beginn),
    endeMax: e.tag.ende ? zuMinuten(e.tag.ende) : null,
    personen: new Map(personenSortiert.map((p) => [p.id, p])),
    vorgesetzte,
  };
  const min = e.einstellungen.minTeilnehmende;
  const ergebnis: PlanEntwurf = {
    tagId: e.tag.id,
    datum,
    gruppen: [],
    gruppenBegruendung: "",
    nichtEingeplant: [],
    hinweise: [],
  };

  // 1. Passende Fälle in fester Reihenfolge
  const relevant = e.faelle.filter((f) => wunschPasst(f, datum)).sort(vergleicheFaelle);
  if (relevant.length === 0) {
    ergebnis.gruppenBegruendung = "Keine Gruppe: Für diesen Termin sind keine Fälle eingetragen.";
    ergebnis.hinweise.push(`Für den ${datumKurz(datum)} sind keine Fälle eingetragen.`);
    return ergebnis;
  }

  // 2. Fälle, deren Beteiligte an diesem Tag fehlen, vorab aussortieren
  let faelle: Fall[] = [];
  for (const f of relevant) {
    const fehlend: string[] = [];
    for (const id of pflichtPersonen(f)) {
      const p = k.personen.get(id);
      if (!p) fehlend.push("Eine angegebene Person ist nicht mehr im Team");
      else if (istGanztaegigWeg(p, datum, e.abwesenheiten)) fehlend.push(abwesenheitsText(p, datum, 0, 24 * 60, e.abwesenheiten));
    }
    if (f.vorgesetztErforderlich && !vorgesetzte.some((p) => !istGanztaegigWeg(p, datum, e.abwesenheiten))) {
      fehlend.push("Keine vorgesetzte Person ist an diesem Tag da");
    }
    if (fehlend.length > 0) {
      ergebnis.nichtEingeplant.push(
        nichtEingeplant(k, f, `${fehlend.join(". ")} (${datumKurz(datum)}).`, ["Abwesenheiten prüfen."]),
      );
    } else {
      faelle.push(f);
    }
  }

  // 3. Gruppen bilden; bei Problemen den am wenigsten dringlichen betroffenen Fall herausnehmen
  let gewaehlt: Bewertung | undefined;
  while (faelle.length > 0) {
    const eins = bewerte(k, [faelle]);
    const zwei = besteZweierAufteilung(k, faelle);
    const ersparnis = zwei.beste ? eins.gruppen[0]!.dauer - zwei.beste.ende + k.beginn : 0;

    if (!eins.problem && zwei.beste && ersparnis >= e.einstellungen.minErsparnisMinuten) {
      gewaehlt = zwei.beste;
      ergebnis.gruppenBegruendung =
        `2 Gruppen: Die Konferenz endet ${ersparnis} Minuten früher (${zuUhrzeit(zwei.beste.ende)} statt ` +
        `${zuUhrzeit(eins.ende)} Uhr), und beide Gruppen sind beschlussfähig.`;
      break;
    }
    if (!eins.problem) {
      gewaehlt = eins;
      ergebnis.gruppenBegruendung = begruendungEineGruppe(k, faelle, zwei, ersparnis);
      break;
    }
    if (zwei.beste) {
      gewaehlt = zwei.beste;
      ergebnis.gruppenBegruendung = `2 Gruppen: ${problemKurz(k, eins)} Mit 2 Gruppen ist das lösbar (Ende ${zuUhrzeit(zwei.beste.ende)} Uhr).`;
      break;
    }

    // Weder 1 noch 2 Gruppen möglich → Ursache beheben
    const p = eins.problem;
    const g = eins.gruppen[0]!;
    if (p.art === "quorum") {
      const verfuegbarePersonen = p.verfuegbar;
      ergebnis.hinweise.push(
        `Am ${datumKurz(datum)} sind nur ${verfuegbarePersonen} ${verfuegbarePersonen === 1 ? "Person" : "Personen"} verfügbar ` +
          `(mindestens ${min} nötig). Die Konferenz ist so nicht beschlussfähig.`,
      );
      const naechster = spaetereTermine(k)[0];
      const loesungen = [
        naechster ? `Die Konferenz auf den ${datumKurz(naechster)} verschieben.` : "Einen anderen Konferenztermin anlegen.",
        "Abwesenheiten prüfen.",
        "Eine weitere Person für das Auffüllen freigeben (Einstellungen › Personen).",
      ];
      for (const f of faelle) {
        ergebnis.nichtEingeplant.push(
          nichtEingeplant(k, f, `Nicht beschlussfähig: Am ${datumKurz(datum)} sind nur ${verfuegbarePersonen} Personen verfügbar.`, loesungen.slice(1)),
        );
      }
      ergebnis.hinweise.push(...loesungen.map((l) => `Lösung: ${l}`));
      faelle = [];
      break;
    }

    let betroffen: Fall[];
    let grund: string;
    let weitere: string[];
    if (p.art === "teilweise") {
      const person = k.personen.get(p.personId)!;
      betroffen = faelle.filter((f) => pflichtPersonen(f).includes(p.personId));
      grund = `${abwesenheitsText(person, datum, g.von, g.bis, e.abwesenheiten)}, die Sitzung dauert aber von ${zuUhrzeit(g.von)} bis ${zuUhrzeit(g.bis)} Uhr.`;
      weitere = ["Konferenzbeginn anpassen oder Fall auf einen anderen Termin legen."];
    } else if (p.art === "vorgesetzt") {
      betroffen = faelle.filter((f) => f.vorgesetztErforderlich);
      grund = `Keine vorgesetzte Person ist von ${zuUhrzeit(g.von)} bis ${zuUhrzeit(g.bis)} Uhr verfügbar.`;
      weitere = ["Abwesenheiten der Vorgesetzten prüfen."];
    } else {
      betroffen = faelle;
      grund = `Passt zeitlich nicht mehr in die Konferenz (Ende ${e.tag.ende} Uhr).`;
      weitere = ["Ende der Konferenz später legen (Einstellungen › Termine)."];
    }
    // Den am wenigsten dringlichen betroffenen Fall herausnehmen (letzter in der Reihenfolge)
    const raus = betroffen[betroffen.length - 1]!;
    ergebnis.nichtEingeplant.push(nichtEingeplant(k, raus, grund, weitere));
    faelle = faelle.filter((f) => f.id !== raus.id);
  }

  if (!gewaehlt) {
    if (!ergebnis.gruppenBegruendung) {
      ergebnis.gruppenBegruendung = "Keine Gruppe: Es kann kein gültiger Plan erstellt werden.";
    }
    if (ergebnis.hinweise.length === 0) {
      ergebnis.hinweise.push(`Für den ${datumKurz(datum)} kann kein Fall eingeplant werden. Die Gründe stehen bei den einzelnen Fällen.`);
    }
    return ergebnis;
  }

  // 4. Uhrzeiten und Auffüllen
  ergebnis.gruppen = fuelleAuf(k, gewaehlt);
  return ergebnis;
}

function problemKurz(k: Kontext, b: Bewertung): string {
  const p = b.problem;
  const g = b.gruppen[0]!;
  if (!p) return "";
  if (p.art === "zeitfenster") return `Mit einer Gruppe würde die Zeit bis ${k.e.tag.ende} Uhr nicht reichen.`;
  if (p.art === "teilweise") {
    const person = k.personen.get(p.personId)!;
    return `Mit einer Gruppe dauert die Sitzung bis ${zuUhrzeit(g.bis)} Uhr, aber ${abwesenheitsText(person, k.datum, g.von, g.bis, k.e.abwesenheiten)}.`;
  }
  if (p.art === "vorgesetzt") return "Mit einer Gruppe ist keine vorgesetzte Person verfügbar.";
  return "Mit einer Gruppe ist die Konferenz nicht beschlussfähig.";
}

function begruendungEineGruppe(
  k: Kontext,
  faelle: Fall[],
  zwei: { beste?: Bewertung; besteUngueltig?: Bewertung; bloecke: number },
  ersparnis: number,
): string {
  if (faelle.length === 1) return "1 Gruppe: Es gibt nur einen Fall.";
  if (zwei.bloecke < 2) return "1 Gruppe: Alle Fälle brauchen gemeinsame Personen und müssen deshalb zusammenbleiben.";
  if (zwei.beste) {
    return `1 Gruppe: Eine Aufteilung würde nur ${ersparnis} Minuten sparen (Mindestwert: ${k.e.einstellungen.minErsparnisMinuten} Minuten).`;
  }
  const p = zwei.besteUngueltig?.problem;
  if (p?.art === "vorgesetzt") return "1 Gruppe: Für 2 Gruppen fehlt eine zweite verfügbare vorgesetzte Person.";
  if (p?.art === "quorum") {
    return `1 Gruppe: Für 2 Gruppen sind nicht genug Personen anwesend (je Gruppe mindestens ${k.e.einstellungen.minTeilnehmende}).`;
  }
  if (p?.art === "teilweise") return "1 Gruppe: Bei 2 Gruppen wäre eine benötigte Person nicht die ganze Sitzung über da.";
  return "1 Gruppe: Eine Aufteilung bringt keinen Vorteil.";
}

/** Uhrzeiten setzen und freie Plätze fair auffüllen. */
function fuelleAuf(k: Kontext, b: Bewertung): PlanGruppe[] {
  const pause = k.e.einstellungen.wechselpauseMinuten;
  const gruppen: PlanGruppe[] = b.gruppen.map((g, i) => {
    let t = g.von;
    const punkte = g.faelle.map((f) => {
      const p = { fallId: f.id, beginn: zuUhrzeit(t), ende: zuUhrzeit(t + f.dauerMinuten) };
      t += f.dauerMinuten + pause;
      return p;
    });
    const teilnehmende: PlanTeilnahme[] = [...g.mitglieder.entries()].map(([personId, m]) => ({
      personId,
      art: m.art,
      begruendung: m.begruendung,
    }));
    return { nummer: i + 1, punkte, teilnehmende };
  });

  const vergeben = new Set<string>();
  gruppen.forEach((g) => g.teilnehmende.forEach((t) => vergeben.add(t.personId)));

  b.gruppen.forEach((bg, i) => {
    const gruppe = gruppen[i]!;
    for (let n = 0; n < bg.bedarf; n++) {
      // Fairness inklusive der bisher in diesem Entwurf vergebenen Teilnahmen
      const zusatz: HistorischeTeilnahme[] = gruppen.flatMap((g, j) =>
        g.teilnehmende.map((t) => ({ personId: t.personId, datum: k.datum, art: t.art, minuten: b.gruppen[j]!.dauer })),
      );
      const zeilen = berechneFairness({
        personen: k.e.personen,
        abwesenheiten: k.e.abwesenheiten,
        teilnahmen: [...k.e.historie, ...zusatz],
        alleTermine: [...k.e.alleTermine, k.datum],
        stichtag: k.datum,
        einstellungen: k.e.einstellungen,
      });
      const zMap = new Map(zeilen.map((z) => [z.personId, z]));
      const kandidaten = bg.pool
        .filter((id) => !vergeben.has(id))
        .map((id) => k.personen.get(id)!)
        .sort((x, y) => vergleicheKandidaten(x, y, zMap));
      const wahl = kandidaten[0];
      if (!wahl) break; // sollte durch die Bewertung ausgeschlossen sein
      vergeben.add(wahl.id);
      gruppe.teilnehmende.push({
        personId: wahl.id,
        art: "AUFGEFUELLT",
        begruendung: auswahlBegruendung(wahl, kandidaten[1], zMap, durchschnittsQuote(zeilen)),
      });
    }
  });
  return gruppen;
}

function auswahlBegruendung(
  wahl: Person,
  naechste: Person | undefined,
  zeilen: Map<string, FairnessZeile>,
  schnitt: number,
): string {
  const z = zeilen.get(wahl.id);
  const quote = z?.quote ?? 0;
  const teilzeit = wahl.stellenanteil < 1 ? ` bei ${prozent(wahl.stellenanteil)} Stellenanteil` : "";
  const basis =
    `${formatZahl(quote)} Teilnahmen ohne eigenen Fall je Vollzeitstelle${teilzeit} ` +
    `(Teamdurchschnitt ${formatZahl(schnitt)})`;
  const zn = naechste ? zeilen.get(naechste.id) : undefined;
  if (!naechste || (zn?.quote ?? 0) > quote) return `Geringste Belastung der verfügbaren Personen: ${basis}.`;
  const letzte = z?.letzteTeilnahmeOhneFall;
  if ((zn?.letzteTeilnahmeOhneFall ?? "") !== (letzte ?? "")) {
    return `Gleich geringe Belastung wie andere (${basis}), aber am längsten nicht mehr ohne eigenen Fall dabei` +
      (letzte ? ` (zuletzt am ${datumKurz(letzte)}).` : " (bisher noch nie).");
  }
  return `Gleich geringe Belastung wie andere (${basis}); Auswahl nach alphabetischer Reihenfolge.`;
}
