"use server";
import { and, eq, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, schema as s } from "@/db";
import type { FormZustand } from "@/components/Formular";
import { brauchtPlanung, passwortHashen } from "@/lib/auth";
import { ladeEinstellungen } from "@/lib/daten";
import { fehlerAusZod, text } from "@/lib/formular";
import { berlinZuDate } from "@/lib/zeit-server";
import { plusTage, wochentag } from "@/planung";

const uhr = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Bitte eine Uhrzeit im Format 09:00 eingeben.");
const datum = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Bitte ein Datum eingeben.");

// ---------------------------------------------------------------------------
// Personen
// ---------------------------------------------------------------------------

const personSchema = z
  .object({
    vorname: z.string().min(1, "Bitte den Vornamen eingeben.").max(100),
    nachname: z.string().min(1, "Bitte den Nachnamen eingeben.").max(100),
    stellenanteil: z.coerce.number({ message: "Bitte den Stellenanteil in Prozent eingeben." }).min(10, "Der Stellenanteil muss mindestens 10 % betragen.").max(100, "Der Stellenanteil darf höchstens 100 % betragen."),
    istVorgesetzt: z.boolean(),
    rang: z.coerce.number().int().min(1).max(9).optional(),
    darfAufgefuelltWerden: z.boolean(),
    aktivVon: datum.optional(),
    aktivBis: datum.optional(),
    email: z.string().email("Bitte eine gültige E-Mail-Adresse eingeben.").max(254),
    rolle: z.enum(["MITARBEITEND", "PLANUNG"]),
    passwort: z.string().optional(),
    gesperrt: z.boolean(),
  })
  .superRefine((w, ctx) => {
    if (w.passwort && w.passwort.length < 10) ctx.addIssue({ code: "custom", path: ["passwort"], message: "Das Passwort muss mindestens 10 Zeichen lang sein." });
    if (w.aktivVon && w.aktivBis && w.aktivVon > w.aktivBis) ctx.addIssue({ code: "custom", path: ["aktivBis"], message: "„Im Team bis“ liegt vor „Im Team ab“." });
    if (w.istVorgesetzt && !w.rang) ctx.addIssue({ code: "custom", path: ["rang"], message: "Bitte den Rang angeben (1 = Leitung, 2 = Vertretung)." });
  });

function lesePerson(form: FormData) {
  return {
    vorname: text(form, "vorname"),
    nachname: text(form, "nachname"),
    stellenanteil: text(form, "stellenanteil"),
    istVorgesetzt: form.get("istVorgesetzt") === "ja",
    rang: text(form, "rang") || undefined,
    darfAufgefuelltWerden: form.get("darfAufgefuelltWerden") === "ja",
    aktivVon: text(form, "aktivVon") || undefined,
    aktivBis: text(form, "aktivBis") || undefined,
    email: text(form, "email").toLowerCase(),
    rolle: text(form, "rolle") || "MITARBEITEND",
    passwort: String(form.get("passwort") ?? "") || undefined,
    gesperrt: form.get("gesperrt") === "ja",
  };
}

