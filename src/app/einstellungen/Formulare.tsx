"use client";
import { useActionState, useState } from "react";
import { absendenOhneLeeren } from "@/components/absenden";
import { Erfolg, FehlerZusammenfassung, Feldfehler, feldAttribute, type FormZustand } from "@/components/Formular";

type Aktion = (z: FormZustand, f: FormData) => Promise<FormZustand>;

function useFormular(aktion: Aktion) {
  return useActionState<FormZustand, FormData>(aktion, { runde: 0 });
}

function Zahl({ id, label, hilfe, wert, zustand, einheit }: { id: string; label: string; hilfe?: string; wert: number; zustand: FormZustand; einheit?: string }) {
  return (
    <div className="feld">
      <label htmlFor={id}>{label}</label>
      {hilfe && <p className="hilfe" id={`${id}-hilfe`}>{hilfe}</p>}
      <input type="number" inputMode="numeric" className="kurz" {...feldAttribute(id, zustand, !!hilfe)} defaultValue={wert} />
      {einheit && <span> {einheit}</span>}
      <Feldfehler id={id} zustand={zustand} />
    </div>
  );
}

export interface PersonWerte {
  vorname: string; nachname: string; stellenanteil: number; istVorgesetzt: boolean; rang: number | null;
  darfAufgefuelltWerden: boolean; aktivVon: string | null; aktivBis: string | null; email: string; rolle: "MITARBEITEND" | "PLANUNG"; gesperrt: boolean;
}

export function PersonFormular({ aktion, werte, neu }: { aktion: Aktion; werte?: PersonWerte; neu: boolean }) {
  const [zustand, ausfuehren, laeuft] = useFormular(aktion);
  return (
    <>
      <Erfolg zustand={zustand} />
      <PersonInhalt key={neu ? zustand.runde : "fest"} zustand={zustand} aktion={ausfuehren} laeuft={laeuft} werte={werte} neu={neu} />
    </>
  );
}

function PersonInhalt({ zustand, aktion, laeuft, werte: w, neu }: { zustand: FormZustand; aktion: (f: FormData) => void; laeuft: boolean; werte?: PersonWerte; neu: boolean }) {
  const [vorgesetzt, setVorgesetzt] = useState(w?.istVorgesetzt ?? false);
  return (
    <form onSubmit={absendenOhneLeeren(aktion)} className="formular karte" noValidate>
      <FehlerZusammenfassung zustand={zustand} />
      <div className="nebeneinander">
        <div className="feld">
          <label htmlFor="vorname">Vorname</label>
          <input type="text" {...feldAttribute("vorname", zustand)} defaultValue={w?.vorname} autoComplete="off" />
          <Feldfehler id="vorname" zustand={zustand} />
        </div>
        <div className="feld">
          <label htmlFor="nachname">Nachname</label>
          <input type="text" {...feldAttribute("nachname", zustand)} defaultValue={w?.nachname} autoComplete="off" />
          <Feldfehler id="nachname" zustand={zustand} />
        </div>
      </div>
      <Zahl id="stellenanteil" label="Stellenumfang in Prozent" hilfe="Vollzeit = 100, halbe Stelle = 50." wert={Math.round((w?.stellenanteil ?? 1) * 100)} zustand={zustand} einheit="%" />
      <fieldset>
        <legend>Besonderheiten</legend>
        <div className="auswahl">
          <input type="checkbox" id="istVorgesetzt" name="istVorgesetzt" value="ja" checked={vorgesetzt} onChange={(e) => setVorgesetzt(e.target.checked)} />
          <label htmlFor="istVorgesetzt">Vorgesetzte Person (wird nur eingeplant, wenn erforderlich)</label>
        </div>
        {vorgesetzt && (
          <div className="feld">
            <label htmlFor="rang">Rang</label>
            <select {...feldAttribute("rang", zustand)} defaultValue={String(w?.rang ?? 1)} className="kurz">
              <option value="1">1 – Leitung</option>
              <option value="2">2 – Vertretung</option>
              <option value="3">3 – weitere Vertretung</option>
            </select>
            <Feldfehler id="rang" zustand={zustand} />
          </div>
        )}
        <div className="auswahl">
          <input type="checkbox" id="darfAufgefuelltWerden" name="darfAufgefuelltWerden" value="ja" defaultChecked={w?.darfAufgefuelltWerden ?? true} />
          <label htmlFor="darfAufgefuelltWerden">Darf zum Auffüllen herangezogen werden</label>
        </div>
      </fieldset>
      <div className="nebeneinander">
        <div className="feld">
          <label htmlFor="aktivVon">Im Team ab (freiwillig)</label>
          <input type="date" {...feldAttribute("aktivVon", zustand)} defaultValue={w?.aktivVon ?? ""} />
          <Feldfehler id="aktivVon" zustand={zustand} />
        </div>
        <div className="feld">
          <label htmlFor="aktivBis">Im Team bis (freiwillig)</label>
          <input type="date" {...feldAttribute("aktivBis", zustand)} defaultValue={w?.aktivBis ?? ""} />
          <Feldfehler id="aktivBis" zustand={zustand} />
        </div>
      </div>
      <h3>Zugang</h3>
      <div className="feld">
        <label htmlFor="email">Dienstliche E-Mail-Adresse</label>
        <input type="email" {...feldAttribute("email", zustand)} defaultValue={w?.email} autoComplete="off" />
        <Feldfehler id="email" zustand={zustand} />
      </div>
      <div className="feld">
        <label htmlFor="rolle">Rolle</label>
        <select {...feldAttribute("rolle", zustand)} defaultValue={w?.rolle ?? "MITARBEITEND"}>
          <option value="MITARBEITEND">Mitarbeitende</option>
          <option value="PLANUNG">Planung/Leitung (alle Rechte)</option>
        </select>
        <Feldfehler id="rolle" zustand={zustand} />
      </div>
      <div className="feld">
        <label htmlFor="passwort">{neu ? "Startpasswort" : "Neues Passwort (nur ausfüllen, wenn es geändert werden soll)"}</label>
        <p className="hilfe" id="passwort-hilfe">Mindestens 10 Zeichen. Bitte persönlich übergeben, nicht per E-Mail.</p>
        <input type="password" {...feldAttribute("passwort", zustand, true)} autoComplete="new-password" />
        <Feldfehler id="passwort" zustand={zustand} />
      </div>
      {!neu && (
        <div className="auswahl">
          <input type="checkbox" id="gesperrt" name="gesperrt" value="ja" defaultChecked={w?.gesperrt} />
          <label htmlFor="gesperrt">Zugang sperren</label>
        </div>
      )}
      <div className="knopfleiste">
        <button type="submit" disabled={laeuft}>{laeuft ? "Wird gespeichert …" : neu ? "Person anlegen" : "Speichern"}</button>
      </div>
    </form>
  );
}

