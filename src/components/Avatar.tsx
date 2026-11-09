/** Kreis mit Initialen. Farben haben mindestens 4,5:1 Kontrast zu weißer Schrift. */
const FARBEN = ["#c2410c", "#7c3aed", "#2563eb", "#0f766e", "#be185d", "#4d7c0f", "#b45309", "#0e7490", "#9333ea", "#b91c1c"];

export function initialen(name: string): string {
  const teile = name.trim().split(/\s+/);
  return ((teile[0]?.[0] ?? "") + (teile.length > 1 ? teile.at(-1)![0] : "")).toUpperCase();
}

function farbe(name: string): string {
  let h = 0;
  for (const z of name) h = (h * 31 + z.charCodeAt(0)) >>> 0;
  return FARBEN[h % FARBEN.length]!;
}

export function Avatar({ name, groesse }: { name: string; groesse?: "klein" | "gross" }) {
  return (
    <span className={`avatar${groesse ? " avatar-" + groesse : ""}`} style={{ background: farbe(name) }} aria-hidden="true">
      {initialen(name)}
    </span>
  );
}
