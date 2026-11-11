import assert from "node:assert/strict";
import { test } from "node:test";
import { parseHTML } from "linkedom";
import { extractListing, looksLikeListing, type Listing } from "../src/index.ts";
import * as F from "./fixtures.ts";

const extract = (html: string, url: string) =>
  extractListing(parseHTML(html).document as unknown as Document, url);

/** Compact { field: [value, source] } view for readable assertions. */
const view = (l: Listing) =>
  Object.fromEntries(
    Object.entries(l)
      .filter(([k]) => k !== "url" && k !== "site")
      .map(([k, f]) => [k, [(f as { value: unknown }).value, (f as { source: string }).source]]),
  );

const HEMNET_URL = "https://www.hemnet.se/bostad/lagenhet-1rum-farsta-stockholms-kommun-exempelgatan-29-21740611";

test("hemnet: bostadsrätt from the Apollo cache; yearly drift → monthly", () => {
  const l = extract(F.hemnetPage(F.HEMNET_BRF), HEMNET_URL);
  assert.equal(l.site, "hemnet");
  assert.deepEqual(view(l), {
    price: [1825000, "structured"],
    monthlyFee: [3175, "structured"],
    operatingCostMonthly: [484, "structured"], // 5 808 kr/år
    tenure: ["bostadsratt", "structured"],
    propertyType: ["Lägenhet", "structured"],
    livingArea: [40, "structured"],
    address: ["Exempelgatan 29", "structured"],
    municipality: ["Stockholms kommun", "structured"],
  });
});

test("hemnet: villa is äganderätt with no avgift", () => {
  const l = extract(F.hemnetPage(F.HEMNET_VILLA), "https://www.hemnet.se/bostad/villa-5rum-provvagen-4-21800001");
  assert.equal(l.tenure?.value, "aganderatt");
  assert.equal(l.monthlyFee, undefined);
  assert.equal(l.operatingCostMonthly?.value, 3500);
});

test("hemnet: stale __NEXT_DATA__ after client-side navigation is ignored", () => {
  // The user clicked through to another listing; the embedded JSON still
  // describes the first one, the DOM shows the new one.
  const html = F.hemnetPage(F.HEMNET_BRF, "<dl><dt>Utgångspris</dt><dd>2 450 000 kr</dd></dl>");
  const l = extract(html, "https://www.hemnet.se/bostad/lagenhet-2rum-annangatan-3-21999999");
  assert.deepEqual(l.price, { value: 2450000, source: "text" });
  assert.equal(l.monthlyFee, undefined, "must not show the previous listing's avgift");
});

test("booli: picks the listing matching the URL, not a similar-listing card", () => {
  const l = extract(F.booliPage([F.BOOLI_BRF_NO_PRICE, F.BOOLI_SIMILAR]), "https://www.booli.se/annons/6281333");
  assert.equal(l.site, "booli");
  assert.equal(l.price, undefined, "Pris ej angivet → no price, not the similar card's");
  assert.deepEqual(view(l), {
    monthlyFee: [3741, "structured"],
    operatingCostMonthly: [533, "structured"],
    tenure: ["bostadsratt", "structured"],
    propertyType: ["Lägenhet", "structured"],
    livingArea: [63, "structured"],
    address: ["Exempelgatan 10", "structured"],
  });
  assert.equal(looksLikeListing(l), true, "fee + tenure is enough to calculate");
});

test("booli: villa with price, yearly drift and pantbrev", () => {
  const l = extract(F.booliPage([F.BOOLI_VILLA]), "https://www.booli.se/annons/6300000");
  assert.equal(l.price?.value, 4995000);
  assert.equal(l.operatingCostMonthly?.value, 3750);
  assert.equal(l.tenure?.value, "aganderatt");
  assert.equal(l.pantbrev?.value, 2400000);
});

test("booli: a listing id that isn't on the page yields nothing structured", () => {
  const l = extract(F.booliPage([F.BOOLI_SIMILAR]), "https://www.booli.se/annons/6281333");
  assert.equal(l.price, undefined);
});

test("mäklarhuset: tomträtt villa via JSON-LD + label text with entities", () => {
  const url = "https://www.maklarhuset.se/bostad/sverige/halland/halmstad/provgrand/677847";
  const l = extract(F.maklarhusetVilla(url), url);
  assert.equal(l.site, "maklarhuset");
  assert.deepEqual(view(l), {
    price: [3195000, "jsonld"],
    operatingCostMonthly: [3363, "text"], // 40 354 kr/år
    tenure: ["tomtratt", "text"],
    propertyType: ["Villa", "jsonld"],
    livingArea: [105, "jsonld"],
    pantbrev: [1914000, "text"], // "8 pantbrev om totalt 1 914 000 kr" → the total
    address: ["Provgränd 1", "jsonld"],
    municipality: ["Halmstad", "jsonld"],
  });
});

test("mäklarhuset: bostadsrätt avgift is the current one, not the announced change", () => {
  const url = "https://www.maklarhuset.se/bostad/sverige/halland/halmstad/strandvagen/582772";
  const l = extract(F.maklarhusetBrf(url), url);
  assert.equal(l.monthlyFee?.value, 4788);
  assert.equal(l.tenure?.value, "bostadsratt");
  assert.equal(l.livingArea?.value, 44.3);
});

test("mäklarhuset: JSON-LD for a different page (stale SPA data) is skipped", () => {
  const l = extract(
    F.maklarhusetBrf("https://www.maklarhuset.se/bostad/sverige/halland/halmstad/strandvagen/582772"),
    "https://www.maklarhuset.se/bostad/sverige/skane/malmo/annan/111111",
  );
  // Falls through to the visible text of the page.
  assert.deepEqual(l.price, { value: 1995000, source: "text" });
  assert.equal(l.address, undefined);
});

test("unknown broker site: generic label pass handles spans, dt/dd and filler words", () => {
  const l = extract(F.GENERIC_BROKER, "https://www.example-maklare.se/objekt/123");
  assert.equal(l.site, "generic");
  assert.deepEqual(view(l), {
    price: [3450000, "text"], // "Utgångspris" wins over the nav's "Pris"
    monthlyFee: [5210, "text"],
    operatingCostMonthly: [1250, "text"], // "Totalt" is skipped; "per månad" respected
    tenure: ["bostadsratt", "text"],
    propertyType: ["Radhus", "text"],
    livingArea: [98, "text"],
  });
});

test("pages that aren't listings are recognised as such", () => {
  const l = extract(F.NOT_A_LISTING, "https://www.example-maklare.se/om-oss");
  assert.equal(looksLikeListing(l), false);
});
