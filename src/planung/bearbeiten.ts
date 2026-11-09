/**
 * Manuelle Änderungen am Plan als reine Funktionen (für die Bearbeitungsansicht).
 * Jede Funktion liefert einen neuen, normalisierten Plan; die Prüfung erfolgt
 * anschließend mit pruefePlan().
 */
import { berechneFairness, vergleicheKandidaten } from "./fairness";
import { normalisiereTeilnahmen, teilnahmenAusPlan, gruppenSpanne } from "./pruefen";
import type { Fall, PlanEntwurf, PlanGruppe, PlanungsEingabe } from "./typen";
import { istVerfuegbar } from "./verfuegbarkeit";
import { zuMinuten, zuUhrzeit } from "./zeit";

function kopie(p: PlanEntwurf): PlanEntwurf {
  return structuredClone(p);
}

function fallMap(e: PlanungsEingabe): Map<string, Fall> {
  return new Map(e.faelle.map((f) => [f.id, f]));
}

function gruppe(p: PlanEntwurf, nummer: number): PlanGruppe {
  const g = p.gruppen.find((x) => x.nummer === nummer);
  if (!g) throw new Error(`Gruppe ${nummer} gibt es nicht.`);
  return g;
}

/** Uhrzeiten einer Gruppe lückenlos ab Konferenzbeginn neu setzen. */
export function taktNeu(p: PlanEntwurf, e: PlanungsEingabe, nummer: number): PlanEntwurf {
  const neu = kopie(p);
  const faelle = fallMap(e);
  let t = zuMinuten(e.tag.beginn);
  for (const pt of gruppe(neu, nummer).punkte) {
    const dauer = faelle.get(pt.fallId)?.dauerMinuten ?? zuMinuten(pt.ende) - zuMinuten(pt.beginn);
    pt.beginn = zuUhrzeit(t);
    pt.ende = zuUhrzeit(t + dauer);
    t += dauer + e.einstellungen.wechselpauseMinuten;
  }
  return neu;
}

function brauchtGrund(g: PlanGruppe, personId: string, faelle: Map<string, Fall>, istVorgesetzt: boolean): boolean {
  return g.punkte.some((pt) => {
    const f = faelle.get(pt.fallId);
    if (!f) return false;
    return f.verantwortlichId === personId || f.erforderlichIds.includes(personId) || (istVorgesetzt && f.vorgesetztErforderlich);
  });
}

/** Pflichtpersonen eines Falls in die Zielgruppe holen und überflüssige aus der Quellgruppe entfernen. */
function uebertragePflicht(p: PlanEntwurf, e: PlanungsEingabe, f: Fall, quelle: PlanGruppe | null, ziel: PlanGruppe | null) {
  const faelle = fallMap(e);
  const personen = new Map(e.personen.map((x) => [x.id, x]));
  if (ziel) {
    const da = new Set(ziel.teilnehmende.map((t) => t.personId));
    for (const id of [f.verantwortlichId, ...f.erforderlichIds]) {
      if (!da.has(id)) ziel.teilnehmende.push({ personId: id, art: "ERFORDERLICH", begruendung: "" });
      da.add(id);
    }
    if (f.vorgesetztErforderlich && ![...da].some((id) => personen.get(id)?.istVorgesetzt)) {
      const belegt = new Set(p.gruppen.filter((g) => g !== ziel).flatMap((g) => g.teilnehmende.map((t) => t.personId)));
      const s = gruppenSpanne(ziel) ?? { von: zuMinuten(e.tag.beginn), bis: zuMinuten(e.tag.beginn) + f.dauerMinuten };
      const vg = e.personen
        .filter((x) => x.istVorgesetzt && !belegt.has(x.id) && istVerfuegbar(x, e.tag.datum, s.von, s.bis, e.abwesenheiten))
        .sort((a, b) => (a.vorgesetztRang ?? 99) - (b.vorgesetztRang ?? 99) || a.id.localeCompare(b.id))[0];
      if (vg) ziel.teilnehmende.push({ personId: vg.id, art: "VORGESETZT", begruendung: `Vorgesetzte Person erforderlich für Fall ${f.kuerzel}.` });
    }
  }
  if (quelle) {
    quelle.teilnehmende = quelle.teilnehmende.filter((t) => {
      if (t.art === "AUFGEFUELLT" || t.manuell) return true;
      return brauchtGrund(quelle, t.personId, faelle, !!personen.get(t.personId)?.istVorgesetzt);
    });
  }
}

