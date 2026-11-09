import "server-only";
import { ART_TEXT } from "@/components/PlanAnsicht";
import type { IcsTermin } from "./ics";
import type { EigenerTermin } from "./daten";
import { datumLang, gruppenSpanne, zuUhrzeit, type PlanEntwurf } from "@/planung";
import type { FallInfo } from "@/components/PlanAnsicht";

export function eigenerTerminAlsIcs(t: EigenerTermin, personId: string): IcsTermin {
  return {
    uid: `${t.tagId}-${t.gruppe}-${personId}@fk-planer`,
    datum: t.datum,
    beginn: t.beginn,
    ende: t.ende,
    titel: t.gruppenAnzahl > 1 ? `Fachkonferenz – Gruppe ${t.gruppe}` : "Fachkonferenz",
    beschreibung:
      `Ihre Rolle: ${ART_TEXT[t.art as keyof typeof ART_TEXT]}\n${t.begruendung}\n\nFälle:\n` +
      t.faelle.map((f) => `${f.beginn}–${f.ende} ${f.kuerzel}${f.eigener ? " (Ihr Fall)" : ""}`).join("\n"),
    ort: t.raum,
  };
}

export function gruppenAlsIcs(tagId: string, plan: PlanEntwurf, faelle: Record<string, FallInfo>, namen: Record<string, string>, raeume: Array<string | null>): IcsTermin[] {
  return plan.gruppen.flatMap((g) => {
    const s = gruppenSpanne(g);
    if (!s) return [];
    return [{
      uid: `${tagId}-${g.nummer}@fk-planer`,
      datum: plan.datum,
      beginn: zuUhrzeit(s.von),
      ende: zuUhrzeit(s.bis),
      titel: plan.gruppen.length > 1 ? `Fachkonferenz – Gruppe ${g.nummer}` : "Fachkonferenz",
      beschreibung:
        `Fachkonferenz am ${datumLang(plan.datum)}\n\nFälle:\n` +
        g.punkte.map((p) => `${p.beginn}–${p.ende} ${faelle[p.fallId]?.kuerzel ?? "?"} (${faelle[p.fallId]?.verantwortlich ?? "?"})`).join("\n") +
        `\n\nTeilnehmende:\n` + g.teilnehmende.map((t) => `${namen[t.personId]} (${ART_TEXT[t.art]})`).join("\n"),
      ort: raeume[g.nummer - 1],
    }];
  });
}