export interface RegelWerte {
  minTeilnehmende: number; minErsparnisMinuten: number; auswertungszeitraumWochen: number; fristStunden: number;
  wechselpauseMinuten: number; standardBeginn: string; standardEnde: string | null; loeschfristMonate: number;
}

export function RegelnFormular({ aktion, werte: w }: { aktion: Aktion; werte: RegelWerte }) {
  const [zustand, ausfuehren, laeuft] = useFormular(aktion);
  return (
    <form onSubmit={absendenOhneLeeren(ausfuehren)} className="formular karte" noValidate>
      <Erfolg zustand={zustand} />
      <FehlerZusammenfassung zustand={zustand} />
      <Zahl id="minTeilnehmende" label="Mindestzahl Teilnehmende je Gruppe" hilfe="Darunter ist eine Konferenz nicht beschlussfähig." wert={w.minTeilnehmende} zustand={zustand} einheit="Personen" />
      <Zahl id="minErsparnisMinuten" label="Mindestersparnis für eine Aufteilung in 2 Gruppen" hilfe="Zwei Gruppen werden nur vorgeschlagen, wenn die Konferenz dadurch mindestens so viel früher endet." wert={w.minErsparnisMinuten} zustand={zustand} einheit="Minuten" />
      <Zahl id="wechselpauseMinuten" label="Wechselzeit zwischen zwei Fällen" wert={w.wechselpauseMinuten} zustand={zustand} einheit="Minuten" />
      <Zahl id="auswertungszeitraumWochen" label="Auswertungszeitraum der Fairness" hilfe="Teilnahmen aus diesem Zeitraum zählen für die faire Verteilung." wert={w.auswertungszeitraumWochen} zustand={zustand} einheit="Wochen" />
      <Zahl id="fristStunden" label="Eintragungsfrist vor der Konferenz" hilfe="72 Stunden = Eintragung bis Samstag, wenn die Konferenz dienstags um 9 Uhr ist. Gilt für neu angelegte oder geänderte Termine." wert={w.fristStunden} zustand={zustand} einheit="Stunden" />
      <div className="nebeneinander">
        <div className="feld">
          <label htmlFor="standardBeginn">Üblicher Beginn</label>
          <input type="time" className="kurz" {...feldAttribute("standardBeginn", zustand)} defaultValue={w.standardBeginn} />
          <Feldfehler id="standardBeginn" zustand={zustand} />
        </div>
        <div className="feld">
          <label htmlFor="standardEnde">Übliches Ende (freiwillig)</label>
          <input type="time" className="kurz" {...feldAttribute("standardEnde", zustand)} defaultValue={w.standardEnde ?? ""} />
          <Feldfehler id="standardEnde" zustand={zustand} />
        </div>
      </div>
      <Zahl id="loeschfristMonate" label="Löschfrist für Fallkürzel und Notizen" hilfe="So lange nach der Konferenz bleiben Fallkürzel und Notiz gespeichert. Danach bleiben nur die Teilnahmen für die Statistik." wert={w.loeschfristMonate} zustand={zustand} einheit="Monate" />
      <button type="submit" disabled={laeuft}>{laeuft ? "Wird gespeichert …" : "Einstellungen speichern"}</button>
    </form>
  );
}

