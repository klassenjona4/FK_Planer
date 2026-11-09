import { describe, expect, it } from "vitest";
import { bearbeiten, erzeugePlan, pruefePlan, teilnahmenAusPlan, berechneFairness } from "./index";
import { STANDARD, eingabe, fall } from "./testdaten";

const fehler = (p: ReturnType<typeof erzeugePlan>, e: ReturnType<typeof eingabe>) => pruefePlan(p, e).filter((v) => v.schwere === "fehler");

describe("Manuelle Bearbeitung", () => {
  it("verschiebt einen Fall samt Pflichtpersonen in die andere Gruppe und setzt die Uhrzeiten neu", () => {
    const faelle = ["a", "b", "c", "d"].map((id) => fall(id, { dauerMinuten: 30 }));
    const e = eingabe({ faelle });
    const plan = erzeugePlan(e);
    const f = plan.gruppen[0]!.punkte[1]!.fallId;
    const owner = faelle.find((x) => x.id === f)!.verantwortlichId;
    const neu = bearbeiten.verschiebeFall(plan, e, f, 2);
    expect(neu.gruppen[1]!.punkte.map((p) => p.fallId)).toContain(f);
    expect(neu.gruppen[1]!.punkte.at(-1)!.beginn).toBe("10:00");
    expect(neu.gruppen[1]!.teilnehmende.find((t) => t.personId === owner)!.art).toBe("EIGENER_FALL");
    expect(neu.gruppen[0]!.teilnehmende.some((t) => t.personId === owner)).toBe(false);
    // Gruppe 1 hat jetzt nur noch 2 Personen → Hinweis, dann fair auffüllen
    expect(fehler(neu, e).map((v) => v.regel)).toContain("BESCHLUSSFAEHIGKEIT");
    const aufgefuellt = bearbeiten.fuelleFehlendeAuf(neu, e);
    expect(fehler(aufgefuellt, e)).toEqual([]);
  });

  it("legt Gruppen zusammen und rechnet die Fairness neu", () => {
    const faelle = ["a", "b", "c", "d"].map((id) => fall(id, { dauerMinuten: 30 }));
    const e = eingabe({ faelle });
    const plan = erzeugePlan(e);
    const vorher = teilnahmenAusPlan(plan).filter((t) => t.art === "AUFGEFUELLT").length;
    const eins = bearbeiten.gruppenZusammenlegen(plan, e);
    expect(eins.gruppen).toHaveLength(1);
    expect(eins.gruppen[0]!.punkte.at(-1)!.ende).toBe("11:00");
    expect(fehler(eins, e)).toEqual([]);
    const z = berechneFairness({ personen: e.personen, abwesenheiten: [], teilnahmen: teilnahmenAusPlan(eins), alleTermine: e.alleTermine, stichtag: "2026-11-17", einstellungen: STANDARD });
    expect(z.reduce((s, x) => s + x.aufgefuellt, 0)).toBe(vorher);
  });

  it("nimmt einen Fall heraus und wieder auf", () => {
    const f = fall("a");
    const e = eingabe({ faelle: [f, fall("b")], einstellungen: { ...STANDARD, minErsparnisMinuten: 60 } });
    const plan = erzeugePlan(e);
    const raus = bearbeiten.nimmFallHeraus(plan, e, f.id);
    expect(raus.nichtEingeplant.map((n) => n.fallId)).toEqual([f.id]);
    expect(raus.gruppen[0]!.teilnehmende.some((t) => t.personId === "a")).toBe(false);
    const rein = bearbeiten.nimmFallAuf(raus, e, f.id, 1);
    expect(rein.nichtEingeplant).toEqual([]);
    expect(rein.gruppen[0]!.teilnehmende.find((t) => t.personId === "a")!.art).toBe("EIGENER_FALL");
  });

  it("ändert Reihenfolge und Uhrzeit", () => {
    const [f1, f2] = [fall("a"), fall("b")];
    const e = eingabe({ faelle: [f1!, f2!], einstellungen: { ...STANDARD, minErsparnisMinuten: 60 } });
    const plan = erzeugePlan(e);
    const getauscht = bearbeiten.bewegeInGruppe(plan, e, f2!.id, -1);
    expect(getauscht.gruppen[0]!.punkte.map((p) => p.fallId)).toEqual([f2!.id, f1!.id]);
    const spaeter = bearbeiten.setzeBeginn(getauscht, e, f1!.id, "09:15");
    expect(pruefePlan(spaeter, e).some((v) => v.regel === "UEBERSCHNEIDUNG")).toBe(true);
  });
});
