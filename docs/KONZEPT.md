# FK-Planer – Konzept zur Freigabe

Stand: 09.11.2026 · Status: **Freigegeben am 09.11.2026** (alle Vorschläge übernommen; Konferenztag Dienstag, Uhrzeit variabel)

Dieses Dokument enthält Datenmodell, Annahmen, Planungsalgorithmus und Umsetzungsplan.
Die offenen Fragen stehen in Abschnitt 6. Jede Frage hat einen Vorschlag; wird dieser
freigegeben, gilt er als Annahme. Es wird erst nach Freigabe programmiert.

---

## 1. Begriffe

| Begriff | Bedeutung in der App |
|---|---|
| **Konferenztag** | Ein Termin der Fachkonferenz mit Zeitfenster (z. B. Di 09:00–12:00). |
| **Falleintrag** | Eine Anmeldung eines Falls zur Besprechung (Fallkürzel, Dauer, Wunschtermin …). Derselbe Fall kann später erneut eingetragen werden. |
| **Gruppe** | Eine von 1 oder 2 parallel laufenden Sitzungen an einem Konferenztag. |
| **Teilnahme** | Eine Person nimmt an einer Gruppe teil – mit Art: *eigener Fall*, *erforderlich*, *vorgesetzt*, *aufgefüllt*. |
| **Aufgefüllt** | Person ohne eigenen Fall und ohne Anforderung, von der App zur Beschlussfähigkeit hinzugezogen. |
| **Belastungsquote** | Teilnahmen ohne eigenen Fall ÷ Stellenanteil (1,0 = Vollzeit) im Auswertungszeitraum. |

## 2. Annahmen (gelten, sofern Abschnitt 6 nichts anderes ergibt)

1. Ein Team = ein Mandant. Darüber liegt die Organisation (Jugendamt). Alle Fachdaten tragen eine `teamId`; jede Datenbankabfrage wird serverseitig auf das Team des eingeloggten Kontos begrenzt.
2. Maximal 2 Gruppen pro Konferenztag; Gruppen laufen parallel im selben Zeitfenster.
3. Zeitzone ist Europe/Berlin. Zeiten werden auf 5 Minuten gerundet.
4. Die vorgesetzte Person zählt zur Mindestzahl, wird aber **nie** zum Auffüllen verwendet.
5. Planung ist deterministisch: Bei Gleichstand entscheidet immer eine feste Reihenfolge (zuletzt nach interner ID). Keine Zufallszahlen, keine externe KI.
6. Statistik zählt nur **veröffentlichte** Pläne. Änderungen nach Veröffentlichung ändern die Teilnahmen direkt; jede Änderung wird mit Zeitpunkt, Person und Vorher/Nachher protokolliert.
7. Keine Klarnamen von Klientinnen/Klienten. Fallkürzel max. 15 Zeichen; die App warnt, wenn das Kürzel wie ein Name aussieht (z. B. zwei großgeschriebene Wörter). Notizfeld max. 200 Zeichen, mit sichtbarem Hinweis.
8. Für Abwesenheiten wird **kein Grund** gespeichert (Datensparsamkeit).
9. Keine Tracker, keine externen Schriftarten, keine CDN-Ressourcen; PDF und .ics werden auf dem eigenen Server erzeugt.

## 3. Datenmodell (PostgreSQL, Drizzle ORM)

```
Organisation        id, name
Team                id, organisationId, name                         ← Mandant
Person              id, teamId, vorname, nachname, kuerzel,
                    stellenanteil (0,10–1,00), istVorgesetzt,
                    vorgesetztRang (1 = Leitung, 2 = Vertretung),
                    darfAufgefuelltWerden, aktivVon, aktivBis
Benutzerkonto       id, personId (1:1), email (eindeutig), passwortHash (Argon2id),
                    rolle: MITARBEITEND | PLANUNG, gesperrt, letzterLogin
Sitzung (Login)     id, kontoId, tokenHash, laeuftAbAm
Einstellungen       teamId, minTeilnehmende = 3, minErsparnisMinuten = 30,
                    auswertungszeitraumWochen = 26, fristStundenVorKonferenz = 72,
                    wechselpauseMinuten = 5, standardBeginn = 09:00, standardEnde = 12:00,
                    standardWochentag = Dienstag
Konferenztag        id, teamId, datum, beginn, ende, eintragungsfrist, raum1, raum2
Abwesenheit         id, personId, vonDatum, bisDatum, vonUhrzeit?, bisUhrzeit?
Falleintrag         id, teamId, verantwortlichId → Person, fallkuerzel, dauerMinuten,
                    wunschKonferenztagId? | fruehestens? / spaetestens?,
                    vorgesetztErforderlich, dringend, notiz?, verspaetet,
                    status: OFFEN | EINGEPLANT | NICHT_EINGEPLANT | BESPROCHEN | ZURUECKGEZOGEN,
                    erstelltVonId, erstelltAm
FallErforderlich    falleintragId, personId                          (n:m)
Plan                id, konferenztagId, status: ENTWURF | VEROEFFENTLICHT,
                    gruppenBegruendung, erzeugtAm, veroeffentlichtAm, version
Gruppe              id, planId, nummer (1|2), raum, beginn, ende
PlanPunkt           id, gruppeId, falleintragId, reihenfolge, beginn, ende
Teilnahme           id, gruppeId, personId,
                    art: EIGENER_FALL | ERFORDERLICH | VORGESETZT | AUFGEFUELLT,
                    begruendung (ein Satz), manuell (bool)
Aenderung           id, planId, kontoId, zeitpunkt, aktion, vorher (JSON),
                    nachher (JSON), kommentar?
```

