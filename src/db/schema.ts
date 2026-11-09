/**
 * Datenbankschema (PostgreSQL). Mandantenfähig: Alle Fachdaten hängen an einem Team,
 * Teams gehören zu einer Organisation (Jugendamt). Jede Abfrage filtert serverseitig
 * nach dem Team des angemeldeten Kontos.
 *
 * Datensparsamkeit: keine Klientendaten, kein Abwesenheitsgrund, keine Tracking-Daten.
 */
import { sql } from "drizzle-orm";
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

const id = () => uuid("id").primaryKey().default(sql`gen_random_uuid()`);
const erstelltAm = () => timestamp("erstellt_am", { withTimezone: true }).notNull().defaultNow();

export const rolleEnum = pgEnum("rolle", ["MITARBEITEND", "PLANUNG"]);
export const planStatusEnum = pgEnum("plan_status", ["ENTWURF", "VEROEFFENTLICHT"]);
export const teilnahmeArtEnum = pgEnum("teilnahme_art", ["EIGENER_FALL", "ERFORDERLICH", "VORGESETZT", "AUFGEFUELLT"]);
export const fallStatusEnum = pgEnum("fall_status", ["OFFEN", "ZURUECKGEZOGEN"]);

export const organisation = pgTable("organisation", {
  id: id(),
  name: varchar("name", { length: 200 }).notNull(),
  erstelltAm: erstelltAm(),
});

export const team = pgTable("team", {
  id: id(),
  organisationId: uuid("organisation_id").notNull().references(() => organisation.id),
  name: varchar("name", { length: 200 }).notNull(),
  erstelltAm: erstelltAm(),
});

export const person = pgTable(
  "person",
  {
    id: id(),
    teamId: uuid("team_id").notNull().references(() => team.id),
    vorname: varchar("vorname", { length: 100 }).notNull(),
    nachname: varchar("nachname", { length: 100 }).notNull(),
    stellenanteil: real("stellenanteil").notNull().default(1),
    istVorgesetzt: boolean("ist_vorgesetzt").notNull().default(false),
    vorgesetztRang: integer("vorgesetzt_rang"),
    darfAufgefuelltWerden: boolean("darf_aufgefuellt_werden").notNull().default(true),
    aktivVon: date("aktiv_von", { mode: "string" }),
    aktivBis: date("aktiv_bis", { mode: "string" }),
    erstelltAm: erstelltAm(),
  },
  (t) => [index("person_team_idx").on(t.teamId)],
);

export const benutzerkonto = pgTable(
  "benutzerkonto",
  {
    id: id(),
    teamId: uuid("team_id").notNull().references(() => team.id),
    personId: uuid("person_id").notNull().references(() => person.id, { onDelete: "cascade" }),
    email: varchar("email", { length: 254 }).notNull(),
    passwortHash: text("passwort_hash").notNull(),
    rolle: rolleEnum("rolle").notNull().default("MITARBEITEND"),
    gesperrt: boolean("gesperrt").notNull().default(false),
    fehlversuche: integer("fehlversuche").notNull().default(0),
    gesperrtBis: timestamp("gesperrt_bis", { withTimezone: true }),
    erstelltAm: erstelltAm(),
  },
  (t) => [uniqueIndex("konto_email_idx").on(t.email), uniqueIndex("konto_person_idx").on(t.personId)],
);

export const loginSitzung = pgTable(
  "login_sitzung",
  {
    id: id(),
    kontoId: uuid("konto_id").notNull().references(() => benutzerkonto.id, { onDelete: "cascade" }),
    tokenHash: varchar("token_hash", { length: 64 }).notNull(),
    laeuftAbAm: timestamp("laeuft_ab_am", { withTimezone: true }).notNull(),
    erstelltAm: erstelltAm(),
  },
  (t) => [uniqueIndex("sitzung_token_idx").on(t.tokenHash)],
);

export const einstellungen = pgTable("einstellungen", {
  teamId: uuid("team_id").primaryKey().references(() => team.id),
  minTeilnehmende: integer("min_teilnehmende").notNull().default(3),
  minErsparnisMinuten: integer("min_ersparnis_minuten").notNull().default(30),
  auswertungszeitraumWochen: integer("auswertungszeitraum_wochen").notNull().default(26),
  fristStunden: integer("frist_stunden").notNull().default(72),
  wechselpauseMinuten: integer("wechselpause_minuten").notNull().default(5),
  standardBeginn: varchar("standard_beginn", { length: 5 }).notNull().default("09:00"),
  standardEnde: varchar("standard_ende", { length: 5 }),
  loeschfristMonate: integer("loeschfrist_monate").notNull().default(3),
});

export const konferenztag = pgTable(
  "konferenztag",
  {
    id: id(),
    teamId: uuid("team_id").notNull().references(() => team.id),
    datum: date("datum", { mode: "string" }).notNull(),
    beginn: varchar("beginn", { length: 5 }).notNull(),
    ende: varchar("ende", { length: 5 }),
    frist: timestamp("frist", { withTimezone: true }).notNull(),
    raum1: varchar("raum1", { length: 100 }),
    raum2: varchar("raum2", { length: 100 }),
    erstelltAm: erstelltAm(),
  },
  (t) => [uniqueIndex("konferenztag_team_datum_idx").on(t.teamId, t.datum)],
);

