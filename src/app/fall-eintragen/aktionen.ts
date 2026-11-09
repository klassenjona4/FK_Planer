"use server";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db, schema } from "@/db";
import type { FormZustand } from "@/components/Formular";
import { brauchtAnmeldung, istPlanung, type Angemeldet } from "@/lib/auth";
import { ladePersonen, ladeTermine } from "@/lib/daten";
import { fehlerAusZod, text } from "@/lib/formular";
import { heute } from "@/lib/zeit-server";
import { datumKurz } from "@/planung";

const s = schema;

const fallSchema = z
  .object({
    verantwortlich: z.string().uuid("Bitte wählen Sie die fallverantwortliche Person aus."),
    fallkuerzel: z
      .string()
      .min(1, "Bitte geben Sie ein Fallkürzel ein.")
      .max(15, "Das Fallkürzel darf höchstens 15 Zeichen lang sein.")
      .regex(/^[A-Za-z0-9ÄÖÜäöü\-_/.]+$/, "Das Fallkürzel darf nur Buchstaben, Ziffern und die Zeichen - _ / . enthalten, keine Leerzeichen.")
      .regex(/\d/, "Das Fallkürzel muss mindestens eine Ziffer enthalten (zum Beispiel M-17). So werden Namen sicher vermieden."),
    dauer: z.coerce
      .number({ message: "Bitte geben Sie die Dauer in Minuten als Zahl ein." })
      .int("Bitte geben Sie ganze Minuten ein.")
      .min(5, "Die Dauer muss mindestens 5 Minuten betragen.")
      .max(240, "Die Dauer darf höchstens 240 Minuten betragen."),
    wunschArt: z.enum(["tag", "zeitraum"], { message: "Bitte wählen Sie, ob Sie einen bestimmten Dienstag oder einen Zeitraum wünschen." }),
    termin: z.string().optional(),
    von: z.string().optional(),
    bis: z.string().optional(),
    vorgesetzt: z.enum(["ja", "nein"], { message: "Bitte geben Sie an, ob die vorgesetzte Person dabei sein muss." }),
    erforderlich: z.array(z.string().uuid()),
    dringend: z.boolean(),
    notiz: z.string().max(200, "Die Notiz darf höchstens 200 Zeichen lang sein."),
  })
  .superRefine((w, ctx) => {
    if (w.wunschArt === "tag" && !w.termin) ctx.addIssue({ code: "custom", path: ["termin"], message: "Bitte wählen Sie einen Dienstag aus." });
    if (w.wunschArt === "zeitraum") {
      if (!w.von) ctx.addIssue({ code: "custom", path: ["von"], message: "Bitte geben Sie an, ab wann der Fall besprochen werden kann." });
      if (!w.bis) ctx.addIssue({ code: "custom", path: ["bis"], message: "Bitte geben Sie an, bis wann der Fall spätestens besprochen werden soll." });
      if (w.von && w.bis && w.von > w.bis) ctx.addIssue({ code: "custom", path: ["bis"], message: "Das Datum „spätestens“ liegt vor „frühestens“." });
    }
  });

type Daten = z.infer<typeof fallSchema>;

function lese(form: FormData, konto: Angemeldet) {
  return {
    verantwortlich: istPlanung(konto) ? text(form, "verantwortlich") : konto.personId,
    fallkuerzel: text(form, "fallkuerzel"),
    dauer: text(form, "dauer"),
    wunschArt: text(form, "wunschArt") || undefined,
    termin: text(form, "termin") || undefined,
    von: text(form, "von") || undefined,
    bis: text(form, "bis") || undefined,
    vorgesetzt: text(form, "vorgesetzt") || undefined,
    erforderlich: form.getAll("erforderlich").map(String),
    dringend: form.get("dringend") === "ja",
    notiz: text(form, "notiz"),
  };
}

async function pruefeUndBereite(konto: Angemeldet, form: FormData): Promise<
  { ok: false; zustand: FormZustand } | { ok: true; d: Daten; wunschVon: string; wunschBis: string; verspaetet: boolean; fristText?: string }
