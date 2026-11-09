import { describe, expect, it } from "vitest";
import {
  berechneFairness,
  erzeugePlan,
  normalisiereTeilnahmen,
  pruefePlan,
  teilnahmenAusPlan,
  type HistorischeTeilnahme,
  type PlanEntwurf,
} from "./index";
import { STANDARD, eingabe, fall, person, team } from "./testdaten";

const mitglieder = (plan: PlanEntwurf, nr: number) =>
  plan.gruppen.find((g) => g.nummer === nr)!.teilnehmende.map((t) => t.personId).sort();
const fehler = (plan: PlanEntwurf, e: Parameters<typeof pruefePlan>[1]) =>
  pruefePlan(plan, e).filter((v) => v.schwere === "fehler");

describe("Doppelbelegung", () => {
  it("plant niemanden gleichzeitig in zwei Gruppen ein", () => {
    const faelle = ["a", "b", "c", "d", "e", "f"].map((id) => fall(id, { dauerMinuten: 45 }));
    const e = eingabe({ faelle });
    const plan = erzeugePlan(e);
    expect(plan.gruppen).toHaveLength(2);
    const g1 = new Set(mitglieder(plan, 1));
    expect(mitglieder(plan, 2).filter((id) => g1.has(id))).toEqual([]);
    expect(fehler(plan, e)).toEqual([]);
  });

  it("meldet eine von Hand erzeugte Doppelbelegung sofort", () => {
    const faelle = ["a", "b", "c", "d", "e", "f"].map((id) => fall(id, { dauerMinuten: 45 }));
    const e = eingabe({ faelle });
    const plan = erzeugePlan(e);
    const person1 = plan.gruppen[0]!.teilnehmende[0]!;
    plan.gruppen[1]!.teilnehmende.push({ ...person1, manuell: true });
    const v = pruefePlan(plan, e).filter((x) => x.regel === "DOPPELBELEGUNG");
    expect(v).toHaveLength(1);
    expect(v[0]!.text).toMatch(/zeitgleich in Gruppe 1 und Gruppe 2/);
  });

  it("meldet sich überschneidende Fälle in einer Gruppe", () => {
    const e = eingabe({ faelle: [fall("a"), fall("b")], einstellungen: { ...STANDARD, minErsparnisMinuten: 60 } });
    const plan = erzeugePlan(e);
    plan.gruppen[0]!.punkte[1]!.beginn = "09:15";
    expect(pruefePlan(plan, e).some((v) => v.regel === "UEBERSCHNEIDUNG")).toBe(true);
  });
});

