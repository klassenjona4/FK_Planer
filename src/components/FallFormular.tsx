"use client";
import { useActionState, useState } from "react";
import { absendenOhneLeeren } from "./absenden";
import { Erfolg, FehlerZusammenfassung, Feldfehler, feldAttribute, type FormZustand } from "./Formular";

export interface FallStartwerte {
  verantwortlich?: string;
  fallkuerzel?: string;
  dauer?: number;
  wunschArt?: "tag" | "zeitraum";
  termin?: string;
  von?: string;
  bis?: string;
  vorgesetzt?: boolean;
  erforderlich?: string[];
  dringend?: boolean;
  notiz?: string;
}

interface Props {
  aktion: (z: FormZustand, f: FormData) => Promise<FormZustand>;
  personen: Array<{ id: string; name: string; istVorgesetzt: boolean }>;
  termine: Array<{ id: string; text: string }>;
  istPlanung: boolean;
  eigenePersonId: string;
  eigenerName: string;
  startwerte?: FallStartwerte;
  knopfText: string;
}

export function FallFormular(props: Props) {
  const [zustand, aktion, laeuft] = useActionState<FormZustand, FormData>(props.aktion, { runde: 0 });
  // Nach erfolgreichem Eintragen wird das Formular über den key neu aufgebaut und geleert
  return (
    <>
      <Erfolg zustand={zustand} />
      <FormularInhalt key={props.startwerte ? "fest" : zustand.runde} {...props} zustand={zustand} senden={aktion} laeuft={laeuft} />
    </>
  );
}

