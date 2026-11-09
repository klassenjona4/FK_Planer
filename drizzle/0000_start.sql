CREATE TYPE "public"."fall_status" AS ENUM('OFFEN', 'ZURUECKGEZOGEN');--> statement-breakpoint
CREATE TYPE "public"."plan_status" AS ENUM('ENTWURF', 'VEROEFFENTLICHT');--> statement-breakpoint
CREATE TYPE "public"."rolle" AS ENUM('MITARBEITEND', 'PLANUNG');--> statement-breakpoint
CREATE TYPE "public"."teilnahme_art" AS ENUM('EIGENER_FALL', 'ERFORDERLICH', 'VORGESETZT', 'AUFGEFUELLT');--> statement-breakpoint
CREATE TABLE "abwesenheit" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"von_datum" date NOT NULL,
	"bis_datum" date NOT NULL,
	"von_uhrzeit" varchar(5),
	"bis_uhrzeit" varchar(5),
	"erstellt_am" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "aenderung" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_id" uuid NOT NULL,
	"konto_id" uuid,
	"zeitpunkt" timestamp with time zone DEFAULT now() NOT NULL,
	"aktion" varchar(50) NOT NULL,
	"beschreibung" text NOT NULL,
	"vorher" jsonb,
	"nachher" jsonb
);
--> statement-breakpoint
CREATE TABLE "benutzerkonto" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"email" varchar(254) NOT NULL,
	"passwort_hash" text NOT NULL,
	"rolle" "rolle" DEFAULT 'MITARBEITEND' NOT NULL,
	"gesperrt" boolean DEFAULT false NOT NULL,
	"fehlversuche" integer DEFAULT 0 NOT NULL,
	"gesperrt_bis" timestamp with time zone,
	"erstellt_am" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "einstellungen" (
	"team_id" uuid PRIMARY KEY NOT NULL,
	"min_teilnehmende" integer DEFAULT 3 NOT NULL,
	"min_ersparnis_minuten" integer DEFAULT 30 NOT NULL,
	"auswertungszeitraum_wochen" integer DEFAULT 26 NOT NULL,
	"frist_stunden" integer DEFAULT 72 NOT NULL,
	"wechselpause_minuten" integer DEFAULT 5 NOT NULL,
	"standard_beginn" varchar(5) DEFAULT '09:00' NOT NULL,
	"standard_ende" varchar(5),
	"loeschfrist_monate" integer DEFAULT 3 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fall_erforderlich" (
	"falleintrag_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	CONSTRAINT "fall_erforderlich_falleintrag_id_person_id_pk" PRIMARY KEY("falleintrag_id","person_id")
);
--> statement-breakpoint
CREATE TABLE "falleintrag" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_id" uuid NOT NULL,
	"verantwortlich_id" uuid NOT NULL,
	"fallkuerzel" varchar(15) NOT NULL,
	"dauer_minuten" integer NOT NULL,
	"wunsch_von" date NOT NULL,
	"wunsch_bis" date NOT NULL,
	"vorgesetzt_erforderlich" boolean DEFAULT false NOT NULL,
	"dringend" boolean DEFAULT false NOT NULL,
	"notiz" varchar(200),
	"verspaetet" boolean DEFAULT false NOT NULL,
	"status" "fall_status" DEFAULT 'OFFEN' NOT NULL,
	"erstellt_von_id" uuid,
	"erstellt_am" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gruppe" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_id" uuid NOT NULL,
	"nummer" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "konferenztag" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_id" uuid NOT NULL,
	"datum" date NOT NULL,
	"beginn" varchar(5) NOT NULL,
	"ende" varchar(5),
	"frist" timestamp with time zone NOT NULL,
	"raum1" varchar(100),
	"raum2" varchar(100),
	"erstellt_am" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "login_sitzung" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"konto_id" uuid NOT NULL,
	"token_hash" varchar(64) NOT NULL,
	"laeuft_ab_am" timestamp with time zone NOT NULL,
	"erstellt_am" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organisation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(200) NOT NULL,
	"erstellt_am" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "person" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_id" uuid NOT NULL,
	"vorname" varchar(100) NOT NULL,
	"nachname" varchar(100) NOT NULL,
	"stellenanteil" real DEFAULT 1 NOT NULL,
	"ist_vorgesetzt" boolean DEFAULT false NOT NULL,
	"vorgesetzt_rang" integer,
	"darf_aufgefuellt_werden" boolean DEFAULT true NOT NULL,
	"aktiv_von" date,
	"aktiv_bis" date,
	"erstellt_am" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plan" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_id" uuid NOT NULL,
	"konferenztag_id" uuid NOT NULL,
	"status" "plan_status" DEFAULT 'ENTWURF' NOT NULL,
	"gruppen_begruendung" text DEFAULT '' NOT NULL,
	"nicht_eingeplant" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"hinweise" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"erstellt_am" timestamp with time zone DEFAULT now() NOT NULL,
	"geaendert_am" timestamp with time zone DEFAULT now() NOT NULL,
	"veroeffentlicht_am" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "plan_punkt" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"gruppe_id" uuid NOT NULL,
	"falleintrag_id" uuid NOT NULL,
	"reihenfolge" integer NOT NULL,
	"beginn" varchar(5) NOT NULL,
	"ende" varchar(5) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "team" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"name" varchar(200) NOT NULL,
	"erstellt_am" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "teilnahme" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"gruppe_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"art" "teilnahme_art" NOT NULL,
	"begruendung" text NOT NULL,
	"manuell" boolean DEFAULT false NOT NULL,
	"minuten" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "abwesenheit" ADD CONSTRAINT "abwesenheit_team_id_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."team"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "abwesenheit" ADD CONSTRAINT "abwesenheit_person_id_person_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."person"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "aenderung" ADD CONSTRAINT "aenderung_plan_id_plan_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plan"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "aenderung" ADD CONSTRAINT "aenderung_konto_id_benutzerkonto_id_fk" FOREIGN KEY ("konto_id") REFERENCES "public"."benutzerkonto"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "benutzerkonto" ADD CONSTRAINT "benutzerkonto_team_id_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."team"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "benutzerkonto" ADD CONSTRAINT "benutzerkonto_person_id_person_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."person"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "einstellungen" ADD CONSTRAINT "einstellungen_team_id_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."team"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fall_erforderlich" ADD CONSTRAINT "fall_erforderlich_falleintrag_id_falleintrag_id_fk" FOREIGN KEY ("falleintrag_id") REFERENCES "public"."falleintrag"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fall_erforderlich" ADD CONSTRAINT "fall_erforderlich_person_id_person_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."person"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "falleintrag" ADD CONSTRAINT "falleintrag_team_id_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."team"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "falleintrag" ADD CONSTRAINT "falleintrag_verantwortlich_id_person_id_fk" FOREIGN KEY ("verantwortlich_id") REFERENCES "public"."person"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "falleintrag" ADD CONSTRAINT "falleintrag_erstellt_von_id_benutzerkonto_id_fk" FOREIGN KEY ("erstellt_von_id") REFERENCES "public"."benutzerkonto"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gruppe" ADD CONSTRAINT "gruppe_plan_id_plan_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plan"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "konferenztag" ADD CONSTRAINT "konferenztag_team_id_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."team"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "login_sitzung" ADD CONSTRAINT "login_sitzung_konto_id_benutzerkonto_id_fk" FOREIGN KEY ("konto_id") REFERENCES "public"."benutzerkonto"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "person" ADD CONSTRAINT "person_team_id_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."team"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan" ADD CONSTRAINT "plan_team_id_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."team"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan" ADD CONSTRAINT "plan_konferenztag_id_konferenztag_id_fk" FOREIGN KEY ("konferenztag_id") REFERENCES "public"."konferenztag"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_punkt" ADD CONSTRAINT "plan_punkt_gruppe_id_gruppe_id_fk" FOREIGN KEY ("gruppe_id") REFERENCES "public"."gruppe"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_punkt" ADD CONSTRAINT "plan_punkt_falleintrag_id_falleintrag_id_fk" FOREIGN KEY ("falleintrag_id") REFERENCES "public"."falleintrag"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team" ADD CONSTRAINT "team_organisation_id_organisation_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisation"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teilnahme" ADD CONSTRAINT "teilnahme_gruppe_id_gruppe_id_fk" FOREIGN KEY ("gruppe_id") REFERENCES "public"."gruppe"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teilnahme" ADD CONSTRAINT "teilnahme_person_id_person_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."person"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "abwesenheit_team_idx" ON "abwesenheit" USING btree ("team_id","von_datum");--> statement-breakpoint
CREATE INDEX "aenderung_plan_idx" ON "aenderung" USING btree ("plan_id","zeitpunkt");--> statement-breakpoint
CREATE UNIQUE INDEX "konto_email_idx" ON "benutzerkonto" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "konto_person_idx" ON "benutzerkonto" USING btree ("person_id");--> statement-breakpoint
CREATE INDEX "fall_team_idx" ON "falleintrag" USING btree ("team_id","wunsch_bis");--> statement-breakpoint
CREATE UNIQUE INDEX "konferenztag_team_datum_idx" ON "konferenztag" USING btree ("team_id","datum");--> statement-breakpoint
CREATE UNIQUE INDEX "sitzung_token_idx" ON "login_sitzung" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "person_team_idx" ON "person" USING btree ("team_id");--> statement-breakpoint
CREATE UNIQUE INDEX "plan_tag_idx" ON "plan" USING btree ("konferenztag_id");--> statement-breakpoint
CREATE INDEX "teilnahme_person_idx" ON "teilnahme" USING btree ("person_id");