import path from "node:path";
import PDFDocument from "pdfkit";
import { ART_TEXT } from "@/components/PlanAnsicht";
import { aktuellesKonto } from "@/lib/auth";
import { ladeFaelle, ladePersonen, ladePlan, ladeTermin } from "@/lib/daten";
import { fallInfos, namensListe } from "@/lib/fallinfo";
import { zeitstempel } from "@/lib/zeit-server";
import { datumLang, gruppenSpanne, zuUhrzeit } from "@/planung";

export const runtime = "nodejs";

export async function GET(_: Request, { params }: { params: Promise<{ tagId: string }> }) {
  const konto = await aktuellesKonto();
  if (!konto) return new Response("Bitte melden Sie sich an.", { status: 401 });
  const { tagId } = await params;
  const tag = await ladeTermin(konto.teamId, tagId);
  const plan = tag ? await ladePlan(konto.teamId, tagId) : null;
  if (!tag || !plan || (plan.status !== "VEROEFFENTLICHT" && konto.rolle !== "PLANUNG")) {
    return new Response("Der Plan ist nicht veröffentlicht.", { status: 404 });
  }
  const [alleFaelle, personen] = await Promise.all([ladeFaelle(konto.teamId, false), ladePersonen(konto.teamId)]);
  const faelle = fallInfos(alleFaelle, personen);
  const namen = namensListe(personen);
  const e = plan.entwurf;

  const doc = new PDFDocument({ size: "A4", margin: 50, info: { Title: `Fachkonferenz ${tag.datum}`, Author: "FK-Planer" } });
  // Unicode-Schrift (DejaVu Sans), damit alle Namen korrekt erscheinen (z. B. ı, ğ, ł)
  const schriften = path.join(process.cwd(), "assets", "schriften");
  doc.registerFont("Normal", path.join(schriften, "DejaVuSans.ttf"));
  doc.registerFont("Fett", path.join(schriften, "DejaVuSans-Bold.ttf"));
  const teile: Buffer[] = [];
  doc.on("data", (b: Buffer) => teile.push(b));
  const fertig = new Promise<Buffer>((ok) => doc.on("end", () => ok(Buffer.concat(teile))));

  doc.font("Fett").fontSize(20).text(`Fachkonferenz am ${datumLang(tag.datum)}`);
  doc.moveDown(0.3).font("Normal").fontSize(11).fillColor("#444")
    .text(`${plan.status === "VEROEFFENTLICHT" ? "Veröffentlicht" : "ENTWURF"} · Stand ${zeitstempel(plan.geaendertAm)}`);
  doc.moveDown(0.6).fillColor("#000").fontSize(12).text(e.gruppenBegruendung);

  for (const g of e.gruppen) {
    const s = gruppenSpanne(g);
    const raum = g.nummer === 2 ? tag.raum2 : tag.raum1;
    doc.moveDown(1);
    if (doc.y > 680) doc.addPage();
    doc.font("Fett").fontSize(15)
      .text(`${e.gruppen.length > 1 ? `Gruppe ${g.nummer}` : "Konferenz"}${s ? `: ${zuUhrzeit(s.von)} bis ${zuUhrzeit(s.bis)} Uhr` : ""}${raum ? ` · Raum ${raum}` : ""}`);
    doc.moveDown(0.4).font("Fett").fontSize(12).text("Fälle");
    doc.font("Normal").fontSize(12);
    for (const p of g.punkte) {
      const f = faelle[p.fallId];
      doc.text(`${p.beginn} – ${p.ende} Uhr    ${f?.kuerzel ?? "?"}    (${f?.verantwortlich ?? "?"}${f?.dringend ? ", dringend" : ""})`, { indent: 10 });
    }
    doc.moveDown(0.4).font("Fett").text(`Teilnehmende (${g.teilnehmende.length})`);
    doc.font("Normal");
    for (const t of g.teilnehmende) {
      doc.font("Normal").fontSize(12).text(`${namen[t.personId] ?? "?"} – ${ART_TEXT[t.art]}`, { indent: 10 });
      doc.fontSize(10).fillColor("#444").text(t.begruendung, { indent: 20 }).fillColor("#000");
    }
  }
  doc.moveDown(2).fontSize(9).fillColor("#666").text("Enthält nur pseudonyme Fallkürzel. Nicht an Dritte weitergeben.");
  doc.end();

  const pdf = await fertig;
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="fachkonferenz-${tag.datum}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
