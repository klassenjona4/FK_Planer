# Kostenloser Betrieb (Demo/Pilot)

| Baustein | Anbieter | Tarif | Region |
|---|---|---|---|
| Datenbank | Supabase | Free | `eu-central-1` (Frankfurt) |
| App | Vercel | Hobby | Serverfunktionen `fra1` (Frankfurt), siehe `vercel.json` |

Beide Tarife kosten nichts. Grenzen: Supabase pausiert kostenlose Projekte nach 7 Tagen ohne Zugriff
(im Dashboard mit einem Klick wieder starten); Vercel Hobby ist laut Anbieter für nicht-kommerzielle Nutzung gedacht.

**Datenschutz-Hinweis:** Vercel und Supabase sind US-Unternehmen; Daten und Funktionen liegen zwar in Frankfurt,
für den Echtbetrieb mit echten Personaldaten braucht es aber eine Prüfung durch den Datenschutz
(Auftragsverarbeitungsvertrag) oder ein EU-Hosting (z. B. kommunales Rechenzentrum, siehe `docker-compose.yml`).
Für die Demo mit fiktiven Personen ist der kostenlose Betrieb geeignet.

## Einrichtung

1. **Supabase-Projekt** in Frankfurt anlegen und `deploy/supabase-schema.sql` im SQL-Editor ausführen.
   Die Tabellen liegen im Schema `fk`; die öffentlichen API-Rollen (`anon`, `authenticated`) haben keinen Zugriff, RLS ist aktiv.
2. **Datenbank-Passwort setzen:** Supabase › Project Settings › Database › *Reset database password*.
3. **Verbindungszeichenfolge kopieren:** Supabase › *Connect* › **Transaction pooler** (Port 6543), Passwort einsetzen.
4. **Vercel-Projekt** aus dem GitHub-Repository anlegen und diese Umgebungsvariablen setzen:

   | Variable | Wert |
   |---|---|
   | `DATABASE_URL` | Verbindungszeichenfolge aus Schritt 3 (als *Sensitive* speichern) |
   | `DATABASE_SCHEMA` | `fk` |
   | `DATABASE_SSL` | `supabase` (verschlüsselt, Zertifikat wird gegen das Supabase-Stammzertifikat geprüft) |

5. Neu bereitstellen (*Redeploy*). Die Anmeldung funktioniert nur über HTTPS – bei Vercel automatisch.

Das Passwort gehört nur in Supabase und die Vercel-Umgebungsvariable, nicht ins Repository.
