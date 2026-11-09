"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { Avatar } from "./Avatar";
import { Symbol } from "./Symbole";

interface Eintrag { href: string; text: string; symbol: string; zaehler?: number }

export function Seitenleiste({ planung, team, name, rolle, zaehler, abmelden }: {
  planung: boolean; team: string; name: string; rolle: string;
  zaehler: { faelle: number; termine: number; ohnePlan: number };
  abmelden: ReactNode;
}) {
  const pfad = usePathname();
  const [offen, setOffen] = useState(false);
  useEffect(() => setOffen(false), [pfad]);
  const aktiv = (href: string) => (href === "/" ? pfad === "/" : pfad === href || pfad.startsWith(href + "/"));

  const gruppen: Array<{ titel: string; eintraege: Eintrag[] }> = [
    { titel: "Übersicht", eintraege: [
      { href: "/", text: "Start", symbol: "start" },
      { href: "/plan", text: "Plan", symbol: "plan", zaehler: planung ? zaehler.ohnePlan : undefined },
    ] },
    { titel: "Fälle", eintraege: [
      { href: "/fall-eintragen", text: "Fall eintragen", symbol: "plus" },
      { href: "/faelle", text: "Fälle", symbol: "faelle", zaehler: zaehler.faelle },
    ] },
    { titel: "Persönlich", eintraege: [
      { href: "/meine-termine", text: "Meine Termine", symbol: "termine", zaehler: zaehler.termine },
      { href: "/abwesenheiten", text: "Abwesenheiten", symbol: "abwesend" },
    ] },
    { titel: "Auswertung", eintraege: [{ href: "/fairness", text: "Fairness", symbol: "fairness" }] },
  ];
  if (planung) gruppen.push({ titel: "Verwaltung", eintraege: [{ href: "/einstellungen", text: "Einstellungen", symbol: "einstellungen" }] });

  return (
    <aside className="seitenleiste" data-offen={offen ? "true" : "false"}>
      <div className="leiste-kopf">
        <Link href="/" className="logo">
          <span className="logo-zeichen" aria-hidden="true">FK</span>
          <span>FK-Planer<span className="team-name">{team}</span></span>
        </Link>
        <button type="button" className="menue-knopf symbol-knopf" aria-expanded={offen} aria-controls="hauptmenue" onClick={() => setOffen(!offen)}>
          <Symbol name={offen ? "schliessen" : "menue"} />
          <span className="nur-sr">{offen ? "Menü schließen" : "Menü öffnen"}</span>
        </button>
      </div>
      <div className="leiste-inhalt" id="hauptmenue">
        <nav aria-label="Hauptnavigation">
          {gruppen.map((g) => (
            <div className="leiste-gruppe" key={g.titel}>
              <p className="leiste-titel">{g.titel}</p>
              <ul className="leiste-liste">
                {g.eintraege.map((e) => (
                  <li key={e.href}>
                    <Link href={e.href} aria-current={aktiv(e.href) ? "page" : undefined}>
                      <Symbol name={e.symbol} />
                      {e.text}
                      {!!e.zaehler && <span className="zaehler"><span className="nur-sr">(</span>{e.zaehler}<span className="nur-sr">)</span></span>}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
        <div className="leiste-fuss">
          <div className="konto-box">
            <Avatar name={name} />
            <div>
              <div className="name">{name}</div>
              <div className="rolle">{rolle}</div>
            </div>
            {abmelden}
          </div>
        </div>
      </div>
    </aside>
  );
}