Die Fairnessübersicht wird **berechnet** (Teilnahmen aus veröffentlichten Plänen im
Auswertungszeitraum), nicht gespeichert – dadurch korrigiert jede protokollierte Änderung
die Statistik automatisch.

## 4. Planungsalgorithmus (eigenständiges Modul `src/planung`, ohne Datenbankzugriff)

Eingabe: Konferenztag, Personen, Abwesenheiten, Falleinträge, Einstellungen, bisherige
Teilnahmen. Ausgabe: Planvorschlag, Begründungen, Verstöße, Hinweise mit Lösungsvorschlägen.

1. **Fälle dem Tag zuordnen.** Fälle mit Wunsch für diesen Tag bzw. passendem Zeitraum.
   Reihenfolge: dringend → spätestes Wunschdatum zuerst → Eintragungszeitpunkt → ID.
2. **Machbarkeit pro Fall prüfen.** Fallverantwortliche und erforderliche Personen anwesend?
   Vorgesetzte Person benötigt und anwesend? Sonst: Fall nicht eingeplant + konkreter Grund
   („Frau Beispiel ist am 16.11. abwesend“) + Lösung („auf den 23.11. verschieben“).
3. **Blöcke bilden.** Fälle, die eine Person gemeinsam brauchen (verantwortlich, erforderlich,
   vorgesetzt), werden zu einem Block verbunden (Zusammenhangskomponenten). Ein Block
   liegt immer vollständig in einer Gruppe – so ist Regel „nicht gleichzeitig in
   verschiedenen Gruppen“ erfüllt.
4. **1 oder 2 Gruppen?**
   - Dauer mit 1 Gruppe = Summe der Falldauern + Wechselpausen.
   - Für 2 Gruppen werden alle Aufteilungen der Blöcke exakt durchgerechnet (bei bis zu
     ca. 20 Blöcken schnell genug), Ziel: kürzeste längere Gruppe; Gleichstand fest geregelt.
   - Jede Gruppe muss beschlussfähig sein: eigene Pflichtpersonen + noch freie anwesende
     Personen ≥ Mindestzahl.
   - 2 Gruppen nur, wenn Ersparnis ≥ Mindestersparnis.
   - Begründungssatz, z. B. „2 Gruppen: Die Konferenz endet 50 Minuten früher (10:40 statt
     11:30), und beide Gruppen sind beschlussfähig.“ oder „1 Gruppe: Eine Aufteilung spart nur
     10 Minuten (Mindestwert: 30).“
5. **Reihenfolge in der Gruppe.** Dringende zuerst, dann Fälle mit vorgesetzter Person
   hintereinander, dann Eintragungszeitpunkt. Uhrzeiten fortlaufend ab Beginn.
6. **Zeitfenster prüfen.** Passt eine Gruppe nicht ins Zeitfenster, werden die zuletzt
   gereihten Fälle als „nicht eingeplant“ markiert, mit Vorschlag des nächsten Termins.
7. **Auffüllen.** Fehlen Personen zur Mindestzahl: Kandidaten = anwesend, nicht vorgesetzt,
   darf aufgefüllt werden, ohne eigenen Fall an diesem Tag, in keiner anderen Gruppe.
   Sortiert nach Belastungsquote (aufsteigend, inkl. Zuweisungen dieses Entwurfs) →
   längste Zeit seit letzter Auffüllung → Nachname → ID.
   Begründung z. B.: „Niedrigste Belastung im Team: 1,7 Teilnahmen ohne eigenen Fall je
   Vollzeitstelle (Teamdurchschnitt 3,2).“
8. **Prüfen.** Dieselbe Prüffunktion läuft bei jeder manuellen Änderung und liefert alle
   Regelverstöße in verständlichen Sätzen.

## 5. Umsetzungsplan

