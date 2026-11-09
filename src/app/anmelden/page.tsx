import { redirect } from "next/navigation";
import { aktuellesKonto } from "@/lib/auth";
import { AnmeldeFormular } from "./AnmeldeFormular";

export const metadata = { title: "Anmelden" };

export default async function AnmeldenSeite() {
  if (await aktuellesKonto()) redirect("/");
  return (
    <div className="formular">
      <h1>Anmelden</h1>
      <p>Bitte melden Sie sich mit Ihrer dienstlichen E-Mail-Adresse an.</p>
      <AnmeldeFormular />
    </div>
  );
}
