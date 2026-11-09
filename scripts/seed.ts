/**
 * Demodaten: fiktives „Team 2“ im fiktiven Jugendamt Musterstadt.
 * Alle Personen sind frei erfunden. Fallkürzel sind pseudonym.
 *
 * Aufruf: npm run db:seed   (löscht vorher ALLE Daten der Datenbank!)
 */
import { hash } from "@node-rs/argon2";
import { sql } from "drizzle-orm";
import { db, schema as s } from "../src/db";
import { erzeugePlan, gruppenSpanne, plusTage, type Fall, type HistorischeTeilnahme, type Person } from "../src/planung";
import { berlinZuDate, heute } from "../src/lib/zeit-server";

if (process.env.NODE_ENV === "production" && process.env.SEED_ERZWINGEN !== "1") {
  console.error("Abbruch: Demodaten werden in Produktion nur mit SEED_ERZWINGEN=1 eingespielt.");
  process.exit(1);
}

const PASSWORT = "Demo-Passwort-2026";

/** Kleiner deterministischer Zufallsgenerator, damit die Demodaten immer gleich aussehen. */
function zufall(start: number) {
  let x = start;
  return () => {
    x = (x * 1103515245 + 12345) % 2147483648;
    return x / 2147483648;
  };
}

const TEAM = [
  { vorname: "Helga", nachname: "Brandt", stelle: 1, vg: 1, rolle: "PLANUNG" },
  { vorname: "Jonas", nachname: "Wiegand", stelle: 1, vg: 2, rolle: "MITARBEITEND" },
  { vorname: "Sabine", nachname: "Kröger", stelle: 1, rolle: "PLANUNG" },
  { vorname: "Murat", nachname: "Yıldız", stelle: 1, rolle: "MITARBEITEND" },
  { vorname: "Elke", nachname: "Hansen", stelle: 0.5, rolle: "MITARBEITEND" },
  { vorname: "Tobias", nachname: "Lehmann", stelle: 1, rolle: "MITARBEITEND" },
  { vorname: "Anja", nachname: "Petersen", stelle: 0.75, rolle: "MITARBEITEND" },
  { vorname: "Dieter", nachname: "Vogt", stelle: 1, rolle: "MITARBEITEND" },
  { vorname: "Lena", nachname: "Schuster", stelle: 0.5, rolle: "MITARBEITEND" },
  { vorname: "Katrin", nachname: "Albers", stelle: 0.8, rolle: "MITARBEITEND" },
  { vorname: "Paul", nachname: "Engel", stelle: 1, rolle: "MITARBEITEND", neu: true },
  { vorname: "Miriam", nachname: "Ostermann", stelle: 1, rolle: "MITARBEITEND", keinAuffuellen: true },
] as const;

