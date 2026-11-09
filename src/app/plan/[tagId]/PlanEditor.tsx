"use client";
import { useMemo, useState, useTransition } from "react";
import { ART_TEXT, PlanKarten, Zeittabelle, type FallInfo } from "@/components/PlanAnsicht";
import {
  bearbeiten,
  berechneFairness,
  formatZahl,
  gruppenSpanne,
  istVerfuegbar,
  pruefePlan,
  teilnahmenAusPlan,
  type PlanEntwurf,
  type PlanungsEingabe,
} from "@/planung";
import { planErzeugenAktion, planSpeichernAktion, planVeroeffentlichenAktion, type PlanAktionErgebnis } from "../aktionen";

interface Props {
  tagId: string;
  eingabe: PlanungsEingabe;
  plan: PlanEntwurf | null;
  status: "ENTWURF" | "VEROEFFENTLICHT" | null;
  faelle: Record<string, FallInfo>;
  namen: Record<string, string>;
  raeume: Array<string | null>;
}

export function PlanEditor({ tagId, eingabe, plan: gespeichert, status, faelle, namen, raeume }: Props) {
  const [plan, setPlan] = useState<PlanEntwurf | null>(gespeichert);
  const [geaendert, setGeaendert] = useState(false);
  const [meldung, setMeldung] = useState<PlanAktionErgebnis | null>(null);
  const [kommentar, setKommentar] = useState("");
  const [trotzFehlern, setTrotzFehlern] = useState(false);
  const [laeuft, starte] = useTransition();
  const veroeffentlicht = status === "VEROEFFENTLICHT";

  const aendere = (f: (p: PlanEntwurf) => PlanEntwurf) => {
    if (!plan) return;
    setPlan(f(plan));
    setGeaendert(true);
    setMeldung(null);
  };

  const ausfuehren = (aktion: () => Promise<PlanAktionErgebnis>, danach?: () => void) =>
    starte(async () => {
      const r = await aktion();
      setMeldung(r);
      if (r.ok) danach?.();
    });

  // Live-Prüfung und Live-Fairness
  const verstoesse = useMemo(() => (plan ? pruefePlan(plan, eingabe) : []), [plan, eingabe]);
  const fehler = verstoesse.filter((v) => v.schwere === "fehler");
  const warnungen = verstoesse.filter((v) => v.schwere === "warnung");
  const fairness = useMemo(() => {
    const basis = {
      personen: eingabe.personen,
      abwesenheiten: eingabe.abwesenheiten,
      alleTermine: [...eingabe.alleTermine, eingabe.tag.datum],
      stichtag: eingabe.tag.datum,
      einstellungen: eingabe.einstellungen,
    };
    const ohne = berechneFairness({ ...basis, teilnahmen: eingabe.historie });
    const mit = berechneFairness({ ...basis, teilnahmen: [...eingabe.historie, ...(plan ? teilnahmenAusPlan(plan) : [])] });
    const vorher = new Map(ohne.map((z) => [z.personId, z]));
    return mit.map((z) => ({ ...z, vorherOhne: vorher.get(z.personId)?.ohneEigenenFall ?? 0, vorherQuote: vorher.get(z.personId)?.quote ?? 0 }));
  }, [plan, eingabe]);

  const erzeugen = () => {
    if (geaendert && !confirm("Ihre ungespeicherten Änderungen gehen verloren. Plan trotzdem neu erzeugen?")) return;
    if (veroeffentlicht && !confirm("Der Plan ist bereits veröffentlicht. Wenn Sie ihn neu erzeugen, wird die Änderung im Verlauf protokolliert. Fortfahren?")) return;
    ausfuehren(() => planErzeugenAktion(tagId), () => location.reload());
  };

  return (
    <>
      <div className="knopfleiste">
        <button type="button" onClick={erzeugen} disabled={laeuft}>
          {plan ? "Plan neu erzeugen" : "Plan erzeugen"}
        </button>
        {plan && (
          <>
            <button
              type="button"
              className="zweitrangig"
              disabled={laeuft || !geaendert}
              onClick={() => ausfuehren(() => planSpeichernAktion(tagId, JSON.stringify(plan), kommentar), () => { setGeaendert(false); setKommentar(""); })}
            >
              {veroeffentlicht ? "Änderung speichern (wird protokolliert)" : "Entwurf speichern"}
            </button>
            {geaendert && (
              <button type="button" className="gefahr" disabled={laeuft} onClick={() => { setPlan(gespeichert); setGeaendert(false); }}>
                Änderungen verwerfen
              </button>
            )}
          </>
        )}
      </div>

      <div aria-live="polite">
        {laeuft && <p className="meldung info">Bitte warten …</p>}
        {meldung && <div className={`meldung ${meldung.ok ? "erfolg" : "fehler"}`} role={meldung.ok ? "status" : "alert"}><p>{meldung.meldung}</p></div>}
        {geaendert && <div className="meldung warnung"><p>Sie haben ungespeicherte Änderungen.</p></div>}
      </div>

      {veroeffentlicht && geaendert && (
        <div className="feld">
          <label htmlFor="kommentar">Anmerkung zur Änderung (freiwillig, erscheint im Änderungsverlauf)</label>
          <input id="kommentar" type="text" maxLength={300} value={kommentar} onChange={(e) => setKommentar(e.target.value)} />
        </div>
      )}

      {!plan ? (
        <div className="meldung info"><p>Für diesen Termin gibt es noch keinen Plan. Klicken Sie auf „Plan erzeugen“.</p></div>
      ) : (
        <>
          <section aria-labelledby="pruefung-titel">
            <h2 id="pruefung-titel">Prüfung</h2>
            {fehler.length === 0 && warnungen.length === 0 && (
              <div className="meldung erfolg"><p>Alle Regeln sind eingehalten.</p></div>
            )}
            {fehler.length > 0 && (
              <div className="meldung fehler" role="alert">
                <p><strong>{fehler.length} {fehler.length === 1 ? "Regelverstoß" : "Regelverstöße"}:</strong></p>
                <ul className="verstoesse">{fehler.map((v, i) => <li key={i}>{v.text}</li>)}</ul>
              </div>
            )}
            {warnungen.length > 0 && (
              <div className="meldung warnung">
                <p><strong>Hinweise:</strong></p>
                <ul className="verstoesse">{warnungen.map((v, i) => <li key={i}>{v.text}</li>)}</ul>
              </div>
            )}
          </section>

          <section aria-labelledby="gruppen-titel">
            <h2 id="gruppen-titel">Gruppen</h2>
            <div className="meldung info"><p><strong>{plan.gruppenBegruendung}</strong></p></div>
            {plan.hinweise.length > 0 && (
              <div className="meldung warnung">
                <ul>{plan.hinweise.map((h, i) => <li key={i}>{h}</li>)}</ul>
              </div>
            )}
            <div className="knopfleiste">
              {plan.gruppen.length === 1 && <button type="button" className="zweitrangig" onClick={() => aendere(bearbeiten.zweiteGruppeAnlegen)}>Zweite Gruppe anlegen</button>}
              {plan.gruppen.length === 2 && <button type="button" className="zweitrangig" onClick={() => aendere((p) => bearbeiten.gruppenZusammenlegen(p, eingabe))}>Zu einer Gruppe zusammenlegen</button>}
              {plan.gruppen.some((g) => g.punkte.length > 0 && g.teilnehmende.length < eingabe.einstellungen.minTeilnehmende) && (
                <button type="button" className="zweitrangig" onClick={() => aendere((p) => bearbeiten.fuelleFehlendeAuf(p, eingabe))}>Fehlende Plätze fair auffüllen</button>
              )}
            </div>
            <Zeittabelle entwurf={plan} faelle={faelle} namen={namen} />
            <div className="gruppen-raster">
              {plan.gruppen.map((g) => (
                <GruppeBearbeiten key={g.nummer} plan={plan} nummer={g.nummer} eingabe={eingabe} faelle={faelle} namen={namen} raum={raeume[g.nummer - 1] ?? null} aendere={aendere} />
              ))}
            </div>
          </section>

          {plan.nichtEingeplant.length > 0 && (
            <section aria-labelledby="ne-titel">
              <h2 id="ne-titel">Nicht eingeplante Fälle</h2>
              {plan.nichtEingeplant.map((n) => (
                <div key={n.fallId} className="punkt">
                  <p><strong>Fall {faelle[n.fallId]?.kuerzel ?? "?"}</strong> ({faelle[n.fallId]?.verantwortlich}, {faelle[n.fallId]?.dauer} Min.)</p>
                  <p><strong>Grund:</strong> {n.grund}</p>
                  {n.loesungen.length > 0 && (
                    <>
                      <p className="leise">Mögliche Lösungen:</p>
                      <ul>{n.loesungen.map((l, i) => <li key={i}>{l}</li>)}</ul>
                    </>
                  )}
                  <div className="knopfleiste">
                    {(plan.gruppen.length ? plan.gruppen : [{ nummer: 1 }]).map((g) => (
                      <button key={g.nummer} type="button" className="zweitrangig klein" onClick={() => aendere((p) => bearbeiten.nimmFallAuf(p, eingabe, n.fallId, g.nummer))}>
                        Trotzdem in {plan.gruppen.length > 1 ? `Gruppe ${g.nummer}` : "den Plan"} aufnehmen
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </section>
          )}

          <section aria-labelledby="fairness-titel">
            <h2 id="fairness-titel">Auswirkung auf die Fairness</h2>
            <p>Teilnahmen ohne eigenen Fall in den letzten {eingabe.einstellungen.auswertungszeitraumWochen} Wochen, einschließlich dieses Plans. Wird bei jeder Änderung sofort neu berechnet.</p>
            <div className="tabelle-huelle">
              <table className="tabelle-mobil">
                <thead>
                  <tr>
                    <th scope="col">Person</th>
                    <th scope="col" className="zahl">Stellenanteil</th>
                    <th scope="col" className="zahl">Ohne eigenen Fall</th>
                    <th scope="col" className="zahl">Durch diesen Plan</th>
                    <th scope="col" className="zahl">Je Vollzeitstelle</th>
                  </tr>
                </thead>
                <tbody>
                  {fairness.map((z) => {
                    const delta = z.ohneEigenenFall - z.vorherOhne;
                    return (
                      <tr key={z.personId}>
                        <td data-titel="Person">{z.name}</td>
                        <td data-titel="Stellenanteil" className="zahl">{Math.round(z.stellenanteil * 100)} %</td>
                        <td data-titel="Ohne eigenen Fall" className="zahl">{z.ohneEigenenFall}</td>
                        <td data-titel="Durch diesen Plan" className="zahl">{delta > 0 ? <span className="delta-plus">+{delta}</span> : "–"}</td>
                        <td data-titel="Je Vollzeitstelle" className="zahl">{Number.isFinite(z.quote) ? formatZahl(z.quote) : "–"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          {!veroeffentlicht && (
            <section aria-labelledby="veroeffentlichen-titel" className="karte">
              <h2 id="veroeffentlichen-titel">Veröffentlichen</h2>
              <p>Nach dem Veröffentlichen sehen alle den Plan, und die Teilnahmen zählen für die Fairnessstatistik. Spätere Änderungen werden protokolliert.</p>
              {fehler.length > 0 && (
                <div className="auswahl">
                  <input type="checkbox" id="trotz" checked={trotzFehlern} onChange={(e) => setTrotzFehlern(e.target.checked)} />
                  <label htmlFor="trotz">Ich habe die {fehler.length} Regelverstöße geprüft und möchte trotzdem veröffentlichen.</label>
                </div>
              )}
              {geaendert && <p className="feldfehler">Bitte speichern Sie zuerst Ihre Änderungen.</p>}
              <button
                type="button"
                disabled={laeuft || geaendert || (fehler.length > 0 && !trotzFehlern)}
                onClick={() => ausfuehren(() => planVeroeffentlichenAktion(tagId, trotzFehlern), () => location.reload())}
              >
                Plan veröffentlichen
              </button>
            </section>
          )}
        </>
      )}
      {plan && veroeffentlicht && (
        <details className="karte">
          <summary>Ansicht wie für das Team</summary>
          <PlanKarten entwurf={plan} faelle={faelle} namen={namen} raeume={raeume} />
        </details>
      )}
    </>
  );
}

function GruppeBearbeiten({
  plan, nummer, eingabe, faelle, namen, raum, aendere,
}: {
  plan: PlanEntwurf; nummer: number; eingabe: PlanungsEingabe; faelle: Record<string, FallInfo>; namen: Record<string, string>;
  raum: string | null; aendere: (f: (p: PlanEntwurf) => PlanEntwurf) => void;
}) {
  const g = plan.gruppen.find((x) => x.nummer === nummer)!;
  const [neuePerson, setNeuePerson] = useState("");
  const spanne = gruppenSpanne(g);
  const anderswo = new Map(plan.gruppen.filter((x) => x !== g).flatMap((x) => x.teilnehmende.map((t) => [t.personId, x.nummer] as const)));
  const titel = plan.gruppen.length > 1 ? `Gruppe ${nummer}` : "Konferenz";
  const kandidaten = eingabe.personen.filter((p) => !g.teilnehmende.some((t) => t.personId === p.id));

  return (
    <section className={`karte gruppen-karte gruppe-${nummer}`} aria-label={titel}>
      <h3>{titel}{spanne && `: ${String(Math.floor(spanne.von / 60)).padStart(2, "0")}:${String(spanne.von % 60).padStart(2, "0")} bis ${String(Math.floor(spanne.bis / 60)).padStart(2, "0")}:${String(spanne.bis % 60).padStart(2, "0")} Uhr`}</h3>
      {raum && <p className="leise">Raum: {raum}</p>}
      <h4>Fälle</h4>
      {g.punkte.length === 0 && <p className="leise">Noch keine Fälle. Verschieben Sie Fälle aus der anderen Gruppe hierher.</p>}
      {g.punkte.map((p, i) => {
        const f = faelle[p.fallId];
        return (
          <div key={p.fallId} className="punkt">
            <div className="punkt-kopf">
              <span><strong>{f?.kuerzel}</strong> · {f?.verantwortlich} · {f?.dauer} Min.{f?.dringend && <> <span className="abzeichen dringend">dringend</span></>}{f?.vorgesetzt && " · mit Vorgesetzten"}</span>
            </div>
            <div className="nebeneinander">
              <div className="feld" style={{ marginBottom: 0 }}>
                <label htmlFor={`beginn-${p.fallId}`}>Beginn</label>
                <input
                  id={`beginn-${p.fallId}`}
                  type="time"
                  className="kurz"
                  value={p.beginn}
                  onChange={(e) => aendere((x) => bearbeiten.setzeBeginn(x, eingabe, p.fallId, e.target.value))}
                />
                <span className="hilfe"> bis {p.ende} Uhr</span>
              </div>
            </div>
            <div className="knopfleiste">
              <button type="button" className="zweitrangig klein" disabled={i === 0} onClick={() => aendere((x) => bearbeiten.bewegeInGruppe(x, eingabe, p.fallId, -1))}>
                ↑ Früher<span className="nur-sr"> (Fall {f?.kuerzel})</span>
              </button>
              <button type="button" className="zweitrangig klein" disabled={i === g.punkte.length - 1} onClick={() => aendere((x) => bearbeiten.bewegeInGruppe(x, eingabe, p.fallId, 1))}>
                ↓ Später<span className="nur-sr"> (Fall {f?.kuerzel})</span>
              </button>
              {plan.gruppen.filter((x) => x.nummer !== nummer).map((x) => (
                <button key={x.nummer} type="button" className="zweitrangig klein" onClick={() => aendere((y) => bearbeiten.verschiebeFall(y, eingabe, p.fallId, x.nummer))}>
                  → In Gruppe {x.nummer}<span className="nur-sr"> (Fall {f?.kuerzel})</span>
                </button>
              ))}
              <button type="button" className="gefahr klein" onClick={() => aendere((x) => bearbeiten.nimmFallHeraus(x, eingabe, p.fallId))}>
                Herausnehmen<span className="nur-sr"> (Fall {f?.kuerzel})</span>
              </button>
            </div>
          </div>
        );
      })}
      {g.punkte.length > 1 && (
        <button type="button" className="zweitrangig klein" onClick={() => aendere((x) => bearbeiten.taktNeu(x, eingabe, nummer))}>
          Uhrzeiten lückenlos neu berechnen
        </button>
      )}

      <h4>Teilnehmende ({g.teilnehmende.length} von mindestens {eingabe.einstellungen.minTeilnehmende})</h4>
      <ul className="teilnehmende">
        {g.teilnehmende.map((t) => (
          <li key={t.personId}>
            <div className="punkt-kopf">
              <span><strong>{namen[t.personId]}</strong> <span className="art">· {ART_TEXT[t.art]}</span></span>
              <button type="button" className="gefahr klein" onClick={() => aendere((x) => bearbeiten.entfernePerson(x, nummer, t.personId))}>
                Entfernen<span className="nur-sr"> ({namen[t.personId]})</span>
              </button>
            </div>
            <span className="grund">{t.begruendung}</span>
          </li>
        ))}
      </ul>
      <div className="feld" style={{ marginTop: "1rem" }}>
        <label htmlFor={`neu-${nummer}`}>Person hinzufügen</label>
        <select id={`neu-${nummer}`} value={neuePerson} onChange={(e) => setNeuePerson(e.target.value)}>
          <option value="">– bitte wählen –</option>
          {kandidaten.map((p) => {
            const hinweise = [
              anderswo.has(p.id) ? `in Gruppe ${anderswo.get(p.id)}` : null,
              spanne && !istVerfuegbar(p, eingabe.tag.datum, spanne.von, spanne.bis, eingabe.abwesenheiten) ? "nicht verfügbar" : null,
              p.istVorgesetzt ? "vorgesetzt" : null,
            ].filter(Boolean);
            return <option key={p.id} value={p.id}>{namen[p.id]}{hinweise.length ? ` (${hinweise.join(", ")})` : ""}</option>;
          })}
        </select>
      </div>
      <button
        type="button"
        className="zweitrangig klein"
        disabled={!neuePerson}
        onClick={() => { aendere((x) => bearbeiten.fuegePersonHinzu(x, eingabe, nummer, neuePerson)); setNeuePerson(""); }}
      >
        Hinzufügen
      </button>
    </section>
  );
}