export function verschiebeFall(p: PlanEntwurf, e: PlanungsEingabe, fallId: string, zielNummer: number): PlanEntwurf {
  let neu = kopie(p);
  const quelle = neu.gruppen.find((g) => g.punkte.some((x) => x.fallId === fallId));
  const ziel = gruppe(neu, zielNummer);
  const f = fallMap(e).get(fallId);
  if (!quelle || !f || quelle === ziel) return p;
  const punkt = quelle.punkte.find((x) => x.fallId === fallId)!;
  quelle.punkte = quelle.punkte.filter((x) => x !== punkt);
  ziel.punkte.push(punkt);
  uebertragePflicht(neu, e, f, quelle, ziel);
  neu = taktNeu(taktNeu(neu, e, quelle.nummer), e, ziel.nummer);
  return normalisiereTeilnahmen(neu, e);
}

export function bewegeInGruppe(p: PlanEntwurf, e: PlanungsEingabe, fallId: string, richtung: -1 | 1): PlanEntwurf {
  const neu = kopie(p);
  const g = neu.gruppen.find((x) => x.punkte.some((pt) => pt.fallId === fallId));
  if (!g) return p;
  const i = g.punkte.findIndex((pt) => pt.fallId === fallId);
  const j = i + richtung;
  if (j < 0 || j >= g.punkte.length) return p;
  [g.punkte[i], g.punkte[j]] = [g.punkte[j]!, g.punkte[i]!];
  return taktNeu(neu, e, g.nummer);
}

export function setzeBeginn(p: PlanEntwurf, e: PlanungsEingabe, fallId: string, beginn: string): PlanEntwurf {
  if (!/^\d{2}:\d{2}$/.test(beginn)) return p;
  const neu = kopie(p);
  for (const g of neu.gruppen) {
    const pt = g.punkte.find((x) => x.fallId === fallId);
    if (!pt) continue;
    const dauer = fallMap(e).get(fallId)?.dauerMinuten ?? zuMinuten(pt.ende) - zuMinuten(pt.beginn);
    pt.beginn = beginn;
    pt.ende = zuUhrzeit(zuMinuten(beginn) + dauer);
    g.punkte.sort((a, b) => zuMinuten(a.beginn) - zuMinuten(b.beginn));
  }
  return neu;
}

export function nimmFallHeraus(p: PlanEntwurf, e: PlanungsEingabe, fallId: string): PlanEntwurf {
  const neu = kopie(p);
  const g = neu.gruppen.find((x) => x.punkte.some((pt) => pt.fallId === fallId));
  const f = fallMap(e).get(fallId);
  if (!g || !f) return p;
  g.punkte = g.punkte.filter((pt) => pt.fallId !== fallId);
  uebertragePflicht(neu, e, f, g, null);
  neu.nichtEingeplant.push({ fallId, grund: "Von der Planung aus dem Plan genommen.", loesungen: ["Bei Bedarf wieder aufnehmen oder auf einen anderen Termin legen."] });
  return normalisiereTeilnahmen(taktNeu(neu, e, g.nummer), e);
}

export function nimmFallAuf(p: PlanEntwurf, e: PlanungsEingabe, fallId: string, zielNummer: number): PlanEntwurf {
  let neu = kopie(p);
  const f = fallMap(e).get(fallId);
  if (!f || neu.gruppen.some((g) => g.punkte.some((pt) => pt.fallId === fallId))) return p;
  if (neu.gruppen.length === 0) neu.gruppen.push({ nummer: 1, punkte: [], teilnehmende: [] });
  const ziel = gruppe(neu, Math.min(zielNummer, neu.gruppen.length));
  ziel.punkte.push({ fallId, beginn: e.tag.beginn, ende: e.tag.beginn });
  neu.nichtEingeplant = neu.nichtEingeplant.filter((n) => n.fallId !== fallId);
  uebertragePflicht(neu, e, f, null, ziel);
  neu = taktNeu(neu, e, ziel.nummer);
  return normalisiereTeilnahmen(neu, e);
}

