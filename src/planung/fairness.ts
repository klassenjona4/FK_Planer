import type {
  Abwesenheit,
  Datum,
  Einstellungen,
  FairnessZeile,
  HistorischeTeilnahme,
  Person,
} from "./typen";
import { istAktiv, istGanztaegigWeg, personName } from "./verfuegbarkeit";
import { plusTage } from "./zeit";

export interface FairnessEingabe {
  personen: Person[];
  abwesenheiten: Abwesenheit[];
  /** Teilnahmen aus veröffentlichten Plänen (und ggf. aus dem aktuellen Entwurf) */
  teilnahmen: HistorischeTeilnahme[];
  /** Alle Konferenztermine; gezählt werden die im Auswertungszeitraum */
  alleTermine: Datum[];
  /** Letzter Tag des Auswertungszeitraums (einschließlich) */
  stichtag: Datum;
  einstellungen: Pick<Einstellungen, "auswertungszeitraumWochen">;
}

export function zeitraumBeginn(stichtag: Datum, wochen: number): Datum {
  // erster Tag NACH diesem Datum gehört zum Zeitraum
  return plusTage(stichtag, -wochen * 7);
}

/**
 * Fairnessübersicht: Teilnahmen mit und ohne eigenen Fall je Person, bezogen
 * auf Stellenanteil und Anwesenheit. Vorgesetzte sind nicht enthalten, da sie
 * nie zum Auffüllen herangezogen werden.
 */
export function berechneFairness(e: FairnessEingabe): FairnessZeile[] {
  const start = zeitraumBeginn(e.stichtag, e.einstellungen.auswertungszeitraumWochen);
  const imZeitraum = (d: Datum) => d > start && d <= e.stichtag;
  const termine = [...new Set(e.alleTermine.filter(imZeitraum))].sort();
  const teilnahmen = e.teilnahmen.filter((t) => imZeitraum(t.datum));

  const zeilen: FairnessZeile[] = [];
  for (const p of e.personen) {
    if (p.istVorgesetzt) continue;
    const eigene = teilnahmen.filter((t) => t.personId === p.id);
    const warImZeitraumAktiv =
      termine.some((d) => istAktiv(p, d)) || istAktiv(p, e.stichtag) || eigene.length > 0;
    if (!warImZeitraumAktiv) continue;

    const anwesend = termine.filter((d) => !istGanztaegigWeg(p, d, e.abwesenheiten)).length;
    const anwesenheitsanteil = termine.length === 0 ? 1 : anwesend / termine.length;

    const mitEigenemFall = eigene.filter((t) => t.art === "EIGENER_FALL").length;
    const ohne = eigene.filter((t) => t.art === "ERFORDERLICH" || t.art === "AUFGEFUELLT");
    const erforderlich = ohne.filter((t) => t.art === "ERFORDERLICH").length;
    const aufgefuellt = ohne.filter((t) => t.art === "AUFGEFUELLT").length;
    const nenner = p.stellenanteil * anwesenheitsanteil;
    const quote = nenner > 0 ? ohne.length / nenner : ohne.length > 0 ? Number.POSITIVE_INFINITY : 0;
    const letzte = ohne.map((t) => t.datum).sort().at(-1) ?? null;

    zeilen.push({
      personId: p.id,
      name: personName(p),
      stellenanteil: p.stellenanteil,
      mitEigenemFall,
      erforderlich,
      aufgefuellt,
      ohneEigenenFall: ohne.length,
      minutenOhneEigenenFall: ohne.reduce((s, t) => s + t.minuten, 0),
      anwesenheitsanteil,
      quote,
      letzteTeilnahmeOhneFall: letzte,
    });
  }
  return zeilen.sort(
    (a, b) => a.quote - b.quote || a.name.localeCompare(b.name, "de") || a.personId.localeCompare(b.personId),
  );
}

/** Durchschnittliche Quote (ohne unendliche Werte) */
export function durchschnittsQuote(zeilen: FairnessZeile[]): number {
  const endlich = zeilen.filter((z) => Number.isFinite(z.quote));
  if (endlich.length === 0) return 0;
  return endlich.reduce((s, z) => s + z.quote, 0) / endlich.length;
}

/**
 * Feste, nachvollziehbare Reihenfolge für das Auffüllen:
 * niedrigste Quote → am längsten nicht aufgefüllt → Nachname → Vorname → ID.
 */
export function vergleicheKandidaten(
  a: Person,
  b: Person,
  zeilen: Map<string, FairnessZeile>,
): number {
  const za = zeilen.get(a.id);
  const zb = zeilen.get(b.id);
  const qa = za?.quote ?? 0;
  const qb = zb?.quote ?? 0;
  if (qa !== qb) return qa < qb ? -1 : 1;
  const la = za?.letzteTeilnahmeOhneFall ?? "";
  const lb = zb?.letzteTeilnahmeOhneFall ?? "";
  if (la !== lb) return la < lb ? -1 : 1;
  return (
    a.nachname.localeCompare(b.nachname, "de") ||
    a.vorname.localeCompare(b.vorname, "de") ||
    (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  );
}