> {
  const roh = fallSchema.safeParse(lese(form, konto));
  if (!roh.success) return { ok: false, zustand: { fehler: fehlerAusZod(roh.error) } };
  const d = roh.data;
  const [personen, termine] = await Promise.all([ladePersonen(konto.teamId), ladeTermine(konto.teamId)]);
  const ids = new Set(personen.map((p) => p.id));
  const fehler: Record<string, string> = {};
  if (!ids.has(d.verantwortlich)) fehler.verantwortlich = "Diese Person gehört nicht zum Team.";
  if (d.erforderlich.some((id) => !ids.has(id))) fehler.erforderlich = "Eine ausgewählte Person gehört nicht zum Team.";
  const erforderlich = d.erforderlich.filter((id) => id !== d.verantwortlich);

  let wunschVon = "";
  let wunschBis = "";
  const h = heute();
  if (d.wunschArt === "tag") {
    const t = termine.find((x) => x.id === d.termin);
    if (!t) fehler.termin = "Dieser Termin existiert nicht. Bitte wählen Sie einen Dienstag aus der Liste.";
    else if (t.datum < h) fehler.termin = "Dieser Termin liegt in der Vergangenheit.";
    else wunschVon = wunschBis = t.datum;
  } else {
    wunschVon = d.von!;
    wunschBis = d.bis!;
    if (wunschBis < h) fehler.bis = "Der Zeitraum liegt in der Vergangenheit.";
    else if (!termine.some((t) => t.datum >= wunschVon && t.datum <= wunschBis && t.datum >= h)) {
      fehler.bis = "In diesem Zeitraum gibt es keinen Konferenztermin. Bitte wählen Sie einen längeren Zeitraum.";
    }
  }
  if (Object.keys(fehler).length) return { ok: false, zustand: { fehler } };

  const erster = termine.find((t) => t.datum >= wunschVon && t.datum <= wunschBis && t.datum >= h)!;
  const verspaetet = new Date() > erster.frist;
  return {
    ok: true,
    d: { ...d, erforderlich },
    wunschVon,
    wunschBis,
    verspaetet,
    fristText: verspaetet ? `Die Eintragungsfrist für den ${datumKurz(erster.datum)} ist bereits abgelaufen. Der Fall ist deshalb als „verspätet“ markiert; die Planung entscheidet, ob er noch aufgenommen wird.` : undefined,
  };
}

export async function fallEintragenAktion(vorher: FormZustand, form: FormData): Promise<FormZustand> {
  const konto = await brauchtAnmeldung();
  const p = await pruefeUndBereite(konto, form);
  if (!p.ok) return { ...p.zustand, runde: vorher.runde };
  const { d } = p;
  await db.transaction(async (tx) => {
    const [f] = await tx
      .insert(s.falleintrag)
      .values({
        teamId: konto.teamId,
        verantwortlichId: d.verantwortlich,
        fallkuerzel: d.fallkuerzel,
        dauerMinuten: d.dauer,
        wunschVon: p.wunschVon,
        wunschBis: p.wunschBis,
        vorgesetztErforderlich: d.vorgesetzt === "ja",
        dringend: d.dringend,
        notiz: d.notiz || null,
        verspaetet: p.verspaetet,
        erstelltVonId: konto.kontoId,
      })
      .returning({ id: s.falleintrag.id });
    if (d.erforderlich.length) {
      await tx.insert(s.fallErforderlich).values(d.erforderlich.map((personId) => ({ falleintragId: f!.id, personId })));
    }
  });
  revalidatePath("/faelle");
  return {
    erfolg: `Fall ${d.fallkuerzel} wurde eingetragen.${p.fristText ? " " + p.fristText : ""}`,
    runde: (vorher.runde ?? 0) + 1,
  };
}

/** Darf das Konto diesen Fall ändern? Planung immer, Mitarbeitende nur eigene. */
async function ladeEigenenFall(konto: Angemeldet, fallId: string) {
  const [f] = await db.select().from(s.falleintrag).where(and(eq(s.falleintrag.id, fallId), eq(s.falleintrag.teamId, konto.teamId)));
  if (!f) return null;
  if (!istPlanung(konto) && f.verantwortlichId !== konto.personId) return null;
  return f;
}

export async function fallAendernAktion(fallId: string, vorher: FormZustand, form: FormData): Promise<FormZustand> {
  const konto = await brauchtAnmeldung();
  const f = await ladeEigenenFall(konto, fallId);
  if (!f) return { meldung: "Sie dürfen diesen Fall nicht ändern." };
  const p = await pruefeUndBereite(konto, form);
  if (!p.ok) return p.zustand;
  const { d } = p;
  await db.transaction(async (tx) => {
    await tx
      .update(s.falleintrag)
      .set({
        verantwortlichId: d.verantwortlich,
        fallkuerzel: d.fallkuerzel,
        dauerMinuten: d.dauer,
        wunschVon: p.wunschVon,
        wunschBis: p.wunschBis,
        vorgesetztErforderlich: d.vorgesetzt === "ja",
        dringend: d.dringend,
        notiz: d.notiz || null,
      })
      .where(eq(s.falleintrag.id, f.id));
    await tx.delete(s.fallErforderlich).where(eq(s.fallErforderlich.falleintragId, f.id));
    if (d.erforderlich.length) {
      await tx.insert(s.fallErforderlich).values(d.erforderlich.map((personId) => ({ falleintragId: f.id, personId })));
    }
  });
  revalidatePath("/faelle");
  return { erfolg: `Die Änderungen an Fall ${d.fallkuerzel} wurden gespeichert.`, runde: vorher.runde };
}

export async function fallZurueckziehenAktion(fallId: string): Promise<void> {
  const konto = await brauchtAnmeldung();
  const f = await ladeEigenenFall(konto, fallId);
  if (!f) redirect("/faelle?fehler=keine-berechtigung");
  await db.update(s.falleintrag).set({ status: "ZURUECKGEZOGEN" }).where(eq(s.falleintrag.id, f.id));
  revalidatePath("/faelle");
  redirect("/faelle?hinweis=zurueckgezogen");
}
