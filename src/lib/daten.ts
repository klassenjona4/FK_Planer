import "server-only";
import { and, asc, eq, inArray, ne } from "drizzle-orm";
import { db, schema } from "@/db";
import {
  berechneFairness,
  gruppenSpanne,
  normalisiereTeilnahmen,
  personName,
  type Abwesenheit,
  type Einstellungen,
  type Fall,
  type FairnessZeile,
  type HistorischeTeilnahme,
  type NichtEingeplant,
  type Person,
  type PlanEntwurf,
  type PlanungsEingabe,
} from "@/planung";
import { beschreibeAenderungen } from "./aenderungen";
import { heute } from "./zeit-server";

const s = schema;

// ---------------------------------------------------------------------------
// Grunddaten (immer auf das Team begrenzt)
// ---------------------------------------------------------------------------

export async function ladeEinstellungen(teamId: string) {
  const [e] = await db.select().from(s.einstellungen).where(eq(s.einstellungen.teamId, teamId));
  if (e) return e;
  const [neu] = await db.insert(s.einstellungen).values({ teamId }).returning();
  return neu!;
}

export function planungsEinstellungen(e: Awaited<ReturnType<typeof ladeEinstellungen>>): Einstellungen {
  return {
    minTeilnehmende: e.minTeilnehmende,
    minErsparnisMinuten: e.minErsparnisMinuten,
    auswertungszeitraumWochen: e.auswertungszeitraumWochen,
    wechselpauseMinuten: e.wechselpauseMinuten,
  };
}

export async function ladePersonen(teamId: string): Promise<Person[]> {
  const zeilen = await db
    .select()
    .from(s.person)
    .where(eq(s.person.teamId, teamId))
    .orderBy(asc(s.person.nachname), asc(s.person.vorname));
  return zeilen.map((p) => ({
    id: p.id,
    vorname: p.vorname,
    nachname: p.nachname,
    stellenanteil: p.stellenanteil,
    istVorgesetzt: p.istVorgesetzt,
    vorgesetztRang: p.vorgesetztRang,
    darfAufgefuelltWerden: p.darfAufgefuelltWerden,
    aktivVon: p.aktivVon,
    aktivBis: p.aktivBis,
  }));
}

export async function ladeAbwesenheiten(teamId: string): Promise<Abwesenheit[]> {
  const zeilen = await db.select().from(s.abwesenheit).where(eq(s.abwesenheit.teamId, teamId));
  return zeilen.map((a) => ({
    personId: a.personId,
    vonDatum: a.vonDatum,
    bisDatum: a.bisDatum,
    vonUhrzeit: a.vonUhrzeit,
    bisUhrzeit: a.bisUhrzeit,
  }));
}

export async function ladeTermine(teamId: string) {
  return db.select().from(s.konferenztag).where(eq(s.konferenztag.teamId, teamId)).orderBy(asc(s.konferenztag.datum));
}

export async function ladeTermin(teamId: string, tagId: string) {
  const [t] = await db
    .select()
    .from(s.konferenztag)
    .where(and(eq(s.konferenztag.teamId, teamId), eq(s.konferenztag.id, tagId)));
  return t ?? null;
}

/** Alle Fälle eines Teams im Format des Planungsmoduls (inkl. zurückgezogener, falls gewünscht). */
export async function ladeFaelle(teamId: string, nurOffene = true): Promise<Fall[]> {
  const bedingung = nurOffene
    ? and(eq(s.falleintrag.teamId, teamId), eq(s.falleintrag.status, "OFFEN"))
    : eq(s.falleintrag.teamId, teamId);
  const zeilen = await db.select().from(s.falleintrag).where(bedingung);
  const ids = zeilen.map((z) => z.id);
  const erf = ids.length
    ? await db.select().from(s.fallErforderlich).where(inArray(s.fallErforderlich.falleintragId, ids))
    : [];
  return zeilen.map((f) => ({
    id: f.id,
    verantwortlichId: f.verantwortlichId,
    kuerzel: f.fallkuerzel,
    dauerMinuten: f.dauerMinuten,
    wunsch: f.wunschVon === f.wunschBis ? { art: "tag", datum: f.wunschVon } : { art: "zeitraum", von: f.wunschVon, bis: f.wunschBis },
    vorgesetztErforderlich: f.vorgesetztErforderlich,
    erforderlichIds: erf.filter((e) => e.falleintragId === f.id).map((e) => e.personId).sort(),
    dringend: f.dringend,
    erstelltAm: f.erstelltAm.toISOString(),
  }));
}

