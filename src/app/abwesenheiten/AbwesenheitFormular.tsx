"use client";
import { useActionState, useState } from "react";
import { absendenOhneLeeren } from "@/components/absenden";
import { Erfolg, FehlerZusammenfassung, Feldfehler, feldAttribute, type FormZustand } from "@/components/Formular";
import { abwesenheitEintragenAktion } from "./aktionen";

export function AbwesenheitFormular({ personen, eigenePersonId }: { personen?: Array<{ id: string; name: string }>; eigenePersonId: string }) {
  const [zustand, aktion, laeuft] = useActionState<FormZustand, FormData>(abwesenheitEintragenAktion, { runde: 0 });
  return (
    <>
      <Erfolg zustand={zustand} />
      <Inhalt key={zustand.runde} zustand={zustand} aktion={aktion} laeuft={laeuft} personen={personen} eigenePersonId={eigenePersonId} />
    </>
  );
}

function Inhalt({ zustand, aktion, laeuft, personen, eigenePersonId }: {
  zustand: FormZustand; aktion: (f: FormData) => void; laeuft: boolean; personen?: Array<{ id: string; name: string }>; eigenePersonId: string;
}) {
  const [stundenweise, setStundenweise] = useState(false);
  return (
    <form onSubmit={absendenOhneLeeren(aktion)} className="formular karte" noValidate>
      <FehlerZusammenfassung zustand={zustand} />
      {personen && (
        <div className="feld">
          <label htmlFor="person">Person</label>
          <select {...feldAttribute("person", zustand)} defaultValue={eigenePersonId}>
            {personen.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <Feldfehler id="person" zustand={zustand} />
        </div>
      )}
      <div className="nebeneinander">
        <div className="feld">
          <label htmlFor="von">Erster Tag</label>
          <input type="date" {...feldAttribute("von", zustand)} />
          <Feldfehler id="von" zustand={zustand} />
        </div>
        <div className="feld">
          <label htmlFor="bis">Letzter Tag</label>
          <p className="hilfe" id="bis-hilfe">Leer lassen, wenn es nur ein Tag ist.</p>
          <input type="date" {...feldAttribute("bis", zustand, true)} />
          <Feldfehler id="bis" zustand={zustand} />
        </div>
      </div>
      <div className="auswahl">
        <input type="checkbox" id="stundenweise" name="stundenweise" value="ja" checked={stundenweise} onChange={(e) => setStundenweise(e.target.checked)} />
        <label htmlFor="stundenweise">Nur stundenweise abwesend (z. B. „ab 11 Uhr weg“)</label>
      </div>
      {stundenweise && (
        <div className="nebeneinander">
          <div className="feld">
            <label htmlFor="vonUhrzeit">Abwesend ab (Uhrzeit am ersten Tag)</label>
            <input type="time" {...feldAttribute("vonUhrzeit", zustand)} />
            <Feldfehler id="vonUhrzeit" zustand={zustand} />
          </div>
          <div className="feld">
            <label htmlFor="bisUhrzeit">Wieder da ab (Uhrzeit am letzten Tag)</label>
            <input type="time" {...feldAttribute("bisUhrzeit", zustand)} />
            <Feldfehler id="bisUhrzeit" zustand={zustand} />
          </div>
        </div>
      )}
      <p className="hilfe">Einen Grund müssen und sollen Sie nicht angeben.</p>
      <button type="submit" disabled={laeuft}>{laeuft ? "Wird gespeichert …" : "Abwesenheit eintragen"}</button>
    </form>
  );
}
