import type {
  Fall,
  HistorischeTeilnahme,
  Person,
  PlanEntwurf,
  PlanGruppe,
  PlanTeilnahme,
  PlanungsEingabe,
  TeilnahmeArt,
  Verstoss,
} from "./typen";
import { abwesenheitsText, istVerfuegbar, personName } from "./verfuegbarkeit";
import { ueberschneiden, zuMinuten, zuUhrzeit } from "./zeit";

/** Beginn und Ende einer Gruppe in Minuten (aus den Planpunkten). */
export function gruppenSpanne(g: PlanGruppe): { von: number; bis: number } | null {
  if (g.punkte.length === 0) return null;
  return {
    von: Math.min(...g.punkte.map((p) => zuMinuten(p.beginn))),
    bis: Math.max(...g.punkte.map((p) => zuMinuten(p.ende))),
  };
}

/**
 * Bestimmt die Teilnahmeart jeder Person anhand der Fälle in der Gruppe neu.
 * Wird nach manuellen Änderungen aufgerufen, damit die Statistik stimmt
 * (z. B. wenn ein Fall in die andere Gruppe verschoben wurde).
 */
export function normalisiereTeilnahmen(plan: PlanEntwurf, eingabe: Pick<PlanungsEingabe, "faelle" | "personen">): PlanEntwurf {
  const faelle = new Map(eingabe.faelle.map((f) => [f.id, f]));
  const personen = new Map(eingabe.personen.map((p) => [p.id, p]));
  return {
    ...plan,
    gruppen: plan.gruppen.map((g) => {
      const gf = g.punkte.map((p) => faelle.get(p.fallId)).filter((f): f is Fall => !!f);
      const gesehen = new Set<string>();
      const teilnehmende: PlanTeilnahme[] = [];
      for (const t of g.teilnehmende) {
        if (gesehen.has(t.personId)) continue;
        gesehen.add(t.personId);
        const art = bestimmeArt(t.personId, gf, personen.get(t.personId));
        teilnehmende.push(art === t.art && t.begruendung ? t : { ...t, art, begruendung: neueBegruendung(art, t, gf) });
      }
      return { ...g, teilnehmende };
    }),
  };
}

function bestimmeArt(personId: string, faelle: Fall[], p: Person | undefined): TeilnahmeArt {
  if (faelle.some((f) => f.verantwortlichId === personId)) return "EIGENER_FALL";
  if (p?.istVorgesetzt) return "VORGESETZT";
  if (faelle.some((f) => f.erforderlichIds.includes(personId))) return "ERFORDERLICH";
  return "AUFGEFUELLT";
}

function neueBegruendung(art: TeilnahmeArt, t: PlanTeilnahme, faelle: Fall[]): string {
  const k = (fs: Fall[]) => fs.map((f) => f.kuerzel).join(", ");
  switch (art) {
    case "EIGENER_FALL":
      return `Bringt eigenen Fall ein: ${k(faelle.filter((f) => f.verantwortlichId === t.personId))}.`;
    case "ERFORDERLICH":
      return `Als erforderlich angegeben für Fall ${k(faelle.filter((f) => f.erforderlichIds.includes(t.personId)))}.`;
    case "VORGESETZT":
      return "Vorgesetzte Person (von der Planung eingetragen).";
    case "AUFGEFUELLT":
      return t.manuell || !t.begruendung ? "Von der Planung von Hand hinzugefügt." : t.begruendung;
  }
}

/** Teilnahmen eines Plans im Format der Fairnessstatistik. */
export function teilnahmenAusPlan(plan: PlanEntwurf): HistorischeTeilnahme[] {
  return plan.gruppen.flatMap((g) => {
    const s = gruppenSpanne(g);
    const minuten = s ? s.bis - s.von : 0;
    return g.teilnehmende.map((t) => ({ personId: t.personId, datum: plan.datum, art: t.art, minuten }));
  });
}

/**
 * Prüft einen (ggf. von Hand geänderten) Plan gegen alle Regeln.
 * Liefert verständliche Sätze; „fehler“ verhindern das Veröffentlichen nicht,
 * werden aber deutlich angezeigt und müssen bestätigt werden.
 */
