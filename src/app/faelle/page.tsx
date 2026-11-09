import Link from "next/link";
import { and, eq, inArray } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { Avatar } from "@/components/Avatar";
import { Seitenkopf } from "@/components/Seitenkopf";
import { Symbol } from "@/components/Symbole";
import { brauchtAnmeldung, istPlanung } from "@/lib/auth";
import { ladePersonen } from "@/lib/daten";
import { heute } from "@/lib/zeit-server";
import { datumKurz, personName, plusTage } from "@/planung";

export const metadata = { title: "Fälle" };

type Filter = "alle" | "meine" | "dringend" | "verspaetet" | "vorgesetzt";
const FILTER: Array<{ wert: Filter; text: string; nurPlanung?: boolean }> = [
  { wert: "alle", text: "Alle" },
  { wert: "meine", text: "Meine Fälle", nurPlanung: true },
  { wert: "dringend", text: "Dringend" },
  { wert: "verspaetet", text: "Verspätet" },
  { wert: "vorgesetzt", text: "Mit Vorgesetzten" },
];

export default async function FaelleSeite({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const konto = await brauchtAnmeldung();
  const sp = await searchParams;
  const planung = istPlanung(konto);
  const zurueckgezogene = sp.alle === "1";
  const filter: Filter = (FILTER.some((f) => f.wert === sp.filter) ? sp.filter : "alle") as Filter;

  const [personen, faelle] = await Promise.all([
    ladePersonen(konto.teamId),
    db.select().from(s.falleintrag).where(eq(s.falleintrag.teamId, konto.teamId)).orderBy(s.falleintrag.wunschVon, s.falleintrag.erstelltAm),
  ]);
  const ids = faelle.map((f) => f.id);
  const [erf, orte] = ids.length
    ? await Promise.all([
        db.select().from(s.fallErforderlich).where(inArray(s.fallErforderlich.falleintragId, ids)),
        db
          .select({ fallId: s.planPunkt.falleintragId, beginn: s.planPunkt.beginn, ende: s.planPunkt.ende, nummer: s.gruppe.nummer, status: s.plan.status, datum: s.konferenztag.datum, tagId: s.konferenztag.id })
          .from(s.planPunkt)
          .innerJoin(s.gruppe, eq(s.planPunkt.gruppeId, s.gruppe.id))
          .innerJoin(s.plan, eq(s.gruppe.planId, s.plan.id))
          .innerJoin(s.konferenztag, eq(s.plan.konferenztagId, s.konferenztag.id))
          .where(and(eq(s.plan.teamId, konto.teamId), inArray(s.planPunkt.falleintragId, ids))),
      ])
    : [[], []];
  const name = new Map(personen.map((p) => [p.id, personName(p)]));
  const h = heute();

  // Sichtbarkeit: Planung sieht alles, Mitarbeitende eigene Fälle und Fälle, bei denen sie erforderlich sind
  const sichtbar = faelle.filter((f) => {
    if (!zurueckgezogene && f.status === "ZURUECKGEZOGEN") return false;
    if (planung) return true;
    return f.verantwortlichId === konto.personId || erf.some((e) => e.falleintragId === f.id && e.personId === konto.personId);
  });
  const passt = (f: (typeof faelle)[number], wert: Filter) =>
    wert === "alle" ? true
      : wert === "meine" ? f.verantwortlichId === konto.personId
      : wert === "dringend" ? f.dringend
      : wert === "verspaetet" ? f.verspaetet
      : f.vorgesetztErforderlich;
  const gefiltert = sichtbar.filter((f) => passt(f, filter));

  const ortVon = (id: string) => orte.find((x) => x.fallId === id && x.status === "VEROEFFENTLICHT") ?? orte.find((x) => x.fallId === id);
  type Fall = (typeof faelle)[number];
  const spalten: Record<"wartet" | "entwurf" | "eingeplant" | "offen" | "besprochen", Fall[]> = { wartet: [], entwurf: [], eingeplant: [], offen: [], besprochen: [] };
  for (const f of gefiltert) {
    const o = ortVon(f.id);
    if (f.status === "ZURUECKGEZOGEN") spalten.offen.push(f);
    else if (o?.status === "VEROEFFENTLICHT") (o.datum < h ? spalten.besprochen : spalten.eingeplant).push(f);
    else if (o) spalten.entwurf.push(f);
    else if (f.wunschBis < h) spalten.offen.push(f);
    else spalten.wartet.push(f);
  }
  spalten.besprochen.reverse();

  // Kennzahlen für die „Besprochen“-Spalte: letzte 4 Wochen
  const seit = plusTage(h, -28);
  const kuerzlich = spalten.besprochen.filter((f) => (ortVon(f.id)?.datum ?? "") >= seit);
  const minuten = kuerzlich.reduce((sum, f) => sum + f.dauerMinuten, 0);
  const dringendAnteil = kuerzlich.length ? Math.round((kuerzlich.filter((f) => f.dringend).length / kuerzlich.length) * 100) : 0;

  const karte = (f: Fall, gedaempft = false) => {
    const o = ortVon(f.id);
    const darf = planung || f.verantwortlichId === konto.personId;
    const weitere = erf.filter((e) => e.falleintragId === f.id).map((e) => name.get(e.personId) ?? "?");
    const verantwortlich = name.get(f.verantwortlichId) ?? "?";
    return (
      <article key={f.id} className={`fallkarte${gedaempft ? " gedaempft" : ""}`} aria-label={`Fall ${f.fallkuerzel}`}>
        <div className="fallkarte-kopf">
          <Avatar name={verantwortlich} />
          <div className="fallkarte-titel">
            <strong>{f.fallkuerzel}</strong>
            <span className="unter">{verantwortlich}</span>
          </div>
          {f.dringend && <span className="abzeichen dringend">dringend</span>}
        </div>
        <div className="fallkarte-meta">
          {o ? (
            <Link className="abzeichen" href={`/plan/${o.tagId}`}><Symbol name="plan" /> {datumKurz(o.datum)}, {o.beginn} · G{o.nummer}</Link>
          ) : (
            <span className="abzeichen"><Symbol name="plan" /> {f.wunschVon === f.wunschBis ? datumKurz(f.wunschVon) : `${datumKurz(f.wunschVon)} – ${datumKurz(f.wunschBis)}`}</span>
          )}
          <span className="abzeichen"><Symbol name="uhr" /> {f.dauerMinuten} Min.</span>
          {f.vorgesetztErforderlich && <span className="abzeichen">mit Vorgesetzten</span>}
          {f.verspaetet && <span className="abzeichen warnung">verspätet</span>}
          {f.status === "ZURUECKGEZOGEN" && <span className="abzeichen leer">zurückgezogen</span>}
        </div>
        {weitere.length > 0 && <p className="grund">Außerdem dabei: {weitere.join(", ")}</p>}
        {darf && f.notiz && (
          <div className="notiz"><Symbol name="info" /><span>{f.notiz}</span></div>
        )}
        {darf && f.status === "OFFEN" && !gedaempft && (
          <div className="knopfleiste">
            <Link className="knopf zweitrangig klein breit" href={`/faelle/${f.id}`}>Bearbeiten<span className="nur-sr"> (Fall {f.fallkuerzel})</span></Link>
          </div>
        )}
      </article>
    );
  };

  const spalte = (titel: string, liste: Fall[], hinweis: string, inhalt?: React.ReactNode, extra?: { gruen?: boolean; gedaempft?: boolean; mitHinzufuegen?: boolean }) => (
    <section className={`board-spalte${extra?.gruen ? " gruen" : ""}`} aria-labelledby={`sp-${titel}`}>
      <div className="spalten-kopf">
        <h2 id={`sp-${titel}`}>{titel}</h2>
        <span className="anzahl"><span className="nur-sr">Anzahl: </span>{liste.length}</span>
        <span className="hinweis">{hinweis}</span>
      </div>
      <div className="spalten-inhalt">
        {inhalt}
        {liste.length === 0 && !inhalt && <p className="spalte-leer">Keine Fälle</p>}
        {liste.slice(0, extra?.gedaempft ? 8 : undefined).map((f) => karte(f, extra?.gedaempft))}
      </div>
      {extra?.mitHinzufuegen && (
        <div className="spalten-fuss"><Link href="/fall-eintragen">+ Fall eintragen</Link></div>
      )}
    </section>
  );

  const link = (werte: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const f = werte.filter ?? filter;
    if (f !== "alle") p.set("filter", f);
    if ((werte.alle ?? (zurueckgezogene ? "1" : "")) === "1") p.set("alle", "1");
    const q = p.toString();
    return q ? `/faelle?${q}` : "/faelle";
  };

  return (
    <>
      <Seitenkopf
        titel={planung ? "Fälle des Teams" : "Meine Fälle"}
        unterzeile={planung ? "Alle eingetragenen Fälle nach Stand der Planung." : "Ihre Fälle und Fälle, bei denen Sie als erforderlich angegeben sind."}
      />
      {sp.hinweis === "zurueckgezogen" && <div className="meldung erfolg" role="status"><p>Der Fall wurde zurückgezogen.</p></div>}
      {sp.fehler === "keine-berechtigung" && <div className="meldung fehler" role="alert"><p>Sie dürfen diesen Fall nicht bearbeiten.</p></div>}

      <div className="chips-zeile">
        <nav className="chips" aria-label="Fälle filtern">
          {FILTER.filter((f) => planung || !f.nurPlanung).map((f) => (
            <Link key={f.wert} className="chip" href={link({ filter: f.wert })} aria-current={filter === f.wert ? "true" : undefined}>
              {f.text} <span className="anzahl">{sichtbar.filter((x) => passt(x, f.wert)).length}</span>
            </Link>
          ))}
          <Link className="chip" href={link({ alle: zurueckgezogene ? "0" : "1" })} aria-current={zurueckgezogene ? "true" : undefined}>
            Zurückgezogene zeigen
          </Link>
        </nav>
        <p className="leise" style={{ margin: 0 }} role="status">{gefiltert.length} von {sichtbar.length} Fällen</p>
      </div>

      <div className="board">
        {spalte("Wartet auf Planung", spalten.wartet, "noch kein Plan", undefined, { mitHinzufuegen: true })}
        {spalte("Im Planentwurf", spalten.entwurf, "noch nicht veröffentlicht")}
        {spalte("Eingeplant", spalten.eingeplant, "veröffentlicht")}
        {spalte("Nicht eingeplant", spalten.offen, "Termin verstrichen")}
        {spalte(
          "Besprochen",
          spalten.besprochen,
          "zuletzt",
          <div className="fallkarte">
            <h3 style={{ marginTop: 0 }}>Letzte 4 Wochen</h3>
            <dl className="zahlenliste">
              <div><dt>Besprochene Fälle</dt><dd>{kuerzlich.length}</dd></div>
              <div><dt>Beratungszeit</dt><dd>{Math.floor(minuten / 60)} Std. {minuten % 60} Min.</dd></div>
              <div><dt>Davon dringend</dt><dd>{dringendAnteil} %</dd></div>
            </dl>
            <div className="fortschritt" style={{ marginTop: "0.9rem" }} aria-hidden="true"><span style={{ width: `${dringendAnteil}%` }} /></div>
          </div>,
          { gruen: true, gedaempft: true },
        )}
      </div>
    </>
  );
}
