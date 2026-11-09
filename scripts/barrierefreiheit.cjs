/**
 * Automatische Barrierefreiheitsprüfung (WCAG 2.1 AA) mit axe-core.
 * Voraussetzung: App läuft (Standard http://localhost:3000) und Demodaten sind eingespielt.
 * Aufruf: node scripts/barrierefreiheit.cjs
 */
const { chromium } = require("playwright");
const { AxeBuilder } = require("@axe-core/playwright");

const BASIS = process.env.BASIS_URL || "http://localhost:3000";
const SEITEN = ["/", "/fall-eintragen", "/faelle", "/plan", "/meine-termine", "/abwesenheiten", "/fairness",
  "/einstellungen", "/einstellungen/personen", "/einstellungen/termine", "/einstellungen/regeln"];

(async () => {
  const browser = await chromium.launch();
  const page = await (await browser.newContext()).newPage();
  let probleme = 0;
  await page.goto(BASIS + "/anmelden");
  const login = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  probleme += melde("/anmelden", login.violations);
  await page.fill("#email", "helga.brandt@team2.example");
  await page.fill("#passwort", "Demo-Passwort-2026");
  await page.click("form button[type=submit]");
  await page.waitForURL(BASIS + "/");
  await page.goto(BASIS + "/plan");
  const planLink = await page.locator("main article a").first().getAttribute("href");
  for (const pfad of [...SEITEN, planLink]) {
    await page.goto(BASIS + pfad);
    const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
    probleme += melde(pfad, r.violations);
  }
  await browser.close();
  console.log(probleme === 0 ? "Keine Verstöße gefunden." : `${probleme} Verstöße gefunden.`);
  process.exit(probleme === 0 ? 0 : 1);
})();

function melde(pfad, verstoesse) {
  for (const v of verstoesse) console.log(`${pfad}: [${v.impact}] ${v.id} – ${v.help} (${v.nodes.length}×) ${v.nodes[0]?.target}`);
  return verstoesse.length;
}
