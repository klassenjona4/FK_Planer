import Link from "next/link";
import { and, eq, inArray } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { brauchtAnmeldung, istPlanung } from "@/lib/auth";
import { ladePersonen } from "@/lib/daten";
import { heute } from "@/lib/zeit-server";
import { datumKurz, datumZahl, personName } from "@/planung";

export const metadata = { title: "Eingetragene Fälle" };

export default async function FaelleSeite({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const konto = await brauchtAnmeldung();
  const sp = await searchParams;
  const planung = istPlanung(konto);
  const alle = sp.alle === "1";
  const [personen, faelle] = await Promise.all([
    ladePersonen(konto.teamId),
    db.select().from(s.falleintrag).where(eq(s.falleintrag.teamId, konto.teamId)).orderBy(s.falleintrag.wunschVon, s.falleintrag.erstelltAm),
  ]);
  const ids = faelle.map((f) => f.id);
  const [erf, orte] = ids.length
    ? await Promise.all([
        db.select().from(s.fallErforderlich).where(inArray(s.fallErforderlich.falleintragId, ids)),
        db
          .select({ fallId: s.planPunkt.falleintragId, beginn: s.planPunkt.beginn, nummer: s.gruppe.nummer, status: s.plan.status, datum: s.konferenztag.datum, tagId: s.konferenztag.id })
          .from(s.planPunkt)
          .innerJoin(s.gruppe, eq(s.planPunkt.gruppeId, s.gruppe.id))
          .innerJoin(s.plan, eq(s.gruppe.planId, s.plan.id))
          .innerJoin(s.konferenztag, eq(s.plan.konferenztagId, s.konferenztag.id))
          .where(and(eq(s.plan.teamId, konto.teamId), inArray(s.planPunkt.falleintragId, ids))),
      ])
    : [[], []];
  const name = new Map(personen.map((p) => [p.id, personName(p)]));
  const h = heute();

  const sichtbar = faelle.filter((f) => {
    if (!alle && f.status === "ZURUECKGEZOGEN") return false;
    if (planung) return true;
    return f.verantwortlichId === konto.personId || erf.some((e) => e.falleintragId === f.id && e.personId === konto.personId);
  });

  const status = (f: (typeof faelle)[number]) => {
    if (f.status === "ZURUECKGEZOGEN") return <span className="abzeichen leer">Zurückgezogen</span>;
    const o = orte.find((x) => x.fallId === f.id && x.status === "VEROEFFENTLICHT") ?? orte.find((x) => x.fallId === f.id);
    if (o?.status === "VEROEFFENTLICHT") {
      return (
        <Link href={`/plan/${o.tagId}`}>
          {o.datum < h ? "Besprochen" : "Eingeplant"}: {datumKurz(o.datum)}, {o.beginn} Uhr, Gruppe {o.nummer}
        </Link>
      );
    }
    if (o) return <span className="abzeichen entwurf">Im Planentwurf ({datumKurz(o.datum)})</span>;
    if (f.wunschBis < h) return <span className="abzeichen leer">Nicht eingeplant, Termin verstrichen</span>;
    return <span>Wartet auf Planung</span>;
  };

  return (
    <>
      <h1>{planung ? "Eingetragene Fälle des Teams" : "Meine eingetragenen Fälle"}</h1>
      {sp.hinweis === "zurueckgezogen" && <div className="meldung erfolg" role="status"><p>Der Fall wurde zurückgezogen.</p></div>}
      {sp.fehler === "keine-berechtigung" && <div className="meldung fehler" role="alert"><p>Sie dürfen diesen Fall nicht bearbeiten.</p></div>}
      {!planung && <p>Hier sehen Sie Ihre eigenen Fälle und Fälle, bei denen Sie als erforderlich angegeben sind.</p>}
      <div className="knopfleiste">
        <Link className="knopf" href="/fall-eintragen">Neuen Fall eintragen</Link>
        <Link className="knopf zweitrangig" href={alle ? "/faelle" : "/faelle?alle=1"}>
          {alle ? "Zurückgezogene ausblenden" : "Auch zurückgezogene anzeigen"}
        </Link>
      </div>
      {sichtbar.length === 0 ? (
        <p>Es sind keine Fälle eingetragen.</p>
      ) : (
        <div className="tabelle-huelle">
          <table className="tabelle-mobil">
            <caption>{sichtbar.length} {sichtbar.length === 1 ? "Fall" : "Fälle"}</caption>
            <thead>
              <tr>
                <th scope="col">Fallkürzel</th>
                <th scope="col">Verantwortlich</th>
                <th scope="col" className="zahl">Dauer</th>
                <th scope="col">Wunschtermin</th>
                <th scope="col">Vorgesetzte</th>
                <th scope="col">Weitere Personen</th>
                <th scope="col">Stand</th>
                <th scope="col"><span className="nur-sr">Aktion</span></th>
              </tr>
            </thead>
            <tbody>
              {sichtbar.map((f) => {
                const darf = planung || f.verantwortlichId === konto.personId;
                return (
                  <tr key={f.id}>
                    <td data-titel="Fallkürzel">
                      <strong>{f.fallkuerzel}</strong>{" "}
                      {f.dringend && <span className="abzeichen dringend">dringend</span>}{" "}
                      {f.verspaetet && <span className="abzeichen entwurf">verspätet</span>}
                      {darf && f.notiz && <span className="grund">Notiz: {f.notiz}</span>}
                    </td>
                    <td data-titel="Verantwortlich">{name.get(f.verantwortlichId)}</td>
                    <td data-titel="Dauer" className="zahl">{f.dauerMinuten} Min.</td>
                    <td data-titel="Wunschtermin">
                      {f.wunschVon === f.wunschBis ? datumZahl(f.wunschVon) : `${datumZahl(f.wunschVon)} bis ${datumZahl(f.wunschBis)}`}
                    </td>
                    <td data-titel="Vorgesetzte">{f.vorgesetztErforderlich ? "erforderlich" : "nein"}</td>
                    <td data-titel="Weitere Personen">
                      {erf.filter((e) => e.falleintragId === f.id).map((e) => name.get(e.personId)).join(", ") || "–"}
                    </td>
                    <td data-titel="Stand">{status(f)}</td>
                    <td data-titel="Aktion">
                      {darf && f.status === "OFFEN" && (
                        <Link href={`/faelle/${f.id}`}>Bearbeiten<span className="nur-sr"> (Fall {f.fallkuerzel})</span></Link>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