describe("Abwesenheit", () => {
  it("plant keinen Fall ein, dessen verantwortliche Person abwesend ist, und nennt Grund und Lösung", () => {
    const f = fall("a", { kuerzel: "M-11" });
    const e = eingabe({
      faelle: [f, fall("b")],
      abwesenheiten: [{ personId: "a", vonDatum: "2026-11-16", bisDatum: "2026-11-20" }],
    });
    const plan = erzeugePlan(e);
    expect(plan.gruppen.flatMap((g) => g.punkte).map((p) => p.fallId)).not.toContain(f.id);
    const ne = plan.nichtEingeplant.find((n) => n.fallId === f.id)!;
    expect(ne.grund).toMatch(/A Testa ist an diesem Tag abwesend \(17\. November\)/i);
    expect(ne.loesungen[0]).toMatch(/24\. November/);
  });

  it("merkt den Fall für einen späteren Termin im Wunschzeitraum vor", () => {
    const f = fall("a", { wunsch: { art: "zeitraum", von: "2026-11-10", bis: "2026-12-01" } });
    const e = eingabe({ faelle: [f], abwesenheiten: [{ personId: "a", vonDatum: "2026-11-17", bisDatum: "2026-11-17" }] });
    expect(erzeugePlan(e).nichtEingeplant[0]!.vorgemerktFuer).toBe("2026-11-24");
  });

  it("füllt nicht mit abwesenden Personen auf", () => {
    const abwesend = ["c", "d", "e", "f", "g"].map((id) => ({ personId: id, vonDatum: "2026-11-17", bisDatum: "2026-11-17" }));
    const e = eingabe({ faelle: [fall("a")], abwesenheiten: abwesend });
    const plan = erzeugePlan(e);
    expect(mitglieder(plan, 1)).toEqual(["a", "b", "h"]);
  });

  it("berücksichtigt stundenweise Abwesenheit beim Auffüllen", () => {
    // b–f sind ab 09:30 weg, die Sitzung dauert bis 10:00 → nur g und h kommen in Frage
    const abwesend = ["b", "c", "d", "e", "f"].map((id) => ({
      personId: id, vonDatum: "2026-11-17", bisDatum: "2026-11-17", vonUhrzeit: "09:30",
    }));
    const e = eingabe({ faelle: [fall("a", { dauerMinuten: 60 })], abwesenheiten: abwesend });
    const plan = erzeugePlan(e);
    expect(plan.nichtEingeplant).toEqual([]);
    expect(mitglieder(plan, 1)).toEqual(["a", "g", "h"]);
    expect(fehler(plan, e)).toEqual([]);
  });

  it("nimmt einen Fall heraus, wenn die verantwortliche Person nur einen Teil der Sitzung da ist", () => {
    const e = eingabe({
      faelle: [fall("b", { dauerMinuten: 60, dringend: true }), fall("a", { dauerMinuten: 60 })],
      abwesenheiten: [{ personId: "a", vonDatum: "2026-11-17", bisDatum: "2026-11-17", vonUhrzeit: "10:30" }],
      einstellungen: { ...STANDARD, minErsparnisMinuten: 120 },
    });
    const plan = erzeugePlan(e);
    // Mit 1 Gruppe ginge die Sitzung bis 11:00, a ist nur bis 10:30 da → 2 Gruppen lösen das
    expect(plan.gruppen).toHaveLength(2);
    expect(plan.gruppenBegruendung).toMatch(/nur bis 10:30 Uhr da/);
    expect(fehler(plan, e)).toEqual([]);
  });

  it("meldet eine von Hand eingeplante abwesende Person", () => {
    const e = eingabe({ faelle: [fall("a")], abwesenheiten: [{ personId: "h", vonDatum: "2026-11-17", bisDatum: "2026-11-17" }] });
    const plan = erzeugePlan(e);
    plan.gruppen[0]!.teilnehmende.push({ personId: "h", art: "AUFGEFUELLT", begruendung: "", manuell: true });
    const v = pruefePlan(plan, e).find((x) => x.regel === "ABWESEND");
    expect(v?.text).toMatch(/H Testh ist an diesem Tag abwesend/i);
  });
});

describe("Weniger als 3 verfügbare Personen", () => {
  it("erzeugt keinen Plan und nennt den konkreten Grund", () => {
    const abwesend = ["lei", "ver", "c", "d", "e", "f", "g", "h"].map((id) => ({ personId: id, vonDatum: "2026-11-16", bisDatum: "2026-11-18" }));
    const e = eingabe({ faelle: [fall("a"), fall("b")], abwesenheiten: abwesend });
    const plan = erzeugePlan(e);
    expect(plan.gruppen).toEqual([]);
    expect(plan.hinweise[0]).toBe("Am 17. November sind nur 2 Personen verfügbar (mindestens 3 nötig). Die Konferenz ist so nicht beschlussfähig.");
    expect(plan.hinweise.join(" ")).toMatch(/verschieben/);
    expect(plan.nichtEingeplant).toHaveLength(2);
  });

  it("zählt Vorgesetzte nicht als Auffüllpersonen", () => {
    const abwesend = ["c", "d", "e", "f", "g", "h"].map((id) => ({ personId: id, vonDatum: "2026-11-17", bisDatum: "2026-11-17" }));
    const e = eingabe({ faelle: [fall("a")], abwesenheiten: abwesend, personen: team().filter((p) => p.id !== "b") });
    expect(erzeugePlan(e).gruppen).toEqual([]);
  });

  it("respektiert eine geänderte Mindestzahl", () => {
    const e = eingabe({ faelle: [fall("a")], einstellungen: { ...STANDARD, minTeilnehmende: 5 } });
    expect(erzeugePlan(e).gruppen[0]!.teilnehmende).toHaveLength(5);
  });

  it("meldet fehlende Beschlussfähigkeit nach manueller Änderung", () => {
    const e = eingabe({ faelle: [fall("a")] });
    const plan = erzeugePlan(e);
    plan.gruppen[0]!.teilnehmende.pop();
    expect(fehler(plan, e)[0]!.text).toBe("Die Konferenz ist nicht beschlussfähig: 2 von mindestens 3 Personen.");
  });
});

