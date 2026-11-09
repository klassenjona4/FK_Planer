import type { PlanEntwurf } from "@/planung";

/**
 * Beschreibt die Unterschiede zwischen zwei Planständen in kurzen deutschen Sätzen
 * (für den Änderungsverlauf). Reine Funktion, damit sie testbar ist.
 */
export function beschreibeAenderungen(
  alt: PlanEntwurf,
  neu: PlanEntwurf,
  name: (personId: string) => string,
  kuerzel: (fallId: string) => string,
): string[] {
  const s: string[] = [];
  if (alt.gruppen.length !== neu.gruppen.length) {
    s.push(`Gruppenzahl von ${alt.gruppen.length} auf ${neu.gruppen.length} geändert.`);
  }

  const fallOrt = (p: PlanEntwurf) => {
    const m = new Map<string, { gruppe: number; beginn: string; ende: string }>();
    for (const g of p.gruppen) for (const pt of g.punkte) m.set(pt.fallId, { gruppe: g.nummer, beginn: pt.beginn, ende: pt.ende });
    return m;
  };
  const fa = fallOrt(alt);
  const fn = fallOrt(neu);
  for (const [id, n] of fn) {
    const a = fa.get(id);
    if (!a) s.push(`Fall ${kuerzel(id)} hinzugefügt (Gruppe ${n.gruppe}, ${n.beginn}–${n.ende} Uhr).`);
    else if (a.gruppe !== n.gruppe) s.push(`Fall ${kuerzel(id)} von Gruppe ${a.gruppe} nach Gruppe ${n.gruppe} verschoben.`);
    else if (a.beginn !== n.beginn || a.ende !== n.ende) {
      s.push(`Fall ${kuerzel(id)}: Uhrzeit von ${a.beginn}–${a.ende} auf ${n.beginn}–${n.ende} Uhr geändert.`);
    }
  }
  for (const id of fa.keys()) if (!fn.has(id)) s.push(`Fall ${kuerzel(id)} aus dem Plan genommen.`);

  const personOrt = (p: PlanEntwurf) => {
    const m = new Map<string, number[]>();
    for (const g of p.gruppen) for (const t of g.teilnehmende) m.set(t.personId, [...(m.get(t.personId) ?? []), g.nummer]);
    return m;
  };
  const pa = personOrt(alt);
  const pn = personOrt(neu);
  for (const [id, gs] of pn) {
    const vorher = pa.get(id) ?? [];
    for (const g of gs) if (!vorher.includes(g)) s.push(`${name(id)} zu Gruppe ${g} hinzugefügt.`);
  }
  for (const [id, gs] of pa) {
    const nachher = pn.get(id) ?? [];
    for (const g of gs) if (!nachher.includes(g)) s.push(`${name(id)} aus Gruppe ${g} entfernt.`);
  }
  return s;
}
