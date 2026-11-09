"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const MITARBEITEND = [
  { href: "/", text: "Start" },
  { href: "/fall-eintragen", text: "Fall eintragen" },
  { href: "/faelle", text: "Fälle" },
  { href: "/plan", text: "Plan" },
  { href: "/meine-termine", text: "Meine Termine" },
  { href: "/abwesenheiten", text: "Abwesenheiten" },
  { href: "/fairness", text: "Fairness" },
];
const PLANUNG = [{ href: "/einstellungen", text: "Einstellungen" }];

export function Navigation({ planung }: { planung: boolean }) {
  const pfad = usePathname();
  const eintraege = planung ? [...MITARBEITEND, ...PLANUNG] : MITARBEITEND;
  const aktiv = (href: string) => (href === "/" ? pfad === "/" : pfad === href || pfad.startsWith(href + "/"));
  return (
    <nav className="navigation" aria-label="Hauptnavigation">
      <ul>
        {eintraege.map((e) => (
          <li key={e.href}>
            <Link href={e.href} aria-current={aktiv(e.href) ? "page" : undefined}>
              {e.text}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