describe("Aufteilung in Gruppen", () => {
  it("teilt auf, wenn es spürbar Zeit spart, und begründet das", () => {
    const faelle = ["a", "b", "c", "d"].map((id) => fall(id, { dauerMinuten: 30 }));
    const plan = erzeugePlan(eingabe({ faelle }));
    expect(plan.gruppen).toHaveLength(2);
    expect(plan.gruppenBegruendung).toBe(
      "2 Gruppen: Die Konferenz endet 60 Minuten früher (10:00 statt 11:00 Uhr), und beide Gruppen sind beschlussfähig.",
    );
    expect(plan.gruppen.map((g) => g.punkte.length)).toEqual([2, 2]);
    for (const g of plan.gruppen) expect(g.teilnehmende.length).toBeGreaterThanOrEqual(3);
  });

  it("teilt nicht auf, wenn die Ersparnis unter dem Mindestwert liegt", () => {
    const plan = erzeugePlan(eingabe({ faelle: [fall("a", { dauerMinuten: 20 }), fall("b", { dauerMinuten: 20 })] }));
    expect(plan.gruppen).toHaveLength(1);
    expect(plan.gruppenBegruendung).toBe("1 Gruppe: Eine Aufteilung würde nur 20 Minuten sparen (Mindestwert: 30 Minuten).");
  });

  it("teilt nicht auf, wenn für 2 Gruppen zu wenige Personen da sind", () => {
    const abwesend = ["e", "f", "g", "h"].map((id) => ({ personId: id, vonDatum: "2026-11-17", bisDatum: "2026-11-17" }));
    const faelle = ["a", "b", "c", "d"].map((id) => fall(id, { dauerMinuten: 60 }));
    // 4 Fallverantwortliche, keine weiteren Auffüllpersonen: 2 + 2 Personen reichen nicht für je 3
    const plan = erzeugePlan(eingabe({ faelle, abwesenheiten: abwesend }));
    expect(plan.gruppen).toHaveLength(1);
    expect(plan.gruppenBegruendung).toBe("1 Gruppe: Für 2 Gruppen sind nicht genug Personen anwesend (je Gruppe mindestens 3).");
  });

  it("teilt nicht auf, wenn nur eine vorgesetzte Person da ist und beide Gruppen sie bräuchten", () => {
    const faelle = [
      fall("a", { dauerMinuten: 60, vorgesetztErforderlich: true }),
      fall("b", { dauerMinuten: 60, vorgesetztErforderlich: true }),
    ];
    const plan = erzeugePlan(eingabe({ faelle, abwesenheiten: [{ personId: "ver", vonDatum: "2026-11-17", bisDatum: "2026-11-17" }] }));
    expect(plan.gruppen).toHaveLength(1);
    expect(plan.gruppenBegruendung).toMatch(/zweite verfügbare vorgesetzte Person/);
  });

  it("setzt bei 2 Gruppen Leitung und Vertretung ein und begründet die Vertretung", () => {
    const faelle = [
      fall("a", { dauerMinuten: 60, vorgesetztErforderlich: true }),
      fall("b", { dauerMinuten: 60, vorgesetztErforderlich: true }),
    ];
    const plan = erzeugePlan(eingabe({ faelle }));
    expect(plan.gruppen).toHaveLength(2);
    expect(mitglieder(plan, 1)).toContain("lei");
    const ver = plan.gruppen[1]!.teilnehmende.find((t) => t.personId === "ver")!;
    expect(ver.art).toBe("VORGESETZT");
    expect(ver.begruendung).toMatch(/Vertretung, weil Lea Leitung in der anderen Gruppe ist/);
  });

  it("plant Vorgesetzte nur ein, wenn sie erforderlich sind", () => {
    const plan = erzeugePlan(eingabe({ faelle: [fall("a")] }));
    expect(mitglieder(plan, 1)).not.toContain("lei");
    expect(mitglieder(plan, 1)).not.toContain("ver");
  });

  it("teilt auf, wenn eine Gruppe nicht ins Zeitfenster passt", () => {
    const faelle = ["a", "b", "c"].map((id) => fall(id, { dauerMinuten: 50 }));
    const e = eingabe({ faelle, tag: { id: "t1", datum: "2026-11-17", beginn: "09:00", ende: "11:00" }, einstellungen: { ...STANDARD, minErsparnisMinuten: 200 } });
    const plan = erzeugePlan(e);
    expect(plan.gruppen).toHaveLength(2);
    expect(plan.gruppenBegruendung).toMatch(/Zeit bis 11:00 Uhr nicht reichen/);
  });

  it("schlägt überzählige Fälle für den nächsten Termin vor, wenn auch 2 Gruppen nicht reichen", () => {
    const faelle = ["a", "b", "c"].map((id) => fall(id, { dauerMinuten: 70 }));
    const e = eingabe({ faelle, tag: { id: "t1", datum: "2026-11-17", beginn: "09:00", ende: "10:15" } });
    const plan = erzeugePlan(e);
    expect(plan.gruppen.flatMap((g) => g.punkte)).toHaveLength(2);
    expect(plan.nichtEingeplant).toHaveLength(1);
    expect(plan.nichtEingeplant[0]!.fallId).toBe(faelle[2]!.id);
    expect(plan.nichtEingeplant[0]!.grund).toMatch(/Ende 10:15 Uhr/);
    expect(plan.nichtEingeplant[0]!.loesungen[0]).toMatch(/24\. November/);
  });

  it("plant dringende Fälle zuerst ein", () => {
    const faelle = [fall("a"), fall("b", { dringend: true })];
    const plan = erzeugePlan(eingabe({ faelle, einstellungen: { ...STANDARD, minErsparnisMinuten: 60 } }));
    expect(plan.gruppen[0]!.punkte[0]!.fallId).toBe(faelle[1]!.id);
    expect(plan.gruppen[0]!.punkte[0]!.beginn).toBe("09:00");
    expect(plan.gruppen[0]!.punkte[1]!.beginn).toBe("09:30");
  });
});