export async function personSpeichernAktion(personId: string | null, vorher: FormZustand, form: FormData): Promise<FormZustand> {
  const konto = await brauchtPlanung();
  const roh = personSchema.safeParse(lesePerson(form));
  if (!roh.success) return { fehler: fehlerAusZod(roh.error), runde: vorher.runde };
  const d = roh.data;
  if (!personId && !d.passwort) return { fehler: { passwort: "Bitte ein Startpasswort vergeben (mindestens 10 Zeichen)." }, runde: vorher.runde };

  const [doppelt] = await db.select({ id: s.benutzerkonto.id, personId: s.benutzerkonto.personId }).from(s.benutzerkonto).where(eq(s.benutzerkonto.email, d.email));
  if (doppelt && doppelt.personId !== personId) return { fehler: { email: "Diese E-Mail-Adresse wird bereits verwendet." }, runde: vorher.runde };

  if (personId === konto.personId && d.rolle !== "PLANUNG") {
    return { fehler: { rolle: "Sie können sich die Planungsrolle nicht selbst entziehen." }, runde: vorher.runde };
  }

  const personWerte = {
    vorname: d.vorname,
    nachname: d.nachname,
    stellenanteil: Math.round(d.stellenanteil) / 100,
    istVorgesetzt: d.istVorgesetzt,
    vorgesetztRang: d.istVorgesetzt ? d.rang ?? 1 : null,
    darfAufgefuelltWerden: d.darfAufgefuelltWerden,
    aktivVon: d.aktivVon ?? null,
    aktivBis: d.aktivBis ?? null,
  };

  if (personId) {
    const [p] = await db.select().from(s.person).where(and(eq(s.person.id, personId), eq(s.person.teamId, konto.teamId)));
    if (!p) return { meldung: "Diese Person gibt es nicht." };
    await db.transaction(async (tx) => {
      await tx.update(s.person).set(personWerte).where(eq(s.person.id, personId));
      const kontoWerte = {
        email: d.email,
        rolle: d.rolle,
        gesperrt: personId === konto.personId ? false : d.gesperrt,
        ...(d.passwort ? { passwortHash: await passwortHashen(d.passwort) } : {}),
      };
      const [k] = await tx.select({ id: s.benutzerkonto.id }).from(s.benutzerkonto).where(eq(s.benutzerkonto.personId, personId));
      if (k) await tx.update(s.benutzerkonto).set(kontoWerte).where(eq(s.benutzerkonto.id, k.id));
      else if (d.passwort) await tx.insert(s.benutzerkonto).values({ ...kontoWerte, passwortHash: kontoWerte.passwortHash!, teamId: konto.teamId, personId });
      if (d.passwort && k) await tx.delete(s.loginSitzung).where(eq(s.loginSitzung.kontoId, k.id));
    });
    revalidatePath("/einstellungen/personen");
    return { erfolg: `Die Angaben zu ${d.vorname} ${d.nachname} wurden gespeichert.`, runde: vorher.runde };
  }

  const hashWert = await passwortHashen(d.passwort!);
  await db.transaction(async (tx) => {
    const [p] = await tx.insert(s.person).values({ ...personWerte, teamId: konto.teamId }).returning({ id: s.person.id });
    await tx.insert(s.benutzerkonto).values({ teamId: konto.teamId, personId: p!.id, email: d.email, rolle: d.rolle, passwortHash: hashWert, gesperrt: d.gesperrt });
  });
  revalidatePath("/einstellungen/personen");
  return { erfolg: `${d.vorname} ${d.nachname} wurde angelegt und kann sich jetzt anmelden.`, runde: (vorher.runde ?? 0) + 1 };
}

// ---------------------------------------------------------------------------
// Regeln
// ---------------------------------------------------------------------------

const regelSchema = z.object({
  minTeilnehmende: z.coerce.number().int("Bitte eine ganze Zahl eingeben.").min(2, "Mindestens 2 Personen.").max(10, "Höchstens 10 Personen."),
  minErsparnisMinuten: z.coerce.number().int("Bitte eine ganze Zahl eingeben.").min(0, "Darf nicht negativ sein.").max(240, "Höchstens 240 Minuten."),
  auswertungszeitraumWochen: z.coerce.number().int("Bitte eine ganze Zahl eingeben.").min(4, "Mindestens 4 Wochen.").max(104, "Höchstens 104 Wochen."),
  fristStunden: z.coerce.number().int("Bitte eine ganze Zahl eingeben.").min(0, "Darf nicht negativ sein.").max(336, "Höchstens 336 Stunden (2 Wochen)."),
  wechselpauseMinuten: z.coerce.number().int("Bitte eine ganze Zahl eingeben.").min(0, "Darf nicht negativ sein.").max(30, "Höchstens 30 Minuten."),
  standardBeginn: uhr,
  standardEnde: uhr.optional(),
  loeschfristMonate: z.coerce.number().int("Bitte eine ganze Zahl eingeben.").min(1, "Mindestens 1 Monat.").max(24, "Höchstens 24 Monate."),
});

export async function regelnSpeichernAktion(vorher: FormZustand, form: FormData): Promise<FormZustand> {
  const konto = await brauchtPlanung();
  const roh = regelSchema.safeParse({
    minTeilnehmende: text(form, "minTeilnehmende"),
    minErsparnisMinuten: text(form, "minErsparnisMinuten"),
    auswertungszeitraumWochen: text(form, "auswertungszeitraumWochen"),
    fristStunden: text(form, "fristStunden"),
    wechselpauseMinuten: text(form, "wechselpauseMinuten"),
    standardBeginn: text(form, "standardBeginn"),
    standardEnde: text(form, "standardEnde") || undefined,
    loeschfristMonate: text(form, "loeschfristMonate"),
  });
  if (!roh.success) return { fehler: fehlerAusZod(roh.error), runde: vorher.runde };
  await ladeEinstellungen(konto.teamId);
  await db.update(s.einstellungen).set({ ...roh.data, standardEnde: roh.data.standardEnde ?? null }).where(eq(s.einstellungen.teamId, konto.teamId));
  revalidatePath("/einstellungen");
  return { erfolg: "Die Einstellungen wurden gespeichert. Sie gelten ab dem nächsten erzeugten Plan.", runde: vorher.runde };
}

