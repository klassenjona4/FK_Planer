import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { and, eq, gte } from "drizzle-orm";
import "./globals.css";
import { db, schema as s } from "@/db";
import { aktuellesKonto, type Angemeldet } from "@/lib/auth";
import { ladeEigeneTermine } from "@/lib/daten";
import { heute } from "@/lib/zeit-server";
import { Seitenleiste } from "@/components/Seitenleiste";
import { Symbol } from "@/components/Symbole";
import { abmeldenAktion } from "./anmelden/aktionen";

export const metadata: Metadata = {
  title: { default: "FK-Planer", template: "%s · FK-Planer" },
  description: "Planung der Fachkonferenzen",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#f6f7f4" };

async function leistenDaten(k: Angemeldet) {
  const h = heute();
  const [team, faelle, termine, tage, plaene] = await Promise.all([
    db.select({ name: s.team.name }).from(s.team).where(eq(s.team.id, k.teamId)),
    db.select({ verantwortlichId: s.falleintrag.verantwortlichId }).from(s.falleintrag)
      .where(and(eq(s.falleintrag.teamId, k.teamId), eq(s.falleintrag.status, "OFFEN"), gte(s.falleintrag.wunschBis, h))),
    ladeEigeneTermine(k.teamId, k.personId, h),
    db.select({ id: s.konferenztag.id }).from(s.konferenztag).where(and(eq(s.konferenztag.teamId, k.teamId), gte(s.konferenztag.datum, h))),
    db.select({ tagId: s.plan.konferenztagId, status: s.plan.status }).from(s.plan).where(eq(s.plan.teamId, k.teamId)),
  ]);
  const veroeffentlicht = new Set(plaene.filter((p) => p.status === "VEROEFFENTLICHT").map((p) => p.tagId));
  return {
    team: team[0]?.name ?? "",
    zaehler: {
      faelle: k.rolle === "PLANUNG" ? faelle.length : faelle.filter((f) => f.verantwortlichId === k.personId).length,
      termine: termine.length,
      // nur die nächsten 2 Termine ohne veröffentlichten Plan sind für die Planung relevant
      ohnePlan: tage.slice(0, 2).filter((t) => !veroeffentlicht.has(t.id)).length,
    },
  };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const konto = await aktuellesKonto();
  const daten = konto ? await leistenDaten(konto) : null;
  return (
    <html lang="de">
      <body>
        <a className="springen" href="#inhalt">Zum Inhalt springen</a>
        <div className={`rahmen${konto ? "" : " ohne-leiste"}`}>
          {konto && daten && (
            <Seitenleiste
              planung={konto.rolle === "PLANUNG"}
              team={daten.team}
              name={konto.name}
              rolle={konto.rolle === "PLANUNG" ? "Planung/Leitung" : "Mitarbeitende"}
              zaehler={daten.zaehler}
              abmelden={
                <form action={abmeldenAktion}>
                  <button type="submit" className="symbol-knopf klein" title="Abmelden">
                    <Symbol name="abmelden" /><span className="nur-sr">Abmelden</span>
                  </button>
                </form>
              }
            />
          )}
          <div className="hauptbereich">
            {konto && (
              <div className="kopfzeile">
                <Link href="/fall-eintragen" className="knopf"><Symbol name="plus" /> Neuer Fall</Link>
              </div>
            )}
            <main id="inhalt" tabIndex={-1}>{children}</main>
          </div>
        </div>
      </body>
    </html>
  );
}
