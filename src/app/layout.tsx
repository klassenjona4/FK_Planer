import type { Metadata, Viewport } from "next";
import "./globals.css";
import { aktuellesKonto } from "@/lib/auth";
import { Navigation } from "@/components/Navigation";
import { abmeldenAktion } from "./anmelden/aktionen";

export const metadata: Metadata = {
  title: { default: "FK-Planer", template: "%s · FK-Planer" },
  description: "Planung der Fachkonferenzen",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const konto = await aktuellesKonto();
  return (
    <html lang="de">
      <body>
        <a className="springen" href="#inhalt">Zum Inhalt springen</a>
        <header className="kopf">
          <div className="kopf-innen">
            <a className="marke" href="/">FK-Planer · Fachkonferenzen</a>
            {konto && (
              <div className="angemeldet">
                <span>
                  Angemeldet: <strong>{konto.name}</strong>
                  {konto.rolle === "PLANUNG" ? " (Planung)" : ""}
                </span>
                <form action={abmeldenAktion}>
                  <button type="submit">Abmelden</button>
                </form>
              </div>
            )}
          </div>
        </header>
        {konto && <Navigation planung={konto.rolle === "PLANUNG"} />}
        <main id="inhalt" tabIndex={-1}>
          {children}
        </main>
      </body>
    </html>
  );
}
