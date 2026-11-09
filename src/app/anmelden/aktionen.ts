"use server";
import { redirect } from "next/navigation";
import { abmelden, anmelden } from "@/lib/auth";

export interface AnmeldeZustand {
  meldung?: string;
  email?: string;
}

export async function anmeldenAktion(_: AnmeldeZustand, form: FormData): Promise<AnmeldeZustand> {
  const email = String(form.get("email") ?? "").trim();
  const passwort = String(form.get("passwort") ?? "");
  if (!email || !passwort) return { meldung: "Bitte geben Sie E-Mail-Adresse und Passwort ein.", email };
  const ergebnis = await anmelden(email, passwort);
  if (!ergebnis.ok) return { meldung: ergebnis.meldung, email };
  redirect("/");
}

export async function abmeldenAktion(): Promise<void> {
  await abmelden();
  redirect("/anmelden");
}