| Schritt | Inhalt | Ergebnis |
|---|---|---|
| 1 | Projektgerüst: Next.js (App Router), TypeScript strikt, Prisma, PostgreSQL, Vitest, ESLint | lauffähiges Grundgerüst |
| 2 | **Planungsmodul** `src/planung` mit Typen, Algorithmus, Prüffunktion, Fairnessberechnung | reine Funktionen |
| 3 | **Tests** des Moduls: Doppelbelegung, Abwesenheit, < 3 Personen, sinnvolle/nicht sinnvolle Aufteilung, gleiche erforderliche Person bei mehreren Fällen, Teilzeit, eigener Fall in der Sitzung, nachträgliche Änderung, Determinismus | grüne Testsuite |
| 4 | Datenbankschema, Migration, Demodaten (fiktives Team mit ca. 12 Personen, Teilzeit, Leitung + Vertretung, Abwesenheiten, 3 Konferenztage) | `npm run seed` |
| 5 | Login (E-Mail + Passwort, Argon2id, HttpOnly-Cookie), Rollenprüfung in jeder Server-Aktion, Mandantentrennung | gesicherter Zugang |
| 6 | Oberfläche Mitarbeitende: Fall eintragen, meine Fälle, Abwesenheiten, eigene Termine | |
| 7 | Oberfläche Planung: Fallübersicht, Plan erzeugen, Zeittabelle mit Gruppen, Verschieben/Ändern mit Live-Prüfung und Live-Fairness, Veröffentlichen, Änderungsverlauf | |
| 8 | Fairnessübersicht, Einstellungen (Personen, Stellenanteil, Termine, Regeln) | |
| 9 | Export: PDF (serverseitig) und .ics (ganzer Plan / eigene Termine) | |
| 10 | Barrierefreiheit: Grundschrift 18 px, Kontrast ≥ 4,5:1, Tastaturbedienung, Fokusrahmen, Formular-Fehlermeldungen am Feld, Smartphone-Layout; Prüfung mit axe | |
| 11 | Betrieb: Docker Compose (App + PostgreSQL), Anleitung für EU-Hosting | README |

Rückfragen während der Umsetzung kommen, sobald eine Regel unklar ist.

## 6. Entscheidungen (Antworten auf die Rückfragen)

| Nr. | Thema | Entscheidung |
|---|---|---|
| 1 | Teilnahmemodell | **Modell A:** Jede Gruppe ist eine durchgehende Sitzung; alle Personen einer Gruppe nehmen an allen Fällen der Gruppe teil. Mindestzahl gilt pro Gruppe. Eine Person gehört am Tag höchstens einer Gruppe an. |
| 2 | Zähleinheit | 1 Teilnahme je Gruppe ohne eigenen Fall; Minuten nur zur Information. |
| 3 | „Erforderlich“ bei fremdem Fall | Zählt als Teilnahme ohne eigenen Fall (eigene Spalte). |
| 4 | Normalisierung | Quote = Teilnahmen ohne eigenen Fall ÷ (Stellenanteil × Anteil der Konferenztage im Zeitraum, an denen die Person beschäftigt und nicht ganztägig abwesend war). |
| 5 | Auffüllen | Nur bis zur Mindestzahl. |
| 6 | Konferenztag | **Dienstag.** Die Uhrzeit ist variabel: Jeder Termin hat einen eigenen Beginn; ein Ende ist optional. Ohne Ende dauert die Konferenz so lange wie nötig. |
| 7 | Zeitfenster überschritten | Zuletzt gereihte Fälle bleiben „nicht eingeplant“ und erhalten den nächsten Termin als Vorschlag. |
| 8 | Wunschtermin | Bestimmter Dienstag oder Zeitraum (frühestens/spätestens); die App nimmt den frühesten passenden Termin. |
| 9 | Dringend | Kennzeichen „dringend“ ohne Inhalt; wird zuerst eingeplant. |
| 10 | Frist | Nach Fristende weiter möglich, als „verspätet“ markiert. |
| 11 | Wechselzeit | 5 Minuten, einstellbar. |
| 12 | Vorgesetzte | Mehrere möglich (Rang 1 Leitung, 2 Vertretung …). „Vorgesetzt erforderlich“ = eine von ihnen, bevorzugt nach Rang. |
| 13 | Rollen | Eine Person kann beide Rollen haben (Rolle PLANUNG umfasst alle Rechte von MITARBEITEND). |
| 14 | Eintragen für andere | Nur die Planung. |
| 15 | Ausnahme vom Auffüllen | Häkchen pro Person. |
| 16 | Abwesenheiten | Ganztägig, optional mit Uhrzeit; kein Grund gespeichert. |
| 17 | Login | Eigenes Login (E-Mail + Passwort), SSO später möglich. |
| 18 | Löschfristen | Fallkürzel und Notiz 3 Monate nach der Konferenz löschen; Teilnahmen bleiben ohne Fallbezug. |
| 19 | E-Mail | Kein Versand in Version 1. |
| 20 | Hosting | Docker Compose, Anbieterwahl (EU) später. |

### Während der Umsetzung getroffene Festlegungen (zur Bestätigung)

- **Datenbankzugriff mit Drizzle statt Prisma:** Drizzle ist reines TypeScript ohne zusätzlich herunterzuladende Programmdateien; das vereinfacht Betrieb und Hosting. Fachlich ohne Auswirkung.
- **Aufteilung trotz geringer Ersparnis, wenn sonst Fälle wegfallen:** Passt eine Gruppe nicht ins Zeitfenster oder ist eine benötigte Person nicht die ganze Sitzung da, werden 2 Gruppen gebildet, auch wenn die Mindestersparnis nicht erreicht wird – statt Fälle zu streichen.
- **Teilweise Abwesenheit:** Wer nicht die ganze Sitzung über da ist, kann (nach Modell A) nicht eingeplant werden. Betrifft das eine Pflichtperson, wird der betroffene Fall auf einen anderen Termin vorgeschlagen.
