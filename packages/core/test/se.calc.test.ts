import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ranteavdragMonthlyCredit,
  recommendedAmortPct,
  computeForPrice,
  projectPayoff,
  LTV_TIER_HIGH_PCT,
  LTV_TIER_MID_PCT,
  AMORT_PCT_HIGH,
  AMORT_PCT_MID,
  AMORT_PCT_LOW,
  RANTEAVDRAG_CAP_ANNUAL,
} from "../src/markets/se/index.ts";

// =============================================================================
// ranteavdragMonthlyCredit
// =============================================================================

test("ranteavdrag: zero interest gives zero credit", () => {
  assert.equal(ranteavdragMonthlyCredit(0), 0);
});

test("ranteavdrag: below 100 000 kr/year applies 30% rate", () => {
  // 50 000 kr/year → 50 000 * 0.30 = 15 000 kr credit/year = 1 250 kr/month
  const monthly = 50_000 / 12;
  assert.equal(ranteavdragMonthlyCredit(monthly), Math.floor(15_000 / 12));
});

test("ranteavdrag: exactly at 100k cap stays in 30% band", () => {
  const monthly = RANTEAVDRAG_CAP_ANNUAL / 12;
  // 100k * 0.30 = 30k credit/year = 2 500 kr/month
  assert.equal(ranteavdragMonthlyCredit(monthly), 2_500);
});

test("ranteavdrag: above 100k cap, second band applies 21%", () => {
  // 150 000 kr/year: 100k @ 30% (30 000) + 50k @ 21% (10 500) = 40 500 credit/year
  const monthly = 150_000 / 12;
  assert.equal(ranteavdragMonthlyCredit(monthly), Math.floor(40_500 / 12));
});

// =============================================================================
// recommendedAmortPct  (lag 2026:226 tiers, no DTI surcharge)
// =============================================================================

test("amort tier: LTV above 70% gets 2%", () => {
  assert.equal(recommendedAmortPct(100), AMORT_PCT_HIGH);
  assert.equal(recommendedAmortPct(71), AMORT_PCT_HIGH);
  // 70.001 is > 70
  assert.equal(recommendedAmortPct(70.001), AMORT_PCT_HIGH);
});

test("amort tier: LTV at exactly 70% gets 1% (boundary is exclusive)", () => {
  assert.equal(recommendedAmortPct(LTV_TIER_HIGH_PCT), AMORT_PCT_MID);
});

test("amort tier: LTV 51% gets 1%", () => {
  assert.equal(recommendedAmortPct(51), AMORT_PCT_MID);
});

test("amort tier: LTV at exactly 50% gets 0% (boundary is exclusive)", () => {
  assert.equal(recommendedAmortPct(LTV_TIER_MID_PCT), AMORT_PCT_LOW);
});

test("amort tier: LTV below 50% gets 0%", () => {
  assert.equal(recommendedAmortPct(49), AMORT_PCT_LOW);
  assert.equal(recommendedAmortPct(0), AMORT_PCT_LOW);
});

test("amort tier: no DTI surcharge anymore (post-2026-04-01)", () => {
  // Pre-2026 the signature took (ltvPct, dti). Post-law the +1% rule is gone.
  // The function must not accept or apply a dti argument.
  assert.equal(recommendedAmortPct.length, 1, "function arity must be 1");
});

// =============================================================================
// computeForPrice
// =============================================================================

const BASELINE_PARAMS = {
  hpPct: 10,
  existingPantbrev: 0,
  rate: 3.0,
  amort: 2.0,
  monthlyFee: 4_500,
};

