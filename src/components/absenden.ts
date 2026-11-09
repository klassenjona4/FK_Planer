"use client";
import { startTransition, type FormEvent } from "react";

/**
 * Sendet ein Formular an eine Server-Aktion, ohne dass React die Eingaben
 * automatisch leert. So bleiben Eingaben bei Fehlermeldungen erhalten.
 */
export function absendenOhneLeeren(aktion: (f: FormData) => void) {
  return (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const daten = new FormData(e.currentTarget);
    const knopf = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    if (knopf?.name) daten.set(knopf.name, knopf.value);
    startTransition(() => aktion(daten));
  };
}