/** Teilnahmen aus veröffentlichten Plänen (für die Fairness). */
export async function ladeHistorie(teamId: string, ohneTagId?: string): Promise<HistorischeTeilnahme[]> {
  const zeilen = await db
    .select({
      personId: s.teilnahme.personId,
      art: s.teilnahme.art,
      minuten: s.teilnahme.minuten,
      datum: s.konferenztag.datum,
      tagId: s.konferenztag.id,
    })
    .from(s.teilnahme)
    .innerJoin(s.gruppe, eq(s.teilnahme.gruppeId, s.gruppe.id))
    .innerJoin(s.plan, eq(s.gruppe.planId, s.plan.id))
    .innerJoin(s.konferenztag, eq(s.plan.konferenztagId, s.konferenztag.id))
    .where(and(eq(s.plan.teamId, teamId), eq(s.plan.status, "VEROEFFENTLICHT")));
  return zeilen
    .filter((z) => z.tagId !== ohneTagId)
    .map((z) => ({ personId: z.personId, art: z.art, minuten: z.minuten, datum: z.datum }));
}

/** IDs der Fälle, die bereits in einem veröffentlichten Plan eines anderen Tages stehen. */
async function verplanteFallIds(teamId: string, ausserTagId: string): Promise<Set<string>> {
  const zeilen = await db
    .select({ fallId: s.planPunkt.falleintragId })
    .from(s.planPunkt)
    .innerJoin(s.gruppe, eq(s.planPunkt.gruppeId, s.gruppe.id))
    .innerJoin(s.plan, eq(s.gruppe.planId, s.plan.id))
    .where(and(eq(s.plan.teamId, teamId), eq(s.plan.status, "VEROEFFENTLICHT"), ne(s.plan.konferenztagId, ausserTagId)));
  return new Set(zeilen.map((z) => z.fallId));
}

export async function ladePlanungsEingabe(teamId: string, tagId: string): Promise<PlanungsEingabe | null> {
  const tag = await ladeTermin(teamId, tagId);
  if (!tag) return null;
  const [personen, abwesenheiten, alleFaelle, einst, historie, termine, verplant] = await Promise.all([
    ladePersonen(teamId),
    ladeAbwesenheiten(teamId),
    ladeFaelle(teamId),
    ladeEinstellungen(teamId),
    ladeHistorie(teamId, tagId),
    ladeTermine(teamId),
    verplanteFallIds(teamId, tagId),
  ]);
  return {
    tag: { id: tag.id, datum: tag.datum, beginn: tag.beginn, ende: tag.ende },
    personen,
    abwesenheiten,
    faelle: alleFaelle.filter((f) => !verplant.has(f.id)),
    einstellungen: planungsEinstellungen(einst),
    historie,
    alleTermine: termine.map((t) => t.datum),
  };
}

// ---------------------------------------------------------------------------
// Pläne
// ---------------------------------------------------------------------------

export interface GespeicherterPlan {
  id: string;
  status: "ENTWURF" | "VEROEFFENTLICHT";
  version: number;
  veroeffentlichtAm: Date | null;
  geaendertAm: Date;
  entwurf: PlanEntwurf;
}

