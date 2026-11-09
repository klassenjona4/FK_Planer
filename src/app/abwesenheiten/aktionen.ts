"use server";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, schema as s } from "@/db";
import type { FormZustand } from "@/components/Formular";
import { brauchtAnmeldung, istPlanung } from "@/lib/auth";
import { ladePersonen } from "@/lib/daten";
import { fehlerAusZod, text } from "@/lib/formular";
import { datumZahl } from "@/planung";

const uhrzeit = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Bitte eine Uhrzeit im Format 08:30 eingeben.");

const schema = z
  .object({
    person: z.string().uuid("Bitte wählen Sie eine Person aus."),
    von: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Bitte geben Sie das erste Datum der Abwesenheit ein."),
    bis: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Bitte geben Sie das letzte Datum der Abwesenheit ein."),
    vonUhrzeit: uhrzeit.optional(),
    bisUhrzeit: uhrzeit.optional(),
  })
  .superRefine((w, ctx) => {
    if (w.von > w.bis) ctx.addIssue({ code: "custom", path: ["bis"], message: "Das Ende liegt vor dem Beginn der Abwesenheit." });
    if (w.von === w.bis && w.vonUhrzeit && w.bisUhrzeit && w.vonUhrzeit >= w.bisUhrzeit) {
      ctx.addIssue({ code: "custom", path: ["bisUhrzeit"], message: "Die Uhrzeit „bis“ muss nach „ab“ liegen." });
    }
  });

export async function abwesenheitEintragenAktion(vorher: FormZustand, form: FormData): Promise<FormZustand> {
  const konto = await brauchtAnmeldung();
  const stundenweise = form.get("stundenweise") === "ja";
  const roh = schema.safeParse({
    person: istPlanung(konto) ? text(form, "person") : konto.personId,
    von: text(form, "von"),
    bis: text(form, "bis") || text(form, "von"),
    vonUhrzeit: stundenweise ? text(form, "vonUhrzeit") || undefined : undefined,
    bisUhrzeit: stundenweise ? text(form, "bisUhrzeit") || undefined : undefined,
  });
  if (!roh.success) return { fehler: fehlerAusZod(roh.error), runde: vorher.runde };
  const d = roh.data;
  if (stundenweise && !d.vonUhrzeit && !d.bisUhrzeit) {
    return { fehler: { vonUhrzeit: "Bitte geben Sie mindestens eine Uhrzeit an oder entfernen Sie das Häkchen „nur stundenweise“." }, runde: vorher.runde };
  }
  const personen = await ladePersonen(konto.teamId);
  if (!personen.some((p) => p.id === d.person)) return { fehler: { person: "Diese Person gehört nicht zum Team." }, runde: vorher.runde };
  await db.insert(s.abwesenheit).values({
    teamId: konto.teamId,
    personId: d.person,
    vonDatum: d.von,
    bisDatum: d.bis,
    vonUhrzeit: d.vonUhrzeit ?? null,
    bisUhrzeit: d.bisUhrzeit ?? null,
  });
  revalidatePath("/abwesenheiten");
  const zeitraum = d.von === d.bis ? `am ${datumZahl(d.von)}` : `vom ${datumZahl(d.von)} bis ${datumZahl(d.bis)}`;
  return { erfolg: `Abwesenheit ${zeitraum} wurde eingetragen.`, runde: (vorher.runde ?? 0) + 1 };
}

export async function abwesenheitLoeschenAktion(id: string): Promise<void> {
  const konto = await brauchtAnmeldung();
  const bedingung = istPlanung(konto)
    ? and(eq(s.abwesenheit.id, id), eq(s.abwesenheit.teamId, konto.teamId))
    : and(eq(s.abwesenheit.id, id), eq(s.abwesenheit.teamId, konto.teamId), eq(s.abwesenheit.personId, konto.personId));
  await db.delete(s.abwesenheit).where(bedingung);
  revalidatePath("/abwesenheiten");
}