describe("Dieselbe erforderliche Person bei mehreren Fällen", () => {
  it("legt diese Fälle in dieselbe Gruppe", () => {
    const faelle = [
      fall("a", { dauerMinuten: 45, erforderlichIds: ["h"] }),
      fall("b", { dauerMinuten: 45 }),
      fall("c", { dauerMinuten: 45, erforderlichIds: ["h"] }),
      fall("d", { dauerMinuten: 45 }),
    ];
    const plan = erzeugePlan(eingabe({ faelle }));
    expect(plan.gruppen).toHaveLength(2);
    const gruppeVon = (id: string) => plan.gruppen.find((g) => g.punkte.some((p) => p.fallId === id))!.nummer;
    expect(gruppeVon(faelle[0]!.id)).toBe(gruppeVon(faelle[2]!.id));
    const h = plan.gruppen.flatMap((g) => g.teilnehmende).filter((t) => t.personId === "h");
    expect(h).toHaveLength(1);
    expect(h[0]!.art).toBe("ERFORDERLICH");
    expect(h[0]!.begruendung).toBe(`Als erforderlich angegeben für Fall ${faelle[0]!.kuerzel}, ${faelle[2]!.kuerzel}.`);
  });

  it("hält alle Fälle zusammen, wenn eine Person sie alle verbindet", () => {
    const faelle = [fall("a", { erforderlichIds: ["h"] }), fall("b", { erforderlichIds: ["h"] }), fall("h")];
    const plan = erzeugePlan(eingabe({ faelle }));
    expect(plan.gruppen).toHaveLength(1);
    expect(plan.gruppenBegruendung).toMatch(/gemeinsame Personen/);
  });

  it("meldet, wenn eine Person durch Verschieben in beide Gruppen müsste", () => {
    const faelle = [
      fall("a", { dauerMinuten: 45, erforderlichIds: ["h"] }),
      fall("b", { dauerMinuten: 45 }),
      fall("c", { dauerMinuten: 45, erforderlichIds: ["h"] }),
      fall("d", { dauerMinuten: 45 }),
    ];
    const e = eingabe({ faelle });
    const plan = erzeugePlan(e);
    // Fall c von Hand in die andere Gruppe verschieben
    const quelle = plan.gruppen.find((g) => g.punkte.some((p) => p.fallId === faelle[2]!.id))!;
    const ziel = plan.gruppen.find((g) => g !== quelle)!;
    const punkt = quelle.punkte.find((p) => p.fallId === faelle[2]!.id)!;
    quelle.punkte = quelle.punkte.filter((p) => p !== punkt);
    ziel.punkte.push({ ...punkt, beginn: "09:45", ende: "10:30" });
    const v = pruefePlan(plan, e);
    expect(v.some((x) => x.regel === "PFLICHTPERSON_FEHLT" && x.personId === "h")).toBe(true);
  });
});

