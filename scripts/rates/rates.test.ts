import assert from "node:assert/strict";
import { test } from "node:test";
import { formatPeriodSv, parsePct, parsePeriod, parseTenor } from "./lib.ts";
import { validateAgainstScb, validateBank } from "./validate.ts";

test("parseTenor handles Swedish labels and SBAB enum codes", () => {
  assert.equal(parseTenor("3 månader"), "3m");
  assert.equal(parseTenor("3 mån"), "3m");
  assert.equal(parseTenor("1 år"), "1y");
  assert.equal(parseTenor("10 år*"), "10y");
  assert.equal(parseTenor("P_3_MONTHS"), "3m");
  assert.equal(parseTenor("P_10_YEARS"), "10y");
  assert.equal(parseTenor("9 år"), null); // not a tenor we track
  assert.equal(parseTenor("Bindningstid"), null);
});

test("parsePct accepts Swedish decimal commas and nbsp", () => {
  assert.equal(parsePct("2,70 %"), 2.7);
  assert.equal(parsePct("2,77 %"), 2.77);
  assert.equal(parsePct("3.15"), 3.15);
  assert.equal(parsePct(4.01), 4.01);
  assert.equal(parsePct("—"), null);
  assert.equal(parsePct(null), null);
});

test("parsePeriod normalises every format we see to YYYY-MM", () => {
  assert.equal(parsePeriod("Snittränta (augusti 2026)"), "2026-08");
  assert.equal(parsePeriod("SNITTRÄNTA 202608"), "2026-08");
  assert.equal(parsePeriod("2026-08-31"), "2026-08");
  assert.equal(parsePeriod("Bindningstid"), undefined);
  assert.equal(formatPeriodSv("2026-08"), "augusti 2026");
});

const today = new Date("2026-09-29T06:00:00Z");
const ok = { list: { "3m": 3.9 }, snitt: { "3m": 2.7 }, snittPeriod: "2026-08" };

test("validateBank passes a normal update", () => {
  assert.deepEqual(validateBank("X", ok, { name: "X", source: "", list: { "3m": 3.85 } }, today), []);
});

test("validateBank blocks empty parses, absurd values and big jumps", () => {
  const empty = validateBank("X", { list: {}, snitt: {} }, undefined, today);
  assert.equal(empty.filter((i) => i.level === "block").length, 2);

  const absurd = validateBank("X", { ...ok, list: { "3m": 39 } }, undefined, today);
  assert.ok(absurd.some((i) => i.level === "block" && /outside/.test(i.message)));

  const jump = validateBank("X", ok, { name: "X", source: "", snitt: { "3m": 1.2 } }, today);
  assert.ok(jump.some((i) => i.level === "block" && /moved/.test(i.message)));
});

test("validateBank warns (does not block) on stale or missing snitt period", () => {
  const stale = validateBank("X", { ...ok, snittPeriod: "2026-05" }, undefined, today);
  assert.deepEqual(stale.map((i) => i.level), ["warn"]);
  const missing = validateBank("X", { ...ok, snittPeriod: undefined }, undefined, today);
  assert.deepEqual(missing.map((i) => i.level), ["warn"]);
});

test("validateAgainstScb blocks when banks diverge from the market average", () => {
  const scb = { period: "2026-08", rate: 2.73 };
  assert.deepEqual(validateAgainstScb([2.72, 2.75, 2.7, 2.77], scb), []);
  assert.equal(validateAgainstScb([3.5, 3.6], scb)[0]?.level, "block");
  assert.deepEqual(validateAgainstScb([], scb), []);
});
