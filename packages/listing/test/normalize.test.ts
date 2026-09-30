import assert from "node:assert/strict";
import { test } from "node:test";
import { parseMonthlyCost, parseNumber, parsePrice, parseTenure } from "../src/index.ts";

test("parseNumber reads Swedish formatting", () => {
  assert.equal(parseNumber("3 195 000 kr"), 3195000);
  assert.equal(parseNumber("3 195 000 kr"), 3195000); // nbsp
  assert.equal(parseNumber("3 195 000 kr"), 3195000); // narrow nbsp
  assert.equal(parseNumber("44,3 kvm"), 44.3);
  assert.equal(parseNumber("44.3 kvm"), 44.3);
  assert.equal(parseNumber("inget"), null);
});

test("parsePrice rejects placeholders and zero", () => {
  assert.equal(parsePrice("Pris ej angivet"), null);
  assert.equal(parsePrice("Budgivning pågår"), null);
  assert.equal(parsePrice(0), null);
  assert.equal(parsePrice("0"), null);
  assert.equal(parsePrice("2 450 000 kr"), 2450000);
});

test("parseMonthlyCost honours the unit in the text", () => {
  assert.equal(parseMonthlyCost("40 354 kr/år"), 3363);
  assert.equal(parseMonthlyCost("36 000 kr per år"), 3000);
  assert.equal(parseMonthlyCost("1 250 kr per månad", "year"), 1250);
  assert.equal(parseMonthlyCost("4 788 kr/mån"), 4788);
  assert.equal(parseMonthlyCost("24 000", "year"), 2000);
  assert.equal(parseMonthlyCost(3175), 3175);
});

test("parseTenure maps words and API symbols", () => {
  assert.equal(parseTenure("Bostadsrätt"), "bostadsratt");
  assert.equal(parseTenure("Bostadsrättslägenhet"), "bostadsratt");
  assert.equal(parseTenure("TENANT_OWNERSHIP"), "bostadsratt");
  assert.equal(parseTenure("Äganderätt"), "aganderatt");
  assert.equal(parseTenure("OWNERSHIP"), "aganderatt");
  assert.equal(parseTenure("Tomträtt"), "tomtratt");
  assert.equal(parseTenure("Hyresrätt"), null);
});
