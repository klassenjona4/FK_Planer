import { describe, expect, it } from "vitest";
import { beschreibeAenderungen } from "./aenderungen";
import type { PlanEntwurf } from "@/planung";

const basis = (): PlanEntwurf => ({
  tagId: "t", datum: "2026-11-17", gruppenBegruendung: "", hinweise: [], nichtEingeplant: [],
  gruppen: [
    { nummer: 1, punkte: [{ fallId: "f1", beginn: "09:00", ende: "09:30" }], teilnehmende: [{ personId: "a", art: "EIGENER_FALL", begruendung: "" }, { personId: "b", art: "AUFGEFUELLT", begruendung: "" }] },
    { nummer: 2, punkte: [{ fallId: "f2", beginn: "09:00", ende: "09:30" }], teilnehmende: [{ personId: "c", art: "EIGENER_FALL", begruendung: "" }] },
  ],
});

describe("Änderungsverlauf", () => {
  it("beschreibt verschobene Fälle und getauschte Personen verständlich", () => {
    const neu = basis();
    neu.gruppen[1]!.punkte.push({ fallId: "f1", beginn: "09:35", ende: "10:05" });
    neu.gruppen[0]!.punkte = [];
    neu.gruppen[0]!.teilnehmende = [{ personId: "d", art: "AUFGEFUELLT", begruendung: "" }];
    const s = beschreibeAenderungen(basis(), neu, (id) => id.toUpperCase(), (id) => `K-${id}`);
    expect(s).toEqual([
      "Fall K-f1 von Gruppe 1 nach Gruppe 2 verschoben.",
      "D zu Gruppe 1 hinzugefügt.",
      "A aus Gruppe 1 entfernt.",
      "B aus Gruppe 1 entfernt.",
    ]);
  });
});
