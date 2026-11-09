/** Erzeugt iCalendar-Dateien (.ics) für Outlook – ohne externe Dienste. */

export interface IcsTermin {
  uid: string;
  datum: string; // JJJJ-MM-TT
  beginn: string; // HH:MM
  ende: string; // HH:MM
  titel: string;
  beschreibung: string;
  ort?: string | null;
}

const VTIMEZONE = [
  "BEGIN:VTIMEZONE",
  "TZID:Europe/Berlin",
  "BEGIN:DAYLIGHT",
  "TZOFFSETFROM:+0100",
  "TZOFFSETTO:+0200",
  "TZNAME:CEST",
  "DTSTART:19700329T020000",
  "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU",
  "END:DAYLIGHT",
  "BEGIN:STANDARD",
  "TZOFFSETFROM:+0200",
  "TZOFFSETTO:+0100",
  "TZNAME:CET",
  "DTSTART:19701025T030000",
  "RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU",
  "END:STANDARD",
  "END:VTIMEZONE",
];

function maskiere(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

/** Zeilen nach RFC 5545 auf 75 Byte umbrechen */
function falte(zeile: string): string {
  const bytes = new TextEncoder();
  if (bytes.encode(zeile).length <= 75) return zeile;
  const teile: string[] = [];
  let aktuell = "";
  for (const zeichen of zeile) {
    const grenze = teile.length === 0 ? 75 : 74;
    if (bytes.encode(aktuell + zeichen).length > grenze) {
      teile.push(aktuell);
      aktuell = zeichen;
    } else aktuell += zeichen;
  }
  teile.push(aktuell);
  return teile.join("\r\n ");
}

const zeitpunkt = (datum: string, uhr: string) => `${datum.replace(/-/g, "")}T${uhr.replace(":", "")}00`;

export function erzeugeIcs(termine: IcsTermin[], kalendername: string): string {
  const jetzt = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const zeilen = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//FK-Planer//Fachkonferenzen//DE",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${maskiere(kalendername)}`,
    ...VTIMEZONE,
  ];
  for (const t of termine) {
    zeilen.push(
      "BEGIN:VEVENT",
      `UID:${t.uid}`,
      `DTSTAMP:${jetzt}`,
      `DTSTART;TZID=Europe/Berlin:${zeitpunkt(t.datum, t.beginn)}`,
      `DTEND;TZID=Europe/Berlin:${zeitpunkt(t.datum, t.ende)}`,
      `SUMMARY:${maskiere(t.titel)}`,
      `DESCRIPTION:${maskiere(t.beschreibung)}`,
      ...(t.ort ? [`LOCATION:${maskiere(t.ort)}`] : []),
      "END:VEVENT",
    );
  }
  zeilen.push("END:VCALENDAR");
  return zeilen.map(falte).join("\r\n") + "\r\n";
}

export function icsAntwort(inhalt: string, dateiname: string): Response {
  return new Response(inhalt, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="${dateiname}"`,
      "Cache-Control": "no-store",
    },
  });
}
