import "server-only";
import { hash, verify } from "@node-rs/argon2";
import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { db, schema } from "@/db";

const COOKIE = "fk_sitzung";
const LAUFZEIT_STUNDEN = 10;
const MAX_FEHLVERSUCHE = 5;
const SPERRE_MINUTEN = 15;

export type Rolle = "MITARBEITEND" | "PLANUNG";

export interface Angemeldet {
  kontoId: string;
  personId: string;
  teamId: string;
  rolle: Rolle;
  name: string;
  email: string;
}

export async function passwortHashen(passwort: string): Promise<string> {
  return hash(passwort, { memoryCost: 19456, timeCost: 2, parallelism: 1 });
}

function tokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export type LoginErgebnis = { ok: true } | { ok: false; meldung: string };

export async function anmelden(email: string, passwort: string): Promise<LoginErgebnis> {
  const allgemein = "E-Mail-Adresse oder Passwort stimmen nicht. Bitte prüfen Sie Ihre Eingabe.";
  const [konto] = await db
    .select()
    .from(schema.benutzerkonto)
    .where(eq(schema.benutzerkonto.email, email.trim().toLowerCase()));
  if (!konto) {
    // Gleiche Rechenzeit wie bei vorhandenem Konto, damit nicht erkennbar ist, ob es die Adresse gibt
    await passwortHashen(passwort);
    return { ok: false, meldung: allgemein };
  }
  if (konto.gesperrt) return { ok: false, meldung: "Dieses Konto ist gesperrt. Bitte wenden Sie sich an die Planung." };
  if (konto.gesperrtBis && konto.gesperrtBis > new Date()) {
    return { ok: false, meldung: `Zu viele Fehlversuche. Bitte versuchen Sie es in ${SPERRE_MINUTEN} Minuten erneut.` };
  }
  const richtig = await verify(konto.passwortHash, passwort).catch(() => false);
  if (!richtig) {
    const versuche = konto.fehlversuche + 1;
    await db
      .update(schema.benutzerkonto)
      .set({
        fehlversuche: versuche >= MAX_FEHLVERSUCHE ? 0 : versuche,
        gesperrtBis: versuche >= MAX_FEHLVERSUCHE ? new Date(Date.now() + SPERRE_MINUTEN * 60_000) : null,
      })
      .where(eq(schema.benutzerkonto.id, konto.id));
    return { ok: false, meldung: allgemein };
  }
  await db
    .update(schema.benutzerkonto)
    .set({ fehlversuche: 0, gesperrtBis: null })
    .where(eq(schema.benutzerkonto.id, konto.id));

  const token = randomBytes(32).toString("base64url");
  const laeuftAbAm = new Date(Date.now() + LAUFZEIT_STUNDEN * 3_600_000);
  await db.insert(schema.loginSitzung).values({ kontoId: konto.id, tokenHash: tokenHash(token), laeuftAbAm });
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production" && process.env.UNSICHERES_COOKIE !== "1",
    path: "/",
    expires: laeuftAbAm,
  });
  return { ok: true };
}

export async function abmelden(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) await db.delete(schema.loginSitzung).where(eq(schema.loginSitzung.tokenHash, tokenHash(token)));
  jar.delete(COOKIE);
}

/** Angemeldetes Konto (einmal pro Anfrage aus der Datenbank gelesen) oder null. */
export const aktuellesKonto = cache(async (): Promise<Angemeldet | null> => {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  const [zeile] = await db
    .select({
      kontoId: schema.benutzerkonto.id,
      personId: schema.benutzerkonto.personId,
      teamId: schema.benutzerkonto.teamId,
      rolle: schema.benutzerkonto.rolle,
      gesperrt: schema.benutzerkonto.gesperrt,
      email: schema.benutzerkonto.email,
      vorname: schema.person.vorname,
      nachname: schema.person.nachname,
    })
    .from(schema.loginSitzung)
    .innerJoin(schema.benutzerkonto, eq(schema.loginSitzung.kontoId, schema.benutzerkonto.id))
    .innerJoin(schema.person, eq(schema.benutzerkonto.personId, schema.person.id))
    .where(and(eq(schema.loginSitzung.tokenHash, tokenHash(token)), gt(schema.loginSitzung.laeuftAbAm, new Date())));
  if (!zeile || zeile.gesperrt) return null;
  return {
    kontoId: zeile.kontoId,
    personId: zeile.personId,
    teamId: zeile.teamId,
    rolle: zeile.rolle,
    email: zeile.email,
    name: `${zeile.vorname} ${zeile.nachname}`,
  };
});

/** Für Seiten und Server-Aktionen: ohne Anmeldung → Anmeldeseite. */
export async function brauchtAnmeldung(): Promise<Angemeldet> {
  const k = await aktuellesKonto();
  if (!k) redirect("/anmelden");
  return k;
}

/** Nur für die Rolle Planung/Leitung. Prüfung ausschließlich auf dem Server. */
export async function brauchtPlanung(): Promise<Angemeldet> {
  const k = await brauchtAnmeldung();
  if (k.rolle !== "PLANUNG") redirect("/?fehler=keine-berechtigung");
  return k;
}

export function istPlanung(k: Angemeldet): boolean {
  return k.rolle === "PLANUNG";
}
