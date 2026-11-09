"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { brauchtPlanung } from "@/lib/auth";
import { ladePlan, ladePlanungsEingabe, speicherePlan, veroeffentlichePlan } from "@/lib/daten";
import { erzeugePlan, pruefePlan, type PlanEntwurf } from "@/planung";

export interface PlanAktionErgebnis {
  ok: boolean;
  meldung: string;
}

const uhr = z.string().regex(/^\d{2}:\d{2}$/);
const entwurfSchema = z.object({
  tagId: z.string().uuid(),
  datum: z.string(),
  gruppenBegruendung: z.string().max(1000),
  hinweise: z.array(z.string().max(1000)).max(50),
  nichtEingeplant: z
    .array(z.object({ fallId: z.string().uuid(), grund: z.string().max(1000), loesungen: z.array(z.string().max(1000)).max(10), vorgemerktFuer: z.string().optional() }))
    .max(200),
  gruppen: z
    .array(
      z.object({
        nummer: z.number().int().min(1).max(2),
        punkte: z.array(z.object({ fallId: z.string().uuid(), beginn: uhr, ende: uhr })).max(100),
        teilnehmende: z
          .array(
            z.object({
              personId: z.string().uuid(),
              art: z.enum(["EIGENER_FALL", "ERFORDERLICH", "VORGESETZT", "AUFGEFUELLT"]),
              begruendung: z.string().max(1000),
              manuell: z.boolean().optional(),
            }),
          )
          .max(100),
      }),
    )
    .max(2),
});

export async function planErzeugenAktion(tagId: string): Promise<PlanAktionErgebnis> {
  const konto = await brauchtPlanung();
  const eingabe = await ladePlanungsEingabe(konto.teamId, tagId);
  if (!eingabe) return { ok: false, meldung: "Diesen Konferenztermin gibt es nicht." };
  const entwurf = erzeugePlan(eingabe);
  await speicherePlan({ teamId: konto.teamId, kontoId: konto.kontoId, entwurf, eingabe, aktion: "ERZEUGT" });
  revalidatePath(`/plan/${tagId}`);
  revalidatePath("/plan");
  const n = entwurf.gruppen.reduce((s, g) => s + g.punkte.length, 0);
  return {
    ok: true,
    meldung: n > 0
      ? `Der Plan wurde erzeugt: ${n} ${n === 1 ? "Fall" : "Fälle"} in ${entwurf.gruppen.length} ${entwurf.gruppen.length === 1 ? "Gruppe" : "Gruppen"}. Bitte prüfen Sie den Entwurf.`
      : "Es konnte kein Fall eingeplant werden. Die Gründe stehen unten.",
  };
}

export async function planSpeichernAktion(tagId: string, json: string, kommentar: string): Promise<PlanAktionErgebnis> {
  const konto = await brauchtPlanung();
  let roh: unknown;
  try {
    roh = JSON.parse(json);
  } catch {
    return { ok: false, meldung: "Der Plan konnte nicht gelesen werden. Bitte laden Sie die Seite neu." };
  }
  const geprueft = entwurfSchema.safeParse(roh);
  if (!geprueft.success || geprueft.data.tagId !== tagId) {
    return { ok: false, meldung: "Der Plan enthält ungültige Angaben. Bitte laden Sie die Seite neu." };
  }
  const eingabe = await ladePlanungsEingabe(konto.teamId, tagId);
  if (!eingabe) return { ok: false, meldung: "Diesen Konferenztermin gibt es nicht." };
  try {
    const { beschreibung } = await speicherePlan({
      teamId: konto.teamId,
      kontoId: konto.kontoId,
      entwurf: { ...(geprueft.data as PlanEntwurf), datum: eingabe.tag.datum },
      eingabe,
      aktion: "GEAENDERT",
      kommentar: kommentar.trim().slice(0, 300) || undefined,
    });
    revalidatePath(`/plan/${tagId}`);
    return { ok: true, meldung: beschreibung.length ? `Gespeichert. ${beschreibung.length} Änderung(en) wurden übernommen.` : "Gespeichert." };
  } catch (e) {
    return { ok: false, meldung: e instanceof Error ? e.message : "Speichern fehlgeschlagen." };
  }
}

export async function planVeroeffentlichenAktion(tagId: string, trotzFehlern: boolean): Promise<PlanAktionErgebnis> {
  const konto = await brauchtPlanung();
  const [plan, eingabe] = await Promise.all([ladePlan(konto.teamId, tagId), ladePlanungsEingabe(konto.teamId, tagId)]);
  if (!plan || !eingabe) return { ok: false, meldung: "Es gibt noch keinen Plan für diesen Termin." };
  if (plan.status === "VEROEFFENTLICHT") return { ok: false, meldung: "Der Plan ist bereits veröffentlicht." };
  const fehler = pruefePlan(plan.entwurf, eingabe).filter((v) => v.schwere === "fehler");
  if (fehler.length > 0 && !trotzFehlern) {
    return { ok: false, meldung: `Der Plan hat noch ${fehler.length} Regelverstoß/-verstöße. Bitte beheben oder ausdrücklich bestätigen.` };
  }
  await veroeffentlichePlan(konto.teamId, konto.kontoId, tagId);
  revalidatePath(`/plan/${tagId}`);
  revalidatePath("/plan");
  return { ok: true, meldung: "Der Plan ist veröffentlicht. Alle Teammitglieder sehen ihn jetzt unter „Plan“ und „Meine Termine“." };
}