describe("Faire Zuweisung und Teilzeit", () => {
  const hist = (personId: string, n: number, art: HistorischeTeilnahme["art"] = "AUFGEFUELLT") =>
    Array.from({ length: n }, (_, i) => ({ personId, datum: "2026-11-03", art, minuten: 60 + i }));

  it("zieht Teilzeitkräfte anteilig seltener heran", () => {
    // Nur b (Vollzeit) und c (50 %) stehen zum Auffüllen zur Verfügung, beide je 1× aufgefüllt
    const personen = [person("a"), person("b"), person("c", { stellenanteil: 0.5 }), person("x", { darfAufgefuelltWerden: false })];
    const e = eingabe({
      personen,
      faelle: [fall("a", { erforderlichIds: [] })],
      historie: [...hist("b", 1), ...hist("c", 1)],
      einstellungen: { ...STANDARD, minTeilnehmende: 2 },
    });
    const plan = erzeugePlan(e);
    const aufgefuellt = plan.gruppen[0]!.teilnehmende.find((t) => t.art === "AUFGEFUELLT")!;
    expect(aufgefuellt.personId).toBe("b"); // Quote 1,0 statt 2,0
    expect(aufgefuellt.begruendung).toBe(
      "Geringste Belastung der verfügbaren Personen: 1,0 Teilnahmen ohne eigenen Fall je Vollzeitstelle (Teamdurchschnitt 0,8).",
    );
  });

  it("wählt die Teilzeitkraft, wenn ihre Quote trotzdem niedriger ist", () => {
    const personen = [person("a"), person("b"), person("c", { stellenanteil: 0.5 })];
    const e = eingabe({
      personen,
      faelle: [fall("a")],
      historie: [...hist("b", 3), ...hist("c", 1)],
      einstellungen: { ...STANDARD, minTeilnehmende: 2 },
    });
    const t = erzeugePlan(e).gruppen[0]!.teilnehmende.find((x) => x.art === "AUFGEFUELLT")!;
    expect(t.personId).toBe("c"); // 1 / 0,5 = 2,0 < 3,0
    expect(t.begruendung).toMatch(/2,0 Teilnahmen ohne eigenen Fall je Vollzeitstelle bei 50 % Stellenanteil/);
  });

  it("berechnet die Quote bezogen auf Stellenanteil und Anwesenheit", () => {
    const personen = [person("b"), person("c", { stellenanteil: 0.5 })];
    const z = berechneFairness({
      personen,
      abwesenheiten: [{ personId: "b", vonDatum: "2026-11-01", bisDatum: "2026-11-05" }],
      teilnahmen: [...hist("b", 1), ...hist("c", 1, "ERFORDERLICH"), ...hist("c", 2, "EIGENER_FALL")],
      alleTermine: ["2026-11-03", "2026-11-10"],
      stichtag: "2026-11-10",
      einstellungen: STANDARD,
    });
    const b = z.find((x) => x.personId === "b")!;
    const c = z.find((x) => x.personId === "c")!;
    expect(b.anwesenheitsanteil).toBe(0.5);
    expect(b.quote).toBe(2); // 1 / (1 × 0,5)
    expect(c.quote).toBe(2); // 1 / (0,5 × 1)
    expect(c.erforderlich).toBe(1);
    expect(c.mitEigenemFall).toBe(2);
  });

  it("zählt nur Teilnahmen im Auswertungszeitraum", () => {
    const z = berechneFairness({
      personen: [person("b")],
      abwesenheiten: [],
      teilnahmen: [{ personId: "b", datum: "2025-01-07", art: "AUFGEFUELLT", minuten: 60 }],
      alleTermine: [],
      stichtag: "2026-11-10",
      einstellungen: STANDARD,
    });
    expect(z[0]!.ohneEigenenFall).toBe(0);
  });

  it("entscheidet bei Gleichstand nach längster Zeit seit der letzten Teilnahme", () => {
    const personen = [person("a"), person("b"), person("c")];
    const e = eingabe({
      personen,
      faelle: [fall("a")],
      historie: [
        { personId: "b", datum: "2026-11-10", art: "AUFGEFUELLT", minuten: 60 },
        { personId: "c", datum: "2026-11-03", art: "AUFGEFUELLT", minuten: 60 },
      ],
      einstellungen: { ...STANDARD, minTeilnehmende: 2 },
    });
    const t = erzeugePlan(e).gruppen[0]!.teilnehmende.find((x) => x.art === "AUFGEFUELLT")!;
    expect(t.personId).toBe("c");
    expect(t.begruendung).toMatch(/am längsten nicht mehr ohne eigenen Fall dabei \(zuletzt am 3\. November\)/);
  });

  it("verteilt über mehrere Wochen gleichmäßig", () => {
    const termine = ["2026-11-03", "2026-11-10", "2026-11-17", "2026-11-24", "2026-12-01", "2026-12-08"];
    const personen = [person("a"), person("b"), person("c"), person("d")];
    let historie: HistorischeTeilnahme[] = [];
    for (const datum of termine) {
      const e = eingabe({
        personen,
        tag: { id: datum, datum, beginn: "09:00" },
        faelle: [fall("a", { wunsch: { art: "tag", datum } })],
        historie,
        alleTermine: termine,
      });
      historie = [...historie, ...teilnahmenAusPlan(erzeugePlan(e))];
    }
    const z = berechneFairness({ personen, abwesenheiten: [], teilnahmen: historie, alleTermine: termine, stichtag: "2026-12-08", einstellungen: STANDARD });
    expect(z.filter((x) => x.personId !== "a").map((x) => x.aufgefuellt)).toEqual([4, 4, 4]);
  });
});

