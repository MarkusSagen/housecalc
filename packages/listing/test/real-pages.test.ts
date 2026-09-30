// Regression check against full pages saved from real browsing sessions.
// Those pages are not committed (the repo is public), so this runs only
// when HOUSECALC_REAL_PAGES points at a local folder containing them.
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { parseHTML } from "linkedom";
import { extractListing } from "../src/index.ts";

const dir = process.env.HOUSECALC_REAL_PAGES;
const CASES = [
  {
    file: "hemnet.html",
    url: "https://www.hemnet.se/bostad/lagenhet-1rum-farsta-centrum-stockholms-kommun-nykroppagatan-29-21740611",
    expect: { price: 1825000, monthlyFee: 3175, operatingCostMonthly: 484, tenure: "bostadsratt", livingArea: 40 },
  },
  {
    file: "booli.html",
    url: "https://www.booli.se/annons/6281333",
    expect: { price: undefined, monthlyFee: 3741, operatingCostMonthly: 533, tenure: "bostadsratt", livingArea: 63 },
  },
  {
    file: "mh.html",
    url: "https://www.maklarhuset.se/bostad/sverige/halland/halmstad/kulgrand/677847",
    expect: { price: 3195000, operatingCostMonthly: 3363, tenure: "tomtratt", pantbrev: 1914000, livingArea: 105 },
  },
  {
    file: "mh2.html",
    url: "https://www.maklarhuset.se/bostad/sverige/halland/halmstad/tylosandsvagen/582772",
    expect: { price: 1995000, monthlyFee: 4788, tenure: "bostadsratt", livingArea: 44.3 },
  },
];

for (const c of CASES) {
  const path = dir ? join(dir, c.file) : "";
  test(`real page: ${c.file}`, { skip: !dir || !existsSync(path) ? "HOUSECALC_REAL_PAGES not set" : false }, () => {
    const l = extractListing(parseHTML(readFileSync(path, "utf8")).document as unknown as Document, c.url);
    for (const [k, v] of Object.entries(c.expect)) {
      assert.equal((l as any)[k]?.value, v, `${c.file} ${k}`);
    }
  });
}
