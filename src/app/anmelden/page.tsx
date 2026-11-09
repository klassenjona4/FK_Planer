import { redirect } from "next/navigation";
import { aktuellesKonto } from "@/lib/auth";
import { AnmeldeFormular } from "./AnmeldeFormular";

export const metadata = { title: "Anmelden" };

export default async function AnmeldenSeite() {
  if (await aktuellesKonto()) redirect("/");
  return (
    <div style={{ maxWidth: 480, margin: "8vh auto 0" }}>
      <div className="logo" style={{ marginBottom: "1.5rem" }}>
        <span className="logo-zeichen" aria-hidden="true">FK</span>
        <span>FK-Planer<span className="team-name">Fachkonferenzen</span></span>
      </div>
      <h1>Anmelden</h1>
      <p className="leise" style={{ marginTop: "0.5rem" }}>Bitte melden Sie sich mit Ihrer dienstlichen E-Mail-Adresse an.</p>
      <AnmeldeFormular />
    </div>
  );
}
