import { aktuellesKonto } from "@/lib/auth";
import { ladeEigeneTermine } from "@/lib/daten";
import { eigenerTerminAlsIcs } from "@/lib/export";
import { erzeugeIcs, icsAntwort } from "@/lib/ics";
import { heute } from "@/lib/zeit-server";

export async function GET() {
  const konto = await aktuellesKonto();
  if (!konto) return new Response("Bitte melden Sie sich an.", { status: 401 });
  const termine = await ladeEigeneTermine(konto.teamId, konto.personId, heute());
  return icsAntwort(erzeugeIcs(termine.map((t) => eigenerTerminAlsIcs(t, konto.personId)), "Meine Fachkonferenzen"), "meine-fachkonferenzen.ics");
}