describe("Eigener Fall in der Sitzung", () => {
  it("füllt nicht mit Personen auf, die einen eigenen Fall in der Sitzung haben", () => {
    // a und b haben eigene Fälle, sind aber in der Historie am wenigsten belastet
    const historie = ["c", "d", "e", "f", "g", "h"].map((id) => ({ personId: id, datum: "2026-11-10", art: "AUFGEFUELLT" as const, minuten: 60 }));
    const plan = erzeugePlan(eingabe({ faelle: [fall("a"), fall("b")], historie, einstellungen: { ...STANDARD, minErsparnisMinuten: 60 } }));
    const g = plan.gruppen[0]!;
    expect(g.teilnehmende.filter((t) => t.art === "EIGENER_FALL").map((t) => t.personId).sort()).toEqual(["a", "b"]);
    expect(g.teilnehmende.filter((t) => t.art === "AUFGEFUELLT")).toHaveLength(1);
    expect(g.teilnehmende).toHaveLength(3);
  });

  it("zählt die verantwortliche Person zur Mindestzahl", () => {
    const plan = erzeugePlan(eingabe({ faelle: [fall("a", { erforderlichIds: ["b", "c"] })] }));
    expect(plan.gruppen[0]!.teilnehmende.map((t) => t.art).sort()).toEqual(["EIGENER_FALL", "ERFORDERLICH", "ERFORDERLICH"]);
  });

  it("wertet eigene Fälle in der Statistik getrennt", () => {
    const plan = erzeugePlan(eingabe({ faelle: [fall("a", { erforderlichIds: ["b"] })] }));
    const z = berechneFairness({ personen: team(), abwesenheiten: [], teilnahmen: teilnahmenAusPlan(plan), alleTermine: ["2026-11-17"], stichtag: "2026-11-17", einstellungen: STANDARD });
    expect(z.find((x) => x.personId === "a")).toMatchObject({ mitEigenemFall: 1, ohneEigenenFall: 0 });
    expect(z.find((x) => x.personId === "b")).toMatchObject({ mitEigenemFall: 0, erforderlich: 1, ohneEigenenFall: 1 });
  });
});