export function zweiteGruppeAnlegen(p: PlanEntwurf): PlanEntwurf {
  if (p.gruppen.length !== 1) return p;
  const neu = kopie(p);
  neu.gruppen.push({ nummer: 2, punkte: [], teilnehmende: [] });
  neu.gruppenBegruendung = "2 Gruppen: von der Planung festgelegt.";
  return neu;
}

export function gruppenZusammenlegen(p: PlanEntwurf, e: PlanungsEingabe): PlanEntwurf {
  if (p.gruppen.length !== 2) return p;
  const neu = kopie(p);
  const [g1, g2] = neu.gruppen as [PlanGruppe, PlanGruppe];
  g1.punkte.push(...g2.punkte);
  const da = new Set(g1.teilnehmende.map((t) => t.personId));
  g1.teilnehmende.push(...g2.teilnehmende.filter((t) => !da.has(t.personId)));
  neu.gruppen = [g1];
  neu.gruppenBegruendung = "1 Gruppe: von der Planung festgelegt.";
  return normalisiereTeilnahmen(taktNeu(neu, e, 1), e);
}

export function entfernePerson(p: PlanEntwurf, nummer: number, personId: string): PlanEntwurf {
  const neu = kopie(p);
  const g = gruppe(neu, nummer);
  g.teilnehmende = g.teilnehmende.filter((t) => t.personId !== personId);
  return neu;
}

export function fuegePersonHinzu(p: PlanEntwurf, e: PlanungsEingabe, nummer: number, personId: string): PlanEntwurf {
  const neu = kopie(p);
  const g = gruppe(neu, nummer);
  if (g.teilnehmende.some((t) => t.personId === personId)) return p;
  g.teilnehmende.push({ personId, art: "AUFGEFUELLT", begruendung: "Von der Planung von Hand hinzugefügt.", manuell: true });
  return normalisiereTeilnahmen(neu, e);
}

/** Fehlende Plätze nach denselben Fairnessregeln wie die automatische Planung auffüllen. */
export function fuelleFehlendeAuf(p: PlanEntwurf, e: PlanungsEingabe): PlanEntwurf {
  const neu = kopie(p);
  const min = e.einstellungen.minTeilnehmende;
  for (const g of neu.gruppen) {
    const s = gruppenSpanne(g);
    if (!s) continue;
    while (g.teilnehmende.length < min) {
      const belegt = new Set(neu.gruppen.flatMap((x) => x.teilnehmende.map((t) => t.personId)));
      const zeilen = berechneFairness({
        personen: e.personen,
        abwesenheiten: e.abwesenheiten,
        teilnahmen: [...e.historie, ...teilnahmenAusPlan(neu)],
        alleTermine: [...e.alleTermine, e.tag.datum],
        stichtag: e.tag.datum,
        einstellungen: e.einstellungen,
      });
      const zMap = new Map(zeilen.map((z) => [z.personId, z]));
      const wahl = e.personen
        .filter((x) => !x.istVorgesetzt && x.darfAufgefuelltWerden && !belegt.has(x.id) && istVerfuegbar(x, e.tag.datum, s.von, s.bis, e.abwesenheiten))
        .sort((a, b) => vergleicheKandidaten(a, b, zMap))[0];
      if (!wahl) break;
      const z = zMap.get(wahl.id);
      g.teilnehmende.push({
        personId: wahl.id,
        art: "AUFGEFUELLT",
        begruendung: `Nachträglich fair aufgefüllt: geringste Belastung der verfügbaren Personen (${(z?.quote ?? 0).toFixed(1).replace(".", ",")} je Vollzeitstelle).`,
      });
    }
  }
  return normalisiereTeilnahmen(neu, e);
}
