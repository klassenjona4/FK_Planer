# FK-Planer – Planung der Fachkonferenzen

Web-App für Team 2 des Jugendamts: Mitarbeitende tragen Fälle und Abwesenheiten ein, die App erzeugt daraus einen
konfliktfreien, beschlussfähigen und fairen Fachkonferenzplan (1 oder 2 Gruppen). Die Planung prüft, ändert und
veröffentlicht den Plan.

Fachliche Entscheidungen, Datenmodell und Algorithmus: **[docs/KONZEPT.md](docs/KONZEPT.md)**

## Technik

- Next.js 16 (App Router), TypeScript, PostgreSQL 16, Drizzle ORM
- Planungslogik als eigenständiges, deterministisches Modul ohne Datenbankzugriff: `src/planung`
- Login mit E-Mail und Passwort (Argon2id), Sitzungen in der Datenbank, Rollen werden in jeder Seite und Server-Aktion serverseitig geprüft
- Mandantenfähig: Organisation → Team; alle Abfragen sind auf das Team des Kontos begrenzt
- PDF (pdfkit) und .ics werden auf dem eigenen Server erzeugt; keine Tracker, keine externen Schriftarten oder CDNs, keine externen KI-Dienste

## Lokal starten

Voraussetzungen: Node.js 22, PostgreSQL 16.

```bash
cp .env.example .env
```

```bash
npm install
```

```bash
npm run db:migrate
```

```bash
npm run db:seed
```

```bash
npm run dev
```

Dann <http://localhost:3000> öffnen. Die Demodaten enthalten nur fiktive Personen (Passwort für alle: `Demo-Passwort-2026`):

| Konto | Rolle |
|---|---|
| `helga.brandt@team2.example` | Teamleitung, Planung |
| `sabine.kroeger@team2.example` | Fachkraft, Planung |
| `murat.yildiz@team2.example`, `elke.hansen@team2.example` u. a. | Mitarbeitende |

Die Demodaten zeigen typische Situationen: veröffentlichte Pläne der letzten Wochen (Fairnesshistorie), eine
Aufteilung in 2 Gruppen, Leitung und Vertretung, eine stundenweise Abwesenheit, einen Fall, der wegen Abwesenheit
auf die Folgewoche vorgemerkt wird, und einen Dienstag, an dem nur 2 Personen verfügbar sind.

## Tests

```bash
npm test
```

Abgedeckt sind u. a. Doppelbelegung, Abwesenheit (ganz- und stundenweise), weniger als 3 verfügbare Personen,
sinnvolle und nicht sinnvolle Aufteilung, dieselbe erforderliche Person bei mehreren Fällen, Teilzeit in der
Fairnessberechnung, eigener Fall in der Sitzung, nachträgliche Planänderung, Determinismus und der .ics-Export.

Barrierefreiheitsprüfung (WCAG 2.1 AA, App muss laufen und Demodaten enthalten):

```bash
node scripts/barrierefreiheit.cjs
```

## Betrieb (EU-Hosting)

```bash
echo "DB_PASSWORT=$(openssl rand -hex 24)" > .env
```

```bash
docker compose run --rm werkzeug npm run db:migrate
```

```bash
docker compose up -d
```

- Die App lauscht nur auf `127.0.0.1:3000`. Davor gehört ein Reverse-Proxy mit HTTPS (z. B. Caddy oder nginx). Ohne HTTPS funktioniert der Login im Produktionsbetrieb nicht (sicheres Cookie).
- Server und Datenbank bei einem Anbieter mit Rechenzentrum in der EU betreiben (oder im kommunalen Rechenzentrum).
- Löschfristen täglich ausführen, z. B. per Cron: `docker compose run --rm werkzeug npm run db:loeschfristen`
- Erstes Planungskonto: Demodaten einspielen und anschließend unter *Einstellungen › Personen* echte Personen anlegen und die Demo-Personen sperren, oder direkt in der Datenbank anlegen.