export async function ladePlan(teamId: string, tagId: string): Promise<GespeicherterPlan | null> {
  const [p] = await db
    .select({ plan: s.plan, datum: s.konferenztag.datum })
    .from(s.plan)
    .innerJoin(s.konferenztag, eq(s.plan.konferenztagId, s.konferenztag.id))
    .where(and(eq(s.plan.teamId, teamId), eq(s.plan.konferenztagId, tagId)));
  if (!p) return null;
  const gruppen = await db.select().from(s.gruppe).where(eq(s.gruppe.planId, p.plan.id)).orderBy(asc(s.gruppe.nummer));
  const gIds = gruppen.map((g) => g.id);
  const [punkte, teilnahmen] = gIds.length
    ? await Promise.all([
        db.select().from(s.planPunkt).where(inArray(s.planPunkt.gruppeId, gIds)).orderBy(asc(s.planPunkt.reihenfolge)),
        db.select().from(s.teilnahme).where(inArray(s.teilnahme.gruppeId, gIds)),
      ])
    : [[], []];
  return {
    id: p.plan.id,
    status: p.plan.status,
    version: p.plan.version,
    veroeffentlichtAm: p.plan.veroeffentlichtAm,
    geaendertAm: p.plan.geaendertAm,
    entwurf: {
      tagId,
      datum: p.datum,
      gruppenBegruendung: p.plan.gruppenBegruendung,
      nichtEingeplant: p.plan.nichtEingeplant as NichtEingeplant[],
      hinweise: p.plan.hinweise as string[],
      gruppen: gruppen.map((g) => ({
        nummer: g.nummer,
        punkte: punkte.filter((pt) => pt.gruppeId === g.id).map((pt) => ({ fallId: pt.falleintragId, beginn: pt.beginn, ende: pt.ende })),
        teilnehmende: teilnahmen
          .filter((t) => t.gruppeId === g.id)
          .map((t) => ({ personId: t.personId, art: t.art, begruendung: t.begruendung, manuell: t.manuell })),
      })),
    },
  };
}

/**
 * Speichert einen Plan (neu oder geändert). Bei veröffentlichten Plänen wird jede
 * Änderung im Verlauf protokolliert; die Statistik korrigiert sich automatisch,
 * weil sie aus den gespeicherten Teilnahmen berechnet wird.
 */
export async function speicherePlan(opts: {
  teamId: string;
  kontoId: string;
  entwurf: PlanEntwurf;
  eingabe: PlanungsEingabe;
  aktion: "ERZEUGT" | "GEAENDERT";
  kommentar?: string;
}): Promise<{ beschreibung: string[] }> {
  const { teamId, kontoId, eingabe, aktion } = opts;
  const entwurf = normalisiereTeilnahmen(opts.entwurf, eingabe);
  const vorher = await ladePlan(teamId, entwurf.tagId);
  const namen = new Map(eingabe.personen.map((p) => [p.id, personName(p)]));
  const kuerzel = new Map(eingabe.faelle.map((f) => [f.id, f.kuerzel]));
  const beschreibung = vorher
    ? beschreibeAenderungen(vorher.entwurf, entwurf, (id) => namen.get(id) ?? "?", (id) => kuerzel.get(id) ?? "?")
    : [];

  // Nur Personen und Fälle des eigenen Teams zulassen (Schutz vor manipulierten Anfragen)
  const erlaubtePersonen = new Set(eingabe.personen.map((p) => p.id));
  const erlaubteFaelle = new Set(eingabe.faelle.map((f) => f.id));
  for (const g of entwurf.gruppen) {
    if (g.teilnehmende.some((t) => !erlaubtePersonen.has(t.personId))) throw new Error("Unbekannte Person im Plan.");
    if (g.punkte.some((p) => !erlaubteFaelle.has(p.fallId))) throw new Error("Unbekannter Fall im Plan.");
  }

  await db.transaction(async (tx) => {
    let planId = vorher?.id;
    if (!planId) {
      const [neu] = await tx
        .insert(s.plan)
        .values({
          teamId,
          konferenztagId: entwurf.tagId,
          gruppenBegruendung: entwurf.gruppenBegruendung,
          nichtEingeplant: entwurf.nichtEingeplant,
          hinweise: entwurf.hinweise,
        })
        .returning({ id: s.plan.id });
      planId = neu!.id;
    } else {
      await tx
        .update(s.plan)
        .set({
          gruppenBegruendung: entwurf.gruppenBegruendung,
          nichtEingeplant: entwurf.nichtEingeplant,
          hinweise: entwurf.hinweise,
          version: (vorher?.version ?? 0) + 1,
          geaendertAm: new Date(),
        })
        .where(eq(s.plan.id, planId));
      await tx.delete(s.gruppe).where(eq(s.gruppe.planId, planId));
    }
    for (const g of entwurf.gruppen) {
      const [gz] = await tx.insert(s.gruppe).values({ planId, nummer: g.nummer }).returning({ id: s.gruppe.id });
      const spanne = gruppenSpanne(g);
      const minuten = spanne ? spanne.bis - spanne.von : 0;
      if (g.punkte.length) {
        await tx.insert(s.planPunkt).values(
          g.punkte.map((p, i) => ({ gruppeId: gz!.id, falleintragId: p.fallId, reihenfolge: i, beginn: p.beginn, ende: p.ende })),
        );
      }
      if (g.teilnehmende.length) {
        await tx.insert(s.teilnahme).values(
          g.teilnehmende.map((t) => ({
            gruppeId: gz!.id,
            personId: t.personId,
            art: t.art,
            begruendung: t.begruendung,
            manuell: !!t.manuell,
            minuten,
          })),
        );
      }
    }
    if (vorher?.status === "VEROEFFENTLICHT" || aktion === "ERZEUGT") {
      await tx.insert(s.aenderung).values({
        planId,
        kontoId,
        aktion,
        beschreibung:
          aktion === "ERZEUGT"
            ? vorher
              ? "Plan neu erzeugt." + (beschreibung.length ? " " + beschreibung.join(" ") : "")
              : "Plan erzeugt (Entwurf)."
            : (beschreibung.join(" ") || "Plan gespeichert, keine inhaltliche Änderung.") +
              (opts.kommentar ? ` Anmerkung: ${opts.kommentar}` : ""),
        vorher: vorher?.entwurf ?? null,
        nachher: entwurf,
      });
    }
  });
  return { beschreibung };
}

