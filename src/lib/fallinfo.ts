import "server-only";
import type { FallInfo } from "@/components/PlanAnsicht";
import { personName, type Fall, type Person } from "@/planung";

export function fallInfos(faelle: Fall[], personen: Person[]): Record<string, FallInfo> {
  const namen = new Map(personen.map((p) => [p.id, personName(p)]));
  return Object.fromEntries(
    faelle.map((f) => [
      f.id,
      {
        kuerzel: f.kuerzel,
        dauer: f.dauerMinuten,
        verantwortlichId: f.verantwortlichId,
        verantwortlich: namen.get(f.verantwortlichId) ?? "?",
        dringend: f.dringend,
        vorgesetzt: f.vorgesetztErforderlich,
      },
    ]),
  );
}

export function namensListe(personen: Person[]): Record<string, string> {
  return Object.fromEntries(personen.map((p) => [p.id, personName(p)]));
}
