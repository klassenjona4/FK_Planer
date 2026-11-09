import { aktuellesKonto } from "@/lib/auth";
import { ladeEigeneTermine, ladeFaelle, ladePersonen, ladePlan, ladeTermin } from "@/lib/daten";
import { eigenerTerminAlsIcs, gruppenAlsIcs } from "@/lib/export";
import { fallInfos, namensListe } from "@/lib/fallinfo";
import { erzeugeIcs, icsAntwort } from "@/lib/ics";

export async function GET(req: Request, { params }: { params: Promise<{ tagId: string }> }) {
  const konto = await aktuellesKonto();
  if (!konto) return new Response("Bitte melden Sie sich an.", { status: 401 });
  const { tagId } = await params;
  const tag = await ladeTermin(konto.teamId, tagId);
  const plan = tag ? await ladePlan(konto.teamId, tagId) : null;
  if (!tag || plan?.status !== "VEROEFFENTLICHT") return new Response("Der Plan ist nicht veröffentlicht.", { status: 404 });

  const alle = new URL(req.url).searchParams.get("alle") === "1" && konto.rolle === "PLANUNG";
  if (alle) {
    const [faelle, personen] = await Promise.all([ladeFaelle(konto.teamId, false), ladePersonen(konto.teamId)]);
    const termine = gruppenAlsIcs(tagId, plan.entwurf, fallInfos(faelle, personen), namensListe(personen), [tag.raum1, tag.raum2]);
    return icsAntwort(erzeugeIcs(termine, "Fachkonferenz"), `fachkonferenz-${tag.datum}.ics`);
  }
  const eigene = (await ladeEigeneTermine(konto.teamId, konto.personId)).filter((t) => t.tagId === tagId);
  return icsAntwort(erzeugeIcs(eigene.map((t) => eigenerTerminAlsIcs(t, konto.personId)), "Meine Fachkonferenzen"), `meine-fachkonferenz-${tag.datum}.ics`);
}