export async function veroeffentlichePlan(teamId: string, kontoId: string, tagId: string): Promise<void> {
  const p = await ladePlan(teamId, tagId);
  if (!p) throw new Error("Kein Plan vorhanden.");
  await db.transaction(async (tx) => {
    await tx
      .update(s.plan)
      .set({ status: "VEROEFFENTLICHT", veroeffentlichtAm: p.veroeffentlichtAm ?? new Date(), geaendertAm: new Date() })
      .where(eq(s.plan.id, p.id));
    await tx.insert(s.aenderung).values({
      planId: p.id,
      kontoId,
      aktion: "VEROEFFENTLICHT",
      beschreibung: "Plan veröffentlicht. Die Teilnahmen zählen ab jetzt für die Fairnessstatistik.",
      nachher: p.entwurf,
    });
  });
}

export async function ladeVerlauf(teamId: string, tagId: string) {
  return db
    .select({
      id: s.aenderung.id,
      zeitpunkt: s.aenderung.zeitpunkt,
      aktion: s.aenderung.aktion,
      beschreibung: s.aenderung.beschreibung,
      vorname: s.person.vorname,
      nachname: s.person.nachname,
    })
    .from(s.aenderung)
    .innerJoin(s.plan, eq(s.aenderung.planId, s.plan.id))
    .leftJoin(s.benutzerkonto, eq(s.aenderung.kontoId, s.benutzerkonto.id))
    .leftJoin(s.person, eq(s.benutzerkonto.personId, s.person.id))
    .where(and(eq(s.plan.teamId, teamId), eq(s.plan.konferenztagId, tagId)))
    .orderBy(asc(s.aenderung.zeitpunkt));
}

// ---------------------------------------------------------------------------
// Fairness
// ---------------------------------------------------------------------------

/**
 * Fairness bis heute bzw. bis zum letzten veröffentlichten Termin, falls dieser in der
 * Zukunft liegt (veröffentlichte Teilnahmen zählen ab Veröffentlichung).
 */
