import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { brauchtPlanung } from "@/lib/auth";
import { personSpeichernAktion } from "../../aktionen";
import { PersonFormular } from "../../Formulare";

export const metadata = { title: "Person bearbeiten" };

export default async function PersonBearbeiten({ params }: { params: Promise<{ id: string }> }) {
  const konto = await brauchtPlanung();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const [p] = await db.select().from(s.person).where(and(eq(s.person.id, id), eq(s.person.teamId, konto.teamId)));
  if (!p) notFound();
  const [k] = await db.select().from(s.benutzerkonto).where(eq(s.benutzerkonto.personId, id));
  return (
    <>
      <p><Link href="/einstellungen/personen">← Alle Personen</Link></p>
      <h1>{p.vorname} {p.nachname} bearbeiten</h1>
      <p className="hilfe">Personen werden nicht gelöscht, damit die Statistik stimmt. Tragen Sie bei Ausscheiden „Im Team bis“ ein und sperren Sie den Zugang.</p>
      <PersonFormular
        aktion={personSpeichernAktion.bind(null, p.id)}
        neu={false}
        werte={{
          vorname: p.vorname, nachname: p.nachname, stellenanteil: p.stellenanteil, istVorgesetzt: p.istVorgesetzt, rang: p.vorgesetztRang,
          darfAufgefuelltWerden: p.darfAufgefuelltWerden, aktivVon: p.aktivVon, aktivBis: p.aktivBis,
          email: k?.email ?? "", rolle: k?.rolle ?? "MITARBEITEND", gesperrt: k?.gesperrt ?? false,
        }}
      />
    </>
  );
}
