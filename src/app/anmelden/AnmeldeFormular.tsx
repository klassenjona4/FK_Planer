"use client";
import { useActionState } from "react";
import { anmeldenAktion, type AnmeldeZustand } from "./aktionen";

export function AnmeldeFormular() {
  const [zustand, aktion, laeuft] = useActionState<AnmeldeZustand, FormData>(anmeldenAktion, {});
  return (
    <form action={aktion} className="karte" noValidate>
      {zustand.meldung && (
        <div className="meldung fehler" role="alert">
          <p>{zustand.meldung}</p>
        </div>
      )}
      <div className="feld">
        <label htmlFor="email">E-Mail-Adresse</label>
        <input id="email" name="email" type="email" autoComplete="username" defaultValue={zustand.email} required />
      </div>
      <div className="feld">
        <label htmlFor="passwort">Passwort</label>
        <input id="passwort" name="passwort" type="password" autoComplete="current-password" required />
      </div>
      <button type="submit" disabled={laeuft}>{laeuft ? "Bitte warten …" : "Anmelden"}</button>
    </form>
  );
}