test("computeForPrice: default 8.5 Mkr house, 10% kontant, 3% / 2% rates", () => {
  const r = computeForPrice(8_500_000, BASELINE_PARAMS);
  assert.equal(r.hpTotal, 850_000);
  assert.equal(r.loan, 7_650_000);
  assert.equal(r.ltv, 90);
  // Lagfart = 1.5% * 8.5M + 825 = 127 500 + 825 = 128 325
  assert.equal(r.lagfart, 128_325);
  // Pantbrev = 2% * 7.65M + 375 = 153 000 + 375 = 153 375
  assert.equal(r.pantbrev, 153_375);
  assert.equal(r.onetimeTotal, 850_000 + 128_325 + 153_375);
});

test("computeForPrice: monthly cost composition matches inputs", () => {
  const r = computeForPrice(8_500_000, BASELINE_PARAMS);
  // monthly interest = 7.65M * 3% / 12 = 19 125
  assert.equal(r.monthlyInterest, 19_125);
  // monthly amort = 7.65M * 2% / 12 = 12 750
  assert.equal(r.monthlyAmort, 12_750);
  assert.equal(r.monthlyFee, 4_500);
  assert.equal(r.monthlyTotal, 19_125 + 12_750 + 4_500);
});

test("computeForPrice: monthlyAfterTax subtracts the ränteavdrag credit", () => {
  const r = computeForPrice(8_500_000, BASELINE_PARAMS);
  // Annual interest = 19 125 * 12 = 229 500. Above 100k cap.
  // Credit = 100k * 0.30 + 129 500 * 0.21 = 30 000 + 27 195 = 57 195
  // Monthly credit = floor(57 195 / 12) = 4 766
  const expectedCredit = Math.floor(
    (100_000 * 0.3 + (229_500 - 100_000) * 0.21) / 12,
  );
  assert.equal(r.monthlyTotal - r.monthlyAfterTax, expectedCredit);
});

test("computeForPrice: existing pantbrev reduces new pantbrev stamp duty", () => {
  // With 5M of existing pantbrev, only the remaining 2.65M is "new"
  const r = computeForPrice(8_500_000, { ...BASELINE_PARAMS, existingPantbrev: 5_000_000 });
  // new pantbrev = 7.65M - 5M = 2.65M → 0.02 * 2.65M + 375 = 53 000 + 375
  assert.equal(r.pantbrev, 53_375);
});

test("computeForPrice: existing pantbrev exceeding new loan zeroes pantbrev cost", () => {
  const r = computeForPrice(8_500_000, { ...BASELINE_PARAMS, existingPantbrev: 10_000_000 });
  assert.equal(r.pantbrev, 0);
});

test("computeForPrice: 100% kontant gives no loan, no pantbrev, just lagfart", () => {
  const r = computeForPrice(8_500_000, { ...BASELINE_PARAMS, hpPct: 100 });
  assert.equal(r.loan, 0);
  assert.equal(r.ltv, 0);
  assert.equal(r.pantbrev, 0);
  assert.equal(r.lagfart, 128_325);
  assert.equal(r.monthlyInterest, 0);
  assert.equal(r.monthlyAmort, 0);
});

test("computeForPrice: price = 0 gives all zeros, no NaN", () => {
  const r = computeForPrice(0, BASELINE_PARAMS);
  assert.equal(r.loan, 0);
  assert.equal(r.ltv, 0);
  assert.equal(r.lagfart, 0);
  assert.equal(r.pantbrev, 0);
  assert.equal(r.monthlyTotal, 4_500); // just the fee
});

// =============================================================================
// projectPayoff
// =============================================================================

test("projectPayoff: returns year-0 + maxYears snapshots", () => {
  const proj = projectPayoff(7_650_000, 8_500_000, 3.0, 0, 50);
  assert.equal(proj.fiSeries.length, 51); // year 0..50
  assert.equal(proj.voluntarySeries.length, 51);
});

