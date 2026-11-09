import "server-only";
import { datumLang, wochentag } from "@/planung";
import { heute } from "./zeit-server";

/** Kommende Konferenztermine als Auswahlliste */
export function terminAuswahl(termine: Array<{ id: string; datum: string; beginn: string; ende: string | null }>) {
  const h = heute();
  return termine
    .filter((t) => t.datum >= h)
    .map((t) => ({ id: t.id, text: `${datumLang(t.datum)}, ab ${t.beginn} Uhr` }));
}

export function istDienstag(datum: string): boolean {
  return wochentag(datum) === "Dienstag";
}