describe("Nachträgliche Planänderung", () => {
  it("korrigiert die Statistik, wenn eine aufgefüllte Person ersetzt wird", () => {
    const e = eingabe({ faelle: [fall("a")] });
    const plan = erzeugePlan(e);
    const vorher = berechneFairness({ personen: e.personen, abwesenheiten: [], teilnahmen: teilnahmenAusPlan(plan), alleTermine: e.alleTermine, stichtag: "2026-11-17", einstellungen: STANDARD });
    const ersetzt = plan.gruppen[0]!.teilnehmende.find((t) => t.art === "AUFGEFUELLT")!;
    expect(vorher.find((z) => z.personId === ersetzt.personId)!.aufgefuellt).toBe(1);

    // Planung tauscht die Person gegen h aus
    const geaendert: PlanEntwurf = structuredClone(plan);
    const g = geaendert.gruppen[0]!;
    g.teilnehmende = g.teilnehmende.filter((t) => t.personId !== ersetzt.personId);
    g.teilnehmende.push({ personId: "h", art: "AUFGEFUELLT", begruendung: "", manuell: true });
    const norm = normalisiereTeilnahmen(geaendert, e);
    expect(fehler(norm, e)).toEqual([]);
    const nachher = berechneFairness({ personen: e.personen, abwesenheiten: [], teilnahmen: teilnahmenAusPlan(norm), alleTermine: e.alleTermine, stichtag: "2026-11-17", einstellungen: STANDARD });
    expect(nachher.find((z) => z.personId === ersetzt.personId)!.aufgefuellt).toBe(0);
    expect(nachher.find((z) => z.personId === "h")!.aufgefuellt).toBe(1);
    expect(norm.gruppen[0]!.teilnehmende.find((t) => t.personId === "h")!.begruendung).toBe("Von der Planung von Hand hinzugefügt.");
  });

  it("passt die Teilnahmeart an, wenn ein Fall in eine andere Gruppe verschoben wird", () => {
    const faelle = ["a", "b", "c", "d"].map((id) => fall(id));
    const e = eingabe({ faelle });
    const plan = structuredClone(erzeugePlan(e));
    const [g1, g2] = plan.gruppen as [typeof plan.gruppen[0], typeof plan.gruppen[0]];
    const punkt = g1.punkte.pop()!;
    g2.punkte.push({ ...punkt, beginn: "10:00", ende: "10:30" });
    // Die verantwortliche Person wechselt mit
    const owner = faelle.find((f) => f.id === punkt.fallId)!.verantwortlichId;
    g1.teilnehmende = g1.teilnehmende.filter((t) => t.personId !== owner);
    g2.teilnehmende.push({ personId: owner, art: "AUFGEFUELLT", begruendung: "", manuell: true });
    const norm = normalisiereTeilnahmen(plan, e);
    expect(norm.gruppen[1]!.teilnehmende.find((t) => t.personId === owner)!.art).toBe("EIGENER_FALL");
    // Gruppe 1 hat jetzt nur noch 2 Personen → nicht beschlussfähig
    expect(fehler(norm, e).map((v) => v.regel)).toContain("BESCHLUSSFAEHIGKEIT");
  });
});

describe("Determinismus", () => {
  it("liefert bei gleicher Eingabe in anderer Reihenfolge denselben Plan", () => {
    const faelle = [
      fall("a", { dauerMinuten: 40 }), fall("b", { dauerMinuten: 25, erforderlichIds: ["c"] }),
      fall("d", { dauerMinuten: 60, vorgesetztErforderlich: true }), fall("e", { dauerMinuten: 35 }),
      fall("f", { dauerMinuten: 20, dringend: true }),
    ];
    const historie = [{ personId: "g", datum: "2026-11-10", art: "AUFGEFUELLT" as const, minuten: 60 }];
    const e1 = eingabe({ faelle, historie });
    const e2 = eingabe({ faelle: [...faelle].reverse(), historie, personen: [...team()].reverse() });
    expect(erzeugePlan(e2)).toEqual(erzeugePlan(e1));
    expect(erzeugePlan(e1)).toEqual(erzeugePlan(e1));
  });
});