export function pruefePlan(plan: PlanEntwurf, e: PlanungsEingabe): Verstoss[] {
  const v: Verstoss[] = [];
  const min = e.einstellungen.minTeilnehmende;
  const faelle = new Map(e.faelle.map((f) => [f.id, f]));
  const personen = new Map(e.personen.map((p) => [p.id, p]));
  const name = (id: string) => {
    const p = personen.get(id);
    return p ? personName(p) : "Unbekannte Person";
  };

  if (plan.gruppen.length > 2) {
    v.push({ regel: "GRUPPENZAHL", schwere: "fehler", text: `Es sind ${plan.gruppen.length} Gruppen geplant, erlaubt sind höchstens 2.` });
  }

  // Fall mehrfach eingeplant
  const fallOrte = new Map<string, number[]>();
  for (const g of plan.gruppen) for (const p of g.punkte) fallOrte.set(p.fallId, [...(fallOrte.get(p.fallId) ?? []), g.nummer]);
  for (const [fallId, orte] of fallOrte) {
    const f = faelle.get(fallId);
    if (!f) {
      v.push({ regel: "UNBEKANNT", schwere: "fehler", text: "Ein eingeplanter Fall existiert nicht mehr.", fallId });
    } else if (orte.length > 1) {
      v.push({ regel: "FALL_DOPPELT", schwere: "fehler", text: `Fall ${f.kuerzel} ist mehrfach eingeplant.`, fallId });
    }
  }

  const spannen = new Map<number, { von: number; bis: number } | null>();
  for (const g of plan.gruppen) spannen.set(g.nummer, gruppenSpanne(g));

  for (const g of plan.gruppen) {
    const s = spannen.get(g.nummer);
    const mitglieder = new Set(g.teilnehmende.map((t) => t.personId));
    const gName = plan.gruppen.length > 1 ? `Gruppe ${g.nummer}` : "Die Konferenz";

    if (!s) {
      v.push({ regel: "BESCHLUSSFAEHIGKEIT", schwere: "warnung", text: `${gName} enthält keinen Fall.`, gruppe: g.nummer });
      continue;
    }

    // Beschlussfähigkeit
    if (mitglieder.size < min) {
      v.push({
        regel: "BESCHLUSSFAEHIGKEIT",
        schwere: "fehler",
        text: `${gName} ist nicht beschlussfähig: ${mitglieder.size} von mindestens ${min} Personen.`,
        gruppe: g.nummer,
      });
    }

    // Zeiten innerhalb der Gruppe
    const punkte = [...g.punkte].sort((a, b) => zuMinuten(a.beginn) - zuMinuten(b.beginn));
    for (const p of punkte) {
      if (zuMinuten(p.ende) <= zuMinuten(p.beginn)) {
        v.push({ regel: "UEBERSCHNEIDUNG", schwere: "fehler", text: `Bei Fall ${faelle.get(p.fallId)?.kuerzel ?? "?"} liegt das Ende vor dem Beginn.`, gruppe: g.nummer, fallId: p.fallId });
      }
    }
    for (let i = 1; i < punkte.length; i++) {
      const a = punkte[i - 1]!;
      const b = punkte[i]!;
      if (zuMinuten(b.beginn) < zuMinuten(a.ende)) {
        v.push({
          regel: "UEBERSCHNEIDUNG",
          schwere: "fehler",
          text: `In ${plan.gruppen.length > 1 ? `Gruppe ${g.nummer}` : "der Konferenz"} überschneiden sich Fall ${faelle.get(a.fallId)?.kuerzel ?? "?"} und Fall ${faelle.get(b.fallId)?.kuerzel ?? "?"}.`,
          gruppe: g.nummer,
          fallId: b.fallId,
        });
      }
    }

    // Zeitfenster des Konferenztags
    if (s.von < zuMinuten(e.tag.beginn)) {
      v.push({ regel: "ZEITFENSTER", schwere: "warnung", text: `${gName} beginnt vor dem Konferenzbeginn (${e.tag.beginn} Uhr).`, gruppe: g.nummer });
    }
    if (e.tag.ende && s.bis > zuMinuten(e.tag.ende)) {
      v.push({ regel: "ZEITFENSTER", schwere: "warnung", text: `${gName} endet um ${zuUhrzeit(s.bis)} Uhr, also nach dem geplanten Ende (${e.tag.ende} Uhr).`, gruppe: g.nummer });
    }

    // Pflichtpersonen und Vorgesetzte je Fall
    let brauchtVorgesetzt = false;
    for (const p of g.punkte) {
      const f = faelle.get(p.fallId);
      if (!f) continue;
      for (const id of [f.verantwortlichId, ...f.erforderlichIds]) {
        if (!mitglieder.has(id)) {
          const rolle = id === f.verantwortlichId ? "fallverantwortlich" : "als erforderlich angegeben";
          v.push({
            regel: "PFLICHTPERSON_FEHLT",
            schwere: "fehler",
            text: `${name(id)} ist bei Fall ${f.kuerzel} ${rolle}, aber nicht in ${plan.gruppen.length > 1 ? `Gruppe ${g.nummer}` : "der Konferenz"} eingeplant.`,
            gruppe: g.nummer,
            fallId: f.id,
            personId: id,
          });
        }
      }
      if (f.vorgesetztErforderlich) {
        brauchtVorgesetzt = true;
        if (![...mitglieder].some((id) => personen.get(id)?.istVorgesetzt)) {
          v.push({ regel: "VORGESETZT_FEHLT", schwere: "fehler", text: `Fall ${f.kuerzel} braucht eine vorgesetzte Person, in ${plan.gruppen.length > 1 ? `Gruppe ${g.nummer}` : "der Konferenz"} ist keine eingeplant.`, gruppe: g.nummer, fallId: f.id });
        }
      }
    }

    // Personen: Abwesenheit, nicht benötigte Vorgesetzte, Auffüll-Sperre
    for (const t of g.teilnehmende) {
      const p = personen.get(t.personId);
      if (!p) {
        v.push({ regel: "UNBEKANNT", schwere: "fehler", text: "Eine eingeplante Person ist nicht mehr im Team.", gruppe: g.nummer, personId: t.personId });
        continue;
      }
      if (!istVerfuegbar(p, plan.datum, s.von, s.bis, e.abwesenheiten)) {
        v.push({
          regel: "ABWESEND",
          schwere: "fehler",
          text: `${abwesenheitsText(p, plan.datum, s.von, s.bis, e.abwesenheiten)}, ist aber von ${zuUhrzeit(s.von)} bis ${zuUhrzeit(s.bis)} Uhr eingeplant.`,
          gruppe: g.nummer,
          personId: p.id,
        });
      }
      const ausdruecklich = g.punkte.some((pp) => {
        const f = faelle.get(pp.fallId);
        return f && (f.verantwortlichId === p.id || f.erforderlichIds.includes(p.id));
      });
      if (p.istVorgesetzt && !brauchtVorgesetzt && !ausdruecklich) {
        v.push({ regel: "VORGESETZT_UNNOETIG", schwere: "warnung", text: `${personName(p)} ist vorgesetzt und wird in dieser Gruppe nicht benötigt.`, gruppe: g.nummer, personId: p.id });
      }
      if (t.art === "AUFGEFUELLT" && !p.darfAufgefuelltWerden) {
        v.push({ regel: "NICHT_AUFFUELLBAR", schwere: "warnung", text: `${personName(p)} soll laut Einstellungen nicht zum Auffüllen herangezogen werden.`, gruppe: g.nummer, personId: p.id });
      }
    }
  }

  // Doppelbelegung: dieselbe Person zeitgleich in zwei Gruppen
  for (let i = 0; i < plan.gruppen.length; i++) {
    for (let j = i + 1; j < plan.gruppen.length; j++) {
      const a = plan.gruppen[i]!;
      const b = plan.gruppen[j]!;
      const sa = spannen.get(a.nummer);
      const sb = spannen.get(b.nummer);
      if (!sa || !sb || !ueberschneiden(sa.von, sa.bis, sb.von, sb.bis)) continue;
      const inB = new Set(b.teilnehmende.map((t) => t.personId));
      for (const t of a.teilnehmende) {
        if (inB.has(t.personId)) {
          v.push({
            regel: "DOPPELBELEGUNG",
            schwere: "fehler",
            text: `${name(t.personId)} ist zeitgleich in Gruppe ${a.nummer} und Gruppe ${b.nummer} eingeplant.`,
            personId: t.personId,
          });
        }
      }
    }
  }

  return v;
}