async function main() {
  console.log("Lösche vorhandene Daten …");
  await db.execute(sql`TRUNCATE organisation, team, person, benutzerkonto, login_sitzung, einstellungen, konferenztag, abwesenheit,
    falleintrag, fall_erforderlich, plan, gruppe, plan_punkt, teilnahme, aenderung CASCADE`);

  const h = heute();
  // Nächster Dienstag ab heute
  let naechsterDi = h;
  while (new Date(naechsterDi + "T12:00:00Z").getUTCDay() !== 2) naechsterDi = plusTage(naechsterDi, 1);

  const [org] = await db.insert(s.organisation).values({ name: "Jugendamt Musterstadt (fiktiv)" }).returning();
  const [team] = await db.insert(s.team).values({ organisationId: org!.id, name: "Team 2 – Allgemeiner Sozialer Dienst" }).returning();
  const teamId = team!.id;
  // Zweites, getrenntes Team zeigt die Mandantentrennung
  const [team3] = await db.insert(s.team).values({ organisationId: org!.id, name: "Team 3 (leer, Mandantentest)" }).returning();
  await db.insert(s.einstellungen).values({ teamId });
  await db.insert(s.einstellungen).values({ teamId: team3!.id });

  const pwHash = await hash(PASSWORT, { memoryCost: 19456, timeCost: 2, parallelism: 1 });
  const personen: Person[] = [];
  for (const p of TEAM) {
    const [z] = await db
      .insert(s.person)
      .values({
        teamId,
        vorname: p.vorname,
        nachname: p.nachname,
        stellenanteil: p.stelle,
        istVorgesetzt: "vg" in p,
        vorgesetztRang: "vg" in p ? p.vg : null,
        darfAufgefuelltWerden: !("keinAuffuellen" in p),
        aktivVon: "neu" in p ? plusTage(h, -21) : null,
      })
      .returning();
    const email =
      `${p.vorname}.${p.nachname}`
        .toLowerCase()
        .replace(/ı/g, "i").replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss") + "@team2.example";
    await db.insert(s.benutzerkonto).values({ teamId, personId: z!.id, email, passwortHash: pwHash, rolle: p.rolle });
    personen.push({
      id: z!.id, vorname: z!.vorname, nachname: z!.nachname, stellenanteil: z!.stellenanteil, istVorgesetzt: z!.istVorgesetzt,
      vorgesetztRang: z!.vorgesetztRang, darfAufgefuelltWerden: z!.darfAufgefuelltWerden, aktivVon: z!.aktivVon, aktivBis: z!.aktivBis,
    });
  }
  const P = (nachname: string) => personen.find((p) => p.nachname === nachname)!;
  const fachkraefte = personen.filter((p) => !p.istVorgesetzt && p.nachname !== "Engel");

  // Termine: 8 vergangene und 8 kommende Dienstage
  const termine: Array<{ id: string; datum: string }> = [];
  for (let i = -8; i < 8; i++) {
    const datum = plusTage(naechsterDi, i * 7);
    const [t] = await db
      .insert(s.konferenztag)
      .values({
        teamId, datum, beginn: "09:00", ende: i === 1 ? "11:30" : null,
        frist: new Date(berlinZuDate(datum, "09:00").getTime() - 72 * 3_600_000),
        raum1: "Besprechungsraum 2.14", raum2: "Besprechungsraum 2.16",
      })
      .returning();
    termine.push({ id: t!.id, datum });
  }

  const r = zufall(42);
  const waehle = <T,>(liste: readonly T[]) => liste[Math.floor(r() * liste.length)]!;
  let nr = 100;
  const kuerzel = () => `${waehle(["A", "B", "F", "K", "M", "S"])}-${nr++}`;

  async function fallAnlegen(f: Omit<Fall, "id" | "erstelltAm" | "kuerzel"> & { kuerzel?: string; notiz?: string; erstelltAm?: Date }) {
    const [z] = await db
      .insert(s.falleintrag)
      .values({
        teamId, verantwortlichId: f.verantwortlichId, fallkuerzel: f.kuerzel ?? kuerzel(), dauerMinuten: f.dauerMinuten,
        wunschVon: f.wunsch.art === "tag" ? f.wunsch.datum : f.wunsch.von,
        wunschBis: f.wunsch.art === "tag" ? f.wunsch.datum : f.wunsch.bis,
        vorgesetztErforderlich: f.vorgesetztErforderlich, dringend: f.dringend, notiz: f.notiz ?? null,
        erstelltAm: f.erstelltAm ?? new Date(),
      })
      .returning();
    if (f.erforderlichIds.length) await db.insert(s.fallErforderlich).values(f.erforderlichIds.map((personId) => ({ falleintragId: z!.id, personId })));
    return z!;
  }

  // Abwesenheiten (Urlaub, Fortbildung) – kein Grund gespeichert
  const abw = [
    { personId: P("Hansen").id, vonDatum: plusTage(naechsterDi, -36), bisDatum: plusTage(naechsterDi, -22) },
    { personId: P("Vogt").id, vonDatum: plusTage(naechsterDi, -1), bisDatum: plusTage(naechsterDi, 3) },
    { personId: P("Petersen").id, vonDatum: naechsterDi, bisDatum: naechsterDi, vonUhrzeit: "10:30" },
    { personId: P("Brandt").id, vonDatum: plusTage(naechsterDi, 7), bisDatum: plusTage(naechsterDi, 9) },
    // Am 4. kommenden Dienstag: Großteil des Teams auf Fortbildung → nicht beschlussfähig
    ...personen
      .filter((p) => !["Kröger", "Lehmann"].includes(p.nachname))
      .map((p) => ({ personId: p.id, vonDatum: plusTage(naechsterDi, 21), bisDatum: plusTage(naechsterDi, 21) })),
  ];
  await db.insert(s.abwesenheit).values(abw.map((a) => ({ ...a, teamId })));
  const abwesenheiten = abw.map((a) => ({ ...a, vonUhrzeit: a.vonUhrzeit ?? null, bisUhrzeit: null }));

  // Vergangene Konferenzen: Fälle anlegen, Pläne erzeugen und veröffentlichen
  console.log("Erzeuge vergangene, veröffentlichte Pläne …");
  const historie: HistorischeTeilnahme[] = [];
  const einst = { minTeilnehmende: 3, minErsparnisMinuten: 30, auswertungszeitraumWochen: 26, wechselpauseMinuten: 5 };
  for (const t of termine.filter((x) => x.datum < h)) {
    const anzahl = 3 + Math.floor(r() * 4);
    const faelle: Fall[] = [];
    for (let i = 0; i < anzahl; i++) {
      const v = waehle(fachkraefte);
      const weitere = r() < 0.3 ? [waehle(fachkraefte.filter((x) => x.id !== v.id)).id] : [];
      const z = await fallAnlegen({
        verantwortlichId: v.id, dauerMinuten: waehle([20, 30, 30, 45, 60]), wunsch: { art: "tag", datum: t.datum },
        vorgesetztErforderlich: r() < 0.35, erforderlichIds: weitere, dringend: r() < 0.1,
        erstelltAm: new Date(berlinZuDate(t.datum, "09:00").getTime() - (5 + i) * 86_400_000),
      });
      faelle.push({ id: z.id, verantwortlichId: v.id, kuerzel: z.fallkuerzel, dauerMinuten: z.dauerMinuten, wunsch: { art: "tag", datum: t.datum },
        vorgesetztErforderlich: z.vorgesetztErforderlich, erforderlichIds: weitere, dringend: z.dringend, erstelltAm: z.erstelltAm.toISOString() });
    }
    const entwurf = erzeugePlan({
      tag: { id: t.id, datum: t.datum, beginn: "09:00" }, personen, abwesenheiten, faelle, einstellungen: einst, historie, alleTermine: termine.map((x) => x.datum),
    });
    const veroeffentlicht = berlinZuDate(plusTage(t.datum, -1), "12:00");
    const [plan] = await db
      .insert(s.plan)
      .values({ teamId, konferenztagId: t.id, status: "VEROEFFENTLICHT", gruppenBegruendung: entwurf.gruppenBegruendung,
        nichtEingeplant: entwurf.nichtEingeplant, hinweise: entwurf.hinweise, veroeffentlichtAm: veroeffentlicht, erzeugtAm: veroeffentlicht, geaendertAm: veroeffentlicht })
      .returning();
    for (const g of entwurf.gruppen) {
      const [gz] = await db.insert(s.gruppe).values({ planId: plan!.id, nummer: g.nummer }).returning();
      const sp = gruppenSpanne(g)!;
      await db.insert(s.planPunkt).values(g.punkte.map((p, i) => ({ gruppeId: gz!.id, falleintragId: p.fallId, reihenfolge: i, beginn: p.beginn, ende: p.ende })));
      await db.insert(s.teilnahme).values(g.teilnehmende.map((tn) => ({ gruppeId: gz!.id, personId: tn.personId, art: tn.art, begruendung: tn.begruendung, minuten: sp.bis - sp.von })));
      historie.push(...g.teilnehmende.map((tn) => ({ personId: tn.personId, datum: t.datum, art: tn.art, minuten: sp.bis - sp.von })));
    }
    await db.insert(s.aenderung).values([
      { planId: plan!.id, aktion: "ERZEUGT", beschreibung: "Plan erzeugt (Entwurf).", zeitpunkt: veroeffentlicht },
      { planId: plan!.id, aktion: "VEROEFFENTLICHT", beschreibung: "Plan veröffentlicht. Die Teilnahmen zählen ab jetzt für die Fairnessstatistik.", zeitpunkt: veroeffentlicht },
    ]);
  }

  // Kommende Fälle: verschiedene Situationen zum Ausprobieren
  console.log("Lege kommende Fälle an …");
  const d0 = naechsterDi;
  const d1 = plusTage(d0, 7);
  const d3 = plusTage(d0, 21);
  const tag = (datum: string) => ({ art: "tag" as const, datum });
  await fallAnlegen({ verantwortlichId: P("Kröger").id, kuerzel: "K-311", dauerMinuten: 45, wunsch: tag(d0), vorgesetztErforderlich: true, erforderlichIds: [P("Yıldız").id], dringend: true, notiz: "Bitte als Erstes." });
  await fallAnlegen({ verantwortlichId: P("Yıldız").id, kuerzel: "M-207", dauerMinuten: 30, wunsch: tag(d0), vorgesetztErforderlich: false, erforderlichIds: [], dringend: false });
  await fallAnlegen({ verantwortlichId: P("Lehmann").id, kuerzel: "F-118", dauerMinuten: 30, wunsch: tag(d0), vorgesetztErforderlich: true, erforderlichIds: [], dringend: false });
  await fallAnlegen({ verantwortlichId: P("Albers").id, kuerzel: "S-042", dauerMinuten: 45, wunsch: tag(d0), vorgesetztErforderlich: false, erforderlichIds: [], dringend: false });
  await fallAnlegen({ verantwortlichId: P("Schuster").id, kuerzel: "B-090", dauerMinuten: 20, wunsch: { art: "zeitraum", von: d0, bis: d1 }, vorgesetztErforderlich: false, erforderlichIds: [], dringend: false });
  // Verantwortliche Person ist abwesend → wird für die Folgewoche vorgemerkt
  await fallAnlegen({ verantwortlichId: P("Vogt").id, kuerzel: "A-555", dauerMinuten: 30, wunsch: { art: "zeitraum", von: d0, bis: d1 }, vorgesetztErforderlich: false, erforderlichIds: [], dringend: false });
  // Teilweise abwesende Person als Pflichtperson
  await fallAnlegen({ verantwortlichId: P("Petersen").id, kuerzel: "K-404", dauerMinuten: 30, wunsch: tag(d0), vorgesetztErforderlich: false, erforderlichIds: [], dringend: false });

  // Folgewoche: Leitung abwesend → Vertretung; Zeitfenster bis 11:30
  await fallAnlegen({ verantwortlichId: P("Hansen").id, kuerzel: "M-612", dauerMinuten: 60, wunsch: tag(d1), vorgesetztErforderlich: true, erforderlichIds: [], dringend: false });
  await fallAnlegen({ verantwortlichId: P("Petersen").id, kuerzel: "S-777", dauerMinuten: 45, wunsch: tag(d1), vorgesetztErforderlich: false, erforderlichIds: [P("Albers").id], dringend: false });
  await fallAnlegen({ verantwortlichId: P("Albers").id, kuerzel: "F-303", dauerMinuten: 30, wunsch: tag(d1), vorgesetztErforderlich: false, erforderlichIds: [], dringend: false });
  await fallAnlegen({ verantwortlichId: P("Engel").id, kuerzel: "B-150", dauerMinuten: 60, wunsch: tag(d1), vorgesetztErforderlich: true, erforderlichIds: [], dringend: false });

  // In drei Wochen: nur 2 Personen da
  await fallAnlegen({ verantwortlichId: P("Kröger").id, kuerzel: "K-900", dauerMinuten: 30, wunsch: tag(d3), vorgesetztErforderlich: false, erforderlichIds: [], dringend: false });

  console.log("\nFertig. Anmeldung mit diesen fiktiven Konten (Passwort für alle: " + PASSWORT + "):");
  console.log("  Planung:       helga.brandt@team2.example (Teamleitung), sabine.kroeger@team2.example");
  console.log("  Mitarbeitende: z. B. murat.yildiz@team2.example, elke.hansen@team2.example");
  await db.$client.end();
}

main().catch(async (e) => {
  console.error(e);
  process.exit(1);
});