export async function ladeFairness(teamId: string): Promise<{ zeilen: FairnessZeile[]; wochen: number; stichtag: string }> {
  const [personen, abwesenheiten, historie, termine, einst] = await Promise.all([
    ladePersonen(teamId),
    ladeAbwesenheiten(teamId),
    ladeHistorie(teamId),
    ladeTermine(teamId),
    ladeEinstellungen(teamId),
  ]);
  const stichtag = [heute(), ...historie.map((t) => t.datum)].sort().at(-1)!;
  const zeilen = berechneFairness({
    personen,
    abwesenheiten,
    teilnahmen: historie,
    alleTermine: termine.map((t) => t.datum),
    stichtag,
    einstellungen: { auswertungszeitraumWochen: einst.auswertungszeitraumWochen },
  });
  return { zeilen, wochen: einst.auswertungszeitraumWochen, stichtag };
}

// ---------------------------------------------------------------------------
// Eigene Termine
// ---------------------------------------------------------------------------

export interface EigenerTermin {
  tagId: string;
  datum: string;
  gruppe: number;
  gruppenAnzahl: number;
  beginn: string;
  ende: string;
  art: string;
  begruendung: string;
  faelle: Array<{ kuerzel: string; beginn: string; ende: string; eigener: boolean }>;
  raum: string | null;
}

export async function ladeEigeneTermine(teamId: string, personId: string, abDatum?: string): Promise<EigenerTermin[]> {
  const zeilen = await db
    .select({
      tagId: s.konferenztag.id,
      datum: s.konferenztag.datum,
      raum1: s.konferenztag.raum1,
      raum2: s.konferenztag.raum2,
      gruppeId: s.gruppe.id,
      nummer: s.gruppe.nummer,
      planId: s.plan.id,
      art: s.teilnahme.art,
      begruendung: s.teilnahme.begruendung,
    })
    .from(s.teilnahme)
    .innerJoin(s.gruppe, eq(s.teilnahme.gruppeId, s.gruppe.id))
    .innerJoin(s.plan, eq(s.gruppe.planId, s.plan.id))
    .innerJoin(s.konferenztag, eq(s.plan.konferenztagId, s.konferenztag.id))
    .where(and(eq(s.plan.teamId, teamId), eq(s.plan.status, "VEROEFFENTLICHT"), eq(s.teilnahme.personId, personId)))
    .orderBy(asc(s.konferenztag.datum));
  const relevant = zeilen.filter((z) => !abDatum || z.datum >= abDatum);
  if (relevant.length === 0) return [];
  const gruppenIds = relevant.map((z) => z.gruppeId);
  const punkte = await db
    .select({
      gruppeId: s.planPunkt.gruppeId,
      beginn: s.planPunkt.beginn,
      ende: s.planPunkt.ende,
      kuerzel: s.falleintrag.fallkuerzel,
      verantwortlichId: s.falleintrag.verantwortlichId,
      reihenfolge: s.planPunkt.reihenfolge,
    })
    .from(s.planPunkt)
    .innerJoin(s.falleintrag, eq(s.planPunkt.falleintragId, s.falleintrag.id))
    .where(inArray(s.planPunkt.gruppeId, gruppenIds))
    .orderBy(asc(s.planPunkt.reihenfolge));
  const anzahl = await db
    .select({ planId: s.gruppe.planId })
    .from(s.gruppe)
    .where(inArray(s.gruppe.planId, relevant.map((z) => z.planId)));
  return relevant
    .map((z) => {
      const fs = punkte.filter((p) => p.gruppeId === z.gruppeId).sort((a, b) => a.beginn.localeCompare(b.beginn));
      const gruppenAnzahl = anzahl.filter((a) => a.planId === z.planId).length;
      return {
        tagId: z.tagId,
        datum: z.datum,
        gruppe: z.nummer,
        gruppenAnzahl,
        beginn: fs[0]?.beginn ?? "",
        ende: fs.map((f) => f.ende).sort().at(-1) ?? "",
        art: z.art,
        begruendung: z.begruendung,
        raum: z.nummer === 2 ? z.raum2 : z.raum1,
        faelle: fs.map((f) => ({ kuerzel: f.kuerzel, beginn: f.beginn, ende: f.ende, eigener: f.verantwortlichId === personId })),
      };
    })
    .filter((t) => t.beginn !== "");
}
