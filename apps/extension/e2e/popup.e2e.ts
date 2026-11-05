// End-to-end: load the built extension in Chromium, open listing pages on
// their real hostnames (served from test fixtures via request interception, so
// no real site is contacted), open the popup against that tab and check what it
// shows. Run: npm run e2e -w @housecalc/extension
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { chromium, type BrowserContext, type Page } from "playwright";
import * as F from "../../../packages/listing/test/fixtures.ts";

const EXT = new URL("../.output-e2e/chrome-mv3", import.meta.url).pathname;
const SHOTS = process.env.E2E_SCREENSHOTS;

const PAGES: Record<string, string> = {
  "https://www.hemnet.se/bostad/lagenhet-1rum-farsta-stockholms-kommun-exempelgatan-29-21740611": F.hemnetPage(F.HEMNET_BRF),
  "https://www.booli.se/annons/6300000": F.booliPage([F.BOOLI_VILLA]),
  "https://www.maklarhuset.se/bostad/sverige/halland/halmstad/provgrand/677847": F.maklarhusetVilla(
    "https://www.maklarhuset.se/bostad/sverige/halland/halmstad/provgrand/677847",
  ),
  "https://www.example-maklare.se/om-oss": F.NOT_A_LISTING,
};

let ctx: BrowserContext;
let extId: string;

before(async () => {
  ctx = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), "hc-e2e-")), {
    channel: "chromium",
    headless: true,
    args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
  });
  // Serve fixtures for listing hosts; block everything else external (incl. the
  // rates refresh, so the popup uses its bundled rates deterministically).
  await ctx.route("**/*", (route) => {
    const url = route.request().url().split("?")[0] ?? "";
    const body = PAGES[url];
    if (body) return route.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body });
    return url.startsWith("chrome-extension://") ? route.continue() : route.abort();
  });
  const sw = ctx.serviceWorkers()[0] ?? (await ctx.waitForEvent("serviceworker"));
  extId = new URL(sw.url()).host;
});

after(() => ctx?.close());

async function popupFor(url: string, name: string): Promise<Page> {
  const listing = await ctx.newPage();
  await listing.goto(url);
  const sw = ctx.serviceWorkers()[0]!;
  const tabId = await sw.evaluate(
    // Runs inside the extension's service worker, where `chrome` exists.
    async (u) => {
      const tabs: { id?: number; url?: string }[] = await (globalThis as any).chrome.tabs.query({});
      return tabs.find((t) => t.url === u)?.id;
    },
    url,
  );
  assert.ok(tabId, `tab for ${url}`);
  const popup = await ctx.newPage();
  await popup.setViewportSize({ width: 360, height: 640 });
  await popup.goto(`chrome-extension://${extId}/popup.html?tabId=${tabId}`);
  await popup.waitForSelector("#monthly");
  if (SHOTS) await popup.screenshot({ path: join(SHOTS, `${name}.png`), fullPage: true });
  return popup;
}

const val = (p: Page, sel: string) => p.locator(sel).inputValue();
const text = (p: Page, sel: string) => p.locator(sel).innerText();
const nbsp = (s: string) => s.replace(/[  ]/g, " ");

test("hemnet bostadsrätt: fields prefilled, no lagfart, deep link carries the scenario", async () => {
  const p = await popupFor(
    "https://www.hemnet.se/bostad/lagenhet-1rum-farsta-stockholms-kommun-exempelgatan-29-21740611",
    "hemnet-brf",
  );
  assert.equal(nbsp(await val(p, "#price")), "1 825 000");
  assert.equal(nbsp(await val(p, "#fee")), "3 175");
  assert.equal(nbsp(await val(p, "#drift")), "484");
  assert.equal(await val(p, "#tenure"), "bostadsratt");
  assert.equal(await p.locator("#pantbrev-row").isHidden(), true);
  const breakdown = nbsp(await text(p, "#breakdown"));
  assert.doesNotMatch(breakdown, /Lagfart/);
  assert.match(breakdown, /Kontanter totalt\s+273 750 kr/); // 15 % of 1 825 000, nothing else
  const href = await p.locator("#open").getAttribute("href");
  assert.match(href ?? "", /pris=1825000&avgift=3659&kontant=15&ranta=[\d.]+&upplatelse=bostadsratt/);
});

test("booli villa: äganderätt pays lagfart; existing pantbrev reduces new pantbrev", async () => {
  const p = await popupFor("https://www.booli.se/annons/6300000", "booli-villa");
  assert.equal(await val(p, "#tenure"), "aganderatt");
  assert.equal(nbsp(await val(p, "#pantbrev")), "2 400 000");
  const breakdown = nbsp(await text(p, "#breakdown"));
  // lagfart = 1.5 % of 4 995 000 + 825
  assert.match(breakdown, /Lagfart\s+75 750 kr/);
  // loan 4 245 750 − 2 400 000 existing = 1 845 750 new × 2 % + 375
  assert.match(breakdown, /Nya pantbrev\s+37 290 kr/);
});

test("bid chips raise the price used in the calculation", async () => {
  const p = await popupFor(
    "https://www.maklarhuset.se/bostad/sverige/halland/halmstad/provgrand/677847",
    "maklarhuset-villa",
  );
  assert.equal(await val(p, "#tenure"), "tomtratt");
  const before = nbsp(await text(p, "#monthly"));
  await p.click('#bid button[data-bid="10"]');
  const afterBid = nbsp(await text(p, "#monthly"));
  assert.notEqual(before, afterBid);
  assert.match((await p.locator("#open").getAttribute("href")) ?? "", /pris=3510000/); // 3 195 000 × 1.1 → 10k
});

test("non-listing page: explains and lets the user type a price", async () => {
  const p = await popupFor("https://www.example-maklare.se/om-oss", "not-a-listing");
  assert.match(await text(p, ".notice"), /ingen annons/);
  assert.equal(nbsp(await text(p, "#monthly")), "Fyll i pris");
  await p.fill("#price", "2000000");
  assert.match(nbsp(await text(p, "#monthly")), /\d kr\/mån/);
});
