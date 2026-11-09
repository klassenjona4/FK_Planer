import type { ZodError } from "zod";

/** Zod-Fehler in { feld: "verständlicher Text" } umwandeln (erster Fehler je Feld). */
export function fehlerAusZod(e: ZodError): Record<string, string> {
  const fehler: Record<string, string> = {};
  for (const f of e.issues) {
    const feld = String(f.path[0] ?? "allgemein");
    if (!fehler[feld]) fehler[feld] = f.message;
  }
  return fehler;
}

export function text(form: FormData, feld: string): string {
  return String(form.get(feld) ?? "").trim();
}