function FormularInhalt({
  personen, termine, istPlanung, eigenePersonId, eigenerName, startwerte: sw = {}, knopfText, zustand, senden, laeuft,
}: Omit<Props, "aktion"> & { zustand: FormZustand; senden: (f: FormData) => void; laeuft: boolean }) {
  const [wunschArt, setWunschArt] = useState<"tag" | "zeitraum">(sw.wunschArt ?? "tag");
  const [verantwortlich, setVerantwortlich] = useState(sw.verantwortlich ?? eigenePersonId);
  const [notiz, setNotiz] = useState(sw.notiz ?? "");

  return (
    <form onSubmit={absendenOhneLeeren(senden)} className="formular karte" noValidate>
      <FehlerZusammenfassung zustand={zustand} />

      {istPlanung ? (
        <div className="feld">
          <label htmlFor="verantwortlich">1. Fallverantwortliche Person</label>
          <select {...feldAttribute("verantwortlich", zustand)} value={verantwortlich} onChange={(e) => setVerantwortlich(e.target.value)}>
            {personen.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <Feldfehler id="verantwortlich" zustand={zustand} />
        </div>
      ) : (
        <div className="feld">
          <span className="beschriftung">1. Fallverantwortliche Person</span>
          <p>{eigenerName}</p>
        </div>
      )}

      <div className="feld">
        <label htmlFor="fallkuerzel">2. Fallkürzel</label>
        <p className="hilfe" id="fallkuerzel-hilfe">
          Nur ein pseudonymes Kürzel mit mindestens einer Ziffer, zum Beispiel <strong>M-17</strong> oder <strong>2026-034</strong>.
          Keine Namen, keine Geburtsdaten, keine Adressen.
        </p>
        <input type="text" {...feldAttribute("fallkuerzel", zustand, true)} defaultValue={sw.fallkuerzel} maxLength={15} autoComplete="off" className="kurz" />
        <Feldfehler id="fallkuerzel" zustand={zustand} />
      </div>

      <div className="feld">
        <label htmlFor="dauer">3. Benötigte Dauer in Minuten</label>
        <p className="hilfe" id="dauer-hilfe">Zum Beispiel 30 oder 45.</p>
        <input type="number" inputMode="numeric" min={5} max={240} step={5} {...feldAttribute("dauer", zustand, true)} defaultValue={sw.dauer ?? 30} className="kurz" />
        <Feldfehler id="dauer" zustand={zustand} />
      </div>

      <fieldset>
        <legend>4. Gewünschter Termin</legend>
        <div className="auswahl">
          <input type="radio" id="wunsch-tag" name="wunschArt" value="tag" checked={wunschArt === "tag"} onChange={() => setWunschArt("tag")} />
          <label htmlFor="wunsch-tag">Ein bestimmter Dienstag</label>
        </div>
        <div className="auswahl">
          <input type="radio" id="wunsch-zeitraum" name="wunschArt" value="zeitraum" checked={wunschArt === "zeitraum"} onChange={() => setWunschArt("zeitraum")} />
          <label htmlFor="wunsch-zeitraum">Ein Zeitraum (die App wählt den frühesten passenden Dienstag)</label>
        </div>
        {wunschArt === "tag" ? (
          <div className="feld">
            <label htmlFor="termin">Dienstag</label>
            <select {...feldAttribute("termin", zustand)} defaultValue={sw.termin ?? termine[0]?.id}>
              {termine.map((t) => (
                <option key={t.id} value={t.id}>{t.text}</option>
              ))}
            </select>
            <Feldfehler id="termin" zustand={zustand} />
          </div>
        ) : (
          <div className="nebeneinander">
            <div className="feld">
              <label htmlFor="von">Frühestens am</label>
              <input type="date" {...feldAttribute("von", zustand)} defaultValue={sw.von} />
              <Feldfehler id="von" zustand={zustand} />
            </div>
            <div className="feld">
              <label htmlFor="bis">Spätestens am</label>
              <input type="date" {...feldAttribute("bis", zustand)} defaultValue={sw.bis} />
              <Feldfehler id="bis" zustand={zustand} />
            </div>
          </div>
        )}
      </fieldset>

      <fieldset aria-describedby={zustand.fehler?.vorgesetzt ? "vorgesetzt-fehler" : undefined}>
        <legend>5. Muss die vorgesetzte Person dabei sein?</legend>
        <div className="auswahl">
          <input type="radio" id="vorgesetzt-nein" name="vorgesetzt" value="nein" defaultChecked={!sw.vorgesetzt} />
          <label htmlFor="vorgesetzt-nein">Nein</label>
        </div>
        <div className="auswahl">
          <input type="radio" id="vorgesetzt-ja" name="vorgesetzt" value="ja" defaultChecked={!!sw.vorgesetzt} />
          <label htmlFor="vorgesetzt-ja">Ja</label>
        </div>
        <Feldfehler id="vorgesetzt" zustand={zustand} />
      </fieldset>

      <fieldset>
        <legend>6. Weitere Personen, die zwingend dabei sein müssen</legend>
        <p className="hilfe">Nur ankreuzen, wenn die Person wirklich nötig ist. Die übrigen Plätze füllt die App fair auf.</p>
        {personen
          .filter((p) => p.id !== verantwortlich && !p.istVorgesetzt)
          .map((p) => (
            <div className="auswahl" key={p.id}>
              <input type="checkbox" id={`erf-${p.id}`} name="erforderlich" value={p.id} defaultChecked={sw.erforderlich?.includes(p.id)} />
              <label htmlFor={`erf-${p.id}`}>{p.name}</label>
            </div>
          ))}
        <Feldfehler id="erforderlich" zustand={zustand} />
      </fieldset>

      <fieldset>
        <legend>Dringlichkeit</legend>
        <div className="auswahl">
          <input type="checkbox" id="dringend" name="dringend" value="ja" defaultChecked={sw.dringend} />
          <label htmlFor="dringend">Dringend – wird zuerst eingeplant (z. B. Kinderschutz)</label>
        </div>
      </fieldset>

      <div className="feld">
        <label htmlFor="notiz">7. Notiz (freiwillig)</label>
        <p className="datenschutz" id="notiz-hilfe">
          Bitte hier <u>keine</u> personenbezogenen Falldaten eintragen – keine Namen, Geburtsdaten, Adressen oder Diagnosen.
          Nur organisatorische Hinweise, z. B. „Bitte nach 10 Uhr“.
        </p>
        <textarea {...feldAttribute("notiz", zustand, true)} maxLength={200} value={notiz} onChange={(e) => setNotiz(e.target.value)} />
        <p className="hilfe" aria-live="polite">{200 - notiz.length} Zeichen übrig</p>
        <Feldfehler id="notiz" zustand={zustand} />
      </div>

      <button type="submit" disabled={laeuft}>{laeuft ? "Wird gespeichert …" : knopfText}</button>
    </form>
  );
}