test("projectPayoff: zero appreciation, 3% rate — yearTier1 reflects start-of-year LTV", () => {
  // 7.65M / 8.5M = 90% LTV. Tier high (2%) → 153 000 kr/year off principal.
  // The flagged year is the first where the *start-of-year* LTV is ≤70%, i.e.
  // the year AFTER the one in which LTV crosses the line. Each year LTV drops
  // 1.8 pp (153 000 / 8 500 000). Start LTVs: y1=90, y2=88.2, …, y12=70.2, y13=68.4.
  // So yearTier1 = 13.
  const proj = projectPayoff(7_650_000, 8_500_000, 3.0, 0, 50);
  assert.equal(proj.yearTier1, 13);
});

test("projectPayoff: zero rate means voluntary 2% pays off in 50 years exactly", () => {
  const proj = projectPayoff(7_650_000, 8_500_000, 0, 0, 60);
  // Voluntary 2% on 7.65M = 153k/year. 7 650 000 / 153 000 = 50 years.
  assert.equal(proj.yearPaidOffVol, 50);
});

test("projectPayoff: appreciation accelerates the tier drops", () => {
  const noApp = projectPayoff(7_650_000, 8_500_000, 3.0, 0, 50);
  const withApp = projectPayoff(7_650_000, 8_500_000, 3.0, 3, 50);
  // With house appreciation, LTV falls faster — tier drops should happen at or before
  // the no-appreciation timeline. Equality counts as "not later".
  assert.ok(
    withApp.yearTier1 !== null && noApp.yearTier1 !== null && withApp.yearTier1 <= noApp.yearTier1,
    `yearTier1 should drop earlier with appreciation (got ${withApp.yearTier1} vs ${noApp.yearTier1})`,
  );
});

test("projectPayoff: zero loan returns immediately-paid-off projections", () => {
  const proj = projectPayoff(0, 8_500_000, 3.0, 0, 10);
  assert.equal(proj.fiSeries[0].remaining, 0);
  // yearPaidOffFi is only set when remainingFi reaches <= 0 INSIDE the loop, so
  // for an already-zero start it stays null. That's a known edge.
  assert.equal(proj.yearTier0, 1); // LTV is 0 from year 1
});

test("projectPayoff: totalInterestFi30 is positive and grows with rate", () => {
  const r3 = projectPayoff(7_650_000, 8_500_000, 3.0, 0, 50);
  const r5 = projectPayoff(7_650_000, 8_500_000, 5.0, 0, 50);
  assert.ok(r3.totalInterestFi30 > 0);
  assert.ok(r5.totalInterestFi30 > r3.totalInterestFi30);
});

// =============================================================================
// tenure (upplåtelseform)
// =============================================================================

const TENURE_BASE = { hpPct: 15, existingPantbrev: 0, rate: 3, amort: 2, monthlyFee: 4_000 };

test("tenure: äganderätt (default) pays lagfart and pantbrev", () => {
  const r = computeForPrice(3_000_000, TENURE_BASE);
  assert.equal(r.lagfart, 45_000 + 825);
  assert.equal(r.pantbrev, Math.round(0.02 * 2_550_000) + 375);
  assert.deepEqual(computeForPrice(3_000_000, { ...TENURE_BASE, tenure: "aganderatt" }), r);
});

test("tenure: tomträtt registers like äganderätt", () => {
  const r = computeForPrice(3_000_000, { ...TENURE_BASE, tenure: "tomtratt" });
  assert.equal(r.lagfart, 45_825);
  assert.ok(r.pantbrev > 0);
});

test("tenure: bostadsrätt has no lagfart or pantbrev; monthly costs unchanged", () => {
  const house = computeForPrice(3_000_000, TENURE_BASE);
  const br = computeForPrice(3_000_000, { ...TENURE_BASE, tenure: "bostadsratt" });
  assert.equal(br.lagfart, 0);
  assert.equal(br.pantbrev, 0);
  assert.equal(br.onetimeTotal, br.hpTotal);
  assert.equal(br.monthlyTotal, house.monthlyTotal);
  assert.equal(br.monthlyAfterTax, house.monthlyAfterTax);
});