export const abwesenheit = pgTable(
  "abwesenheit",
  {
    id: id(),
    teamId: uuid("team_id").notNull().references(() => team.id),
    personId: uuid("person_id").notNull().references(() => person.id, { onDelete: "cascade" }),
    vonDatum: date("von_datum", { mode: "string" }).notNull(),
    bisDatum: date("bis_datum", { mode: "string" }).notNull(),
    vonUhrzeit: varchar("von_uhrzeit", { length: 5 }),
    bisUhrzeit: varchar("bis_uhrzeit", { length: 5 }),
    erstelltAm: erstelltAm(),
  },
  (t) => [index("abwesenheit_team_idx").on(t.teamId, t.vonDatum)],
);

export const falleintrag = pgTable(
  "falleintrag",
  {
    id: id(),
    teamId: uuid("team_id").notNull().references(() => team.id),
    verantwortlichId: uuid("verantwortlich_id").notNull().references(() => person.id),
    fallkuerzel: varchar("fallkuerzel", { length: 15 }).notNull(),
    dauerMinuten: integer("dauer_minuten").notNull(),
    wunschVon: date("wunsch_von", { mode: "string" }).notNull(),
    /** gleich wunschVon bei einem bestimmten Termin */
    wunschBis: date("wunsch_bis", { mode: "string" }).notNull(),
    vorgesetztErforderlich: boolean("vorgesetzt_erforderlich").notNull().default(false),
    dringend: boolean("dringend").notNull().default(false),
    notiz: varchar("notiz", { length: 200 }),
    verspaetet: boolean("verspaetet").notNull().default(false),
    status: fallStatusEnum("status").notNull().default("OFFEN"),
    erstelltVonId: uuid("erstellt_von_id").references(() => benutzerkonto.id, { onDelete: "set null" }),
    erstelltAm: erstelltAm(),
  },
  (t) => [index("fall_team_idx").on(t.teamId, t.wunschBis)],
);

export const fallErforderlich = pgTable(
  "fall_erforderlich",
  {
    falleintragId: uuid("falleintrag_id").notNull().references(() => falleintrag.id, { onDelete: "cascade" }),
    personId: uuid("person_id").notNull().references(() => person.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.falleintragId, t.personId] })],
);

export const plan = pgTable(
  "plan",
  {
    id: id(),
    teamId: uuid("team_id").notNull().references(() => team.id),
    konferenztagId: uuid("konferenztag_id").notNull().references(() => konferenztag.id, { onDelete: "cascade" }),
    status: planStatusEnum("status").notNull().default("ENTWURF"),
    gruppenBegruendung: text("gruppen_begruendung").notNull().default(""),
    nichtEingeplant: jsonb("nicht_eingeplant").notNull().default([]),
    hinweise: jsonb("hinweise").notNull().default([]),
    version: integer("version").notNull().default(1),
    erzeugtAm: erstelltAm(),
    geaendertAm: timestamp("geaendert_am", { withTimezone: true }).notNull().defaultNow(),
    veroeffentlichtAm: timestamp("veroeffentlicht_am", { withTimezone: true }),
  },
  (t) => [uniqueIndex("plan_tag_idx").on(t.konferenztagId)],
);

export const gruppe = pgTable("gruppe", {
  id: id(),
  planId: uuid("plan_id").notNull().references(() => plan.id, { onDelete: "cascade" }),
  nummer: integer("nummer").notNull(),
});

export const planPunkt = pgTable("plan_punkt", {
  id: id(),
  gruppeId: uuid("gruppe_id").notNull().references(() => gruppe.id, { onDelete: "cascade" }),
  /** Fall wird nach Ablauf der Löschfrist entfernt; der Planpunkt verschwindet dann mit. */
  falleintragId: uuid("falleintrag_id").notNull().references(() => falleintrag.id, { onDelete: "cascade" }),
  reihenfolge: integer("reihenfolge").notNull(),
  beginn: varchar("beginn", { length: 5 }).notNull(),
  ende: varchar("ende", { length: 5 }).notNull(),
});

export const teilnahme = pgTable(
  "teilnahme",
  {
    id: id(),
    gruppeId: uuid("gruppe_id").notNull().references(() => gruppe.id, { onDelete: "cascade" }),
    personId: uuid("person_id").notNull().references(() => person.id, { onDelete: "cascade" }),
    art: teilnahmeArtEnum("art").notNull(),
    begruendung: text("begruendung").notNull(),
    manuell: boolean("manuell").notNull().default(false),
    /** Dauer der Gruppe in Minuten (bleibt für die Statistik erhalten, auch wenn Fälle gelöscht werden) */
    minuten: integer("minuten").notNull().default(0),
  },
  (t) => [index("teilnahme_person_idx").on(t.personId)],
);

export const aenderung = pgTable(
  "aenderung",
  {
    id: id(),
    planId: uuid("plan_id").notNull().references(() => plan.id, { onDelete: "cascade" }),
    kontoId: uuid("konto_id").references(() => benutzerkonto.id, { onDelete: "set null" }),
    zeitpunkt: timestamp("zeitpunkt", { withTimezone: true }).notNull().defaultNow(),
    aktion: varchar("aktion", { length: 50 }).notNull(),
    beschreibung: text("beschreibung").notNull(),
    vorher: jsonb("vorher"),
    nachher: jsonb("nachher"),
  },
  (t) => [index("aenderung_plan_idx").on(t.planId, t.zeitpunkt)],
);