// ---------------------------------------------------------------------------
// Termine
// ---------------------------------------------------------------------------

async function fristFuer(teamId: string, d: string, beginn: string): Promise<Date> {
  const e = await ladeEinstellungen(teamId);
  return new Date(berlinZuDate(d, beginn).getTime() - e.fristStunden * 3_600_000);
}

const termineSchema = z.object({
  ab: datum,
  wochen: z.coerce.number().int().min(1, "Mindestens 1 Woche.").max(52, "Höchstens 52 Wochen auf einmal."),
  beginn: uhr,
  ende: uhr.optional(),
});

export async function termineAnlegenAktion(vorher: FormZustand, form: FormData): Promise<FormZustand> {
  const konto = await brauchtPlanung();
  const roh = termineSchema.safeParse({ ab: text(form, "ab"), wochen: text(form, "wochen"), beginn: text(form, "beginn"), ende: text(form, "ende") || undefined });
  if (!roh.success) return { fehler: fehlerAusZod(roh.error), runde: vorher.runde };
  const d = roh.data;
  if (d.ende && d.ende <= d.beginn) return { fehler: { ende: "Das Ende muss nach dem Beginn liegen." }, runde: vorher.runde };
  let tag = d.ab;
  while (wochentag(tag) !== "Dienstag") tag = plusTage(tag, 1);
  let neu = 0;
  for (let i = 0; i < d.wochen; i++, tag = plusTage(tag, 7)) {
    const r = await db
      .insert(s.konferenztag)
      .values({ teamId: konto.teamId, datum: tag, beginn: d.beginn, ende: d.ende ?? null, frist: await fristFuer(konto.teamId, tag, d.beginn) })
      .onConflictDoNothing()
      .returning({ id: s.konferenztag.id });
    neu += r.length;
  }
  revalidatePath("/einstellungen/termine");
  return { erfolg: `${neu} Dienstag(e) angelegt.${neu < d.wochen ? " Bereits vorhandene Termine wurden nicht verändert." : ""}`, runde: (vorher.runde ?? 0) + 1 };
}

export async function terminAendernAktion(tagId: string, vorher: FormZustand, form: FormData): Promise<FormZustand> {
  const konto = await brauchtPlanung();
  const roh = z
    .object({ beginn: uhr, ende: uhr.optional(), raum1: z.string().max(100), raum2: z.string().max(100) })
    .safeParse({ beginn: text(form, "beginn"), ende: text(form, "ende") || undefined, raum1: text(form, "raum1"), raum2: text(form, "raum2") });
  if (!roh.success) return { fehler: fehlerAusZod(roh.error), runde: vorher.runde };
  const d = roh.data;
  if (d.ende && d.ende <= d.beginn) return { fehler: { ende: "Das Ende muss nach dem Beginn liegen." }, runde: vorher.runde };
  const [t] = await db.select().from(s.konferenztag).where(and(eq(s.konferenztag.id, tagId), eq(s.konferenztag.teamId, konto.teamId)));
  if (!t) return { meldung: "Diesen Termin gibt es nicht." };
  await db
    .update(s.konferenztag)
    .set({ beginn: d.beginn, ende: d.ende ?? null, raum1: d.raum1 || null, raum2: d.raum2 || null, frist: await fristFuer(konto.teamId, t.datum, d.beginn) })
    .where(eq(s.konferenztag.id, tagId));
  revalidatePath("/einstellungen/termine");
  return { erfolg: "Gespeichert. Bitte einen bereits erzeugten Plan neu erzeugen, wenn sich der Beginn geändert hat.", runde: vorher.runde };
}

export async function terminLoeschenAktion(tagId: string): Promise<void> {
  const konto = await brauchtPlanung();
  const plaene = await db
    .select({ id: s.plan.id })
    .from(s.plan)
    .where(and(eq(s.plan.konferenztagId, tagId), eq(s.plan.teamId, konto.teamId), ne(s.plan.status, "ENTWURF")));
  if (plaene.length > 0) return; // veröffentlichte Termine bleiben für die Statistik erhalten
  await db.delete(s.konferenztag).where(and(eq(s.konferenztag.id, tagId), eq(s.konferenztag.teamId, konto.teamId)));
  revalidatePath("/einstellungen/termine");
}
