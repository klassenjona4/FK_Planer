import { describe, expect, it } from "vitest";
import { erzeugeIcs } from "./ics";

describe(".ics-Export", () => {
  it("erzeugt gültige Termine in Berliner Zeit mit maskierten Zeichen", () => {
    const ics = erzeugeIcs(
      [{ uid: "a@fk", datum: "2026-11-17", beginn: "09:00", ende: "10:15", titel: "Fachkonferenz, Gruppe 1", beschreibung: "Fälle: M-17; K-3", ort: "Raum 2.14" }],
      "Test",
    );
    expect(ics).toContain("DTSTART;TZID=Europe/Berlin:20261117T090000");
    expect(ics).toContain("DTEND;TZID=Europe/Berlin:20261117T101500");
    expect(ics).toContain("SUMMARY:Fachkonferenz\\, Gruppe 1");
    expect(ics).toContain("DESCRIPTION:Fälle: M-17\; K-3");
    expect(ics.split("\r\n").every((z) => new TextEncoder().encode(z).length <= 75)).toBe(true);
  });
});