export function TermineAnlegenFormular({ aktion, beginn, ende, ab }: { aktion: Aktion; beginn: string; ende: string | null; ab: string }) {
  const [zustand, ausfuehren, laeuft] = useFormular(aktion);
  return (
    <form onSubmit={absendenOhneLeeren(ausfuehren)} className="formular karte" noValidate>
      <Erfolg zustand={zustand} />
      <FehlerZusammenfassung zustand={zustand} />
      <div className="nebeneinander">
        <div className="feld">
          <label htmlFor="ab">Ab Datum</label>
          <input type="date" {...feldAttribute("ab", zustand)} defaultValue={ab} />
          <Feldfehler id="ab" zustand={zustand} />
        </div>
        <div className="feld">
          <label htmlFor="wochen">Anzahl Wochen</label>
          <input type="number" className="kurz" {...feldAttribute("wochen", zustand)} defaultValue={8} />
          <Feldfehler id="wochen" zustand={zustand} />
        </div>
      </div>
      <div className="nebeneinander">
        <div className="feld">
          <label htmlFor="beginn">Beginn</label>
          <input type="time" className="kurz" {...feldAttribute("beginn", zustand)} defaultValue={beginn} />
          <Feldfehler id="beginn" zustand={zustand} />
        </div>
        <div className="feld">
          <label htmlFor="ende">Spätestes Ende (freiwillig)</label>
          <input type="time" className="kurz" {...feldAttribute("ende", zustand)} defaultValue={ende ?? ""} />
          <Feldfehler id="ende" zustand={zustand} />
        </div>
      </div>
      <button type="submit" disabled={laeuft}>{laeuft ? "Wird angelegt …" : "Dienstage anlegen"}</button>
    </form>
  );
}

export function TerminZeile({ aktion, titel, werte }: { aktion: Aktion; titel: string; werte: { beginn: string; ende: string | null; raum1: string | null; raum2: string | null } }) {
  const [zustand, ausfuehren, laeuft] = useFormular(aktion);
  const p = titel.replace(/\W/g, "");
  const attr = (id: string) => ({ ...feldAttribute(id, zustand), id: `${id}-${p}` });
  return (
    <form onSubmit={absendenOhneLeeren(ausfuehren)} noValidate>
      <Erfolg zustand={zustand} />
      <FehlerZusammenfassung zustand={zustand} />
      <div className="nebeneinander">
        <div className="feld"><label htmlFor={`beginn-${p}`}>Beginn</label><input type="time" className="kurz" {...attr("beginn")} defaultValue={werte.beginn} /></div>
        <div className="feld"><label htmlFor={`ende-${p}`}>Ende (freiwillig)</label><input type="time" className="kurz" {...attr("ende")} defaultValue={werte.ende ?? ""} /></div>
        <div className="feld"><label htmlFor={`raum1-${p}`}>Raum Gruppe 1</label><input type="text" {...attr("raum1")} defaultValue={werte.raum1 ?? ""} /></div>
        <div className="feld"><label htmlFor={`raum2-${p}`}>Raum Gruppe 2</label><input type="text" {...attr("raum2")} defaultValue={werte.raum2 ?? ""} /></div>
      </div>
      <button type="submit" className="zweitrangig klein" disabled={laeuft}>Speichern<span className="nur-sr"> ({titel})</span></button>
    </form>
  );
}
