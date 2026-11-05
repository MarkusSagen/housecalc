// Pure math for Swedish bolån calculations. No DOM, no globals.
// Shared by the web app, the browser extension and the tests.

import type { PayoffResult, PurchaseParams, PurchaseResult } from "../../market.ts";

// --- Lantmäteriet purchase fees ----------------------------------------------
export const STAMP_DUTY_RATE = 0.015; // stämpelskatt (lagfart)
export const LAGFART_FEE_KR = 825; // expeditionsavgift för lagfart
export const PANTBREV_RATE = 0.02; // stämpelskatt på nytt pantbrev
export const PANTBREV_FEE_KR = 375; // expeditionsavgift per pantbrev

// --- Skatteverket ränteavdrag ------------------------------------------------
export const RANTEAVDRAG_CAP_ANNUAL = 100_000; // 30% upp till denna gräns/år
export const RANTEAVDRAG_RATE_BELOW = 0.3;
export const RANTEAVDRAG_RATE_ABOVE = 0.21;

// --- Lag 2026:226 (effective 2026-04-01) -------------------------------------
// The +1% rule for DTI > 4.5× (skärpta amorteringskravet) was abolished on
// the same date and is no longer modeled.
export const LTV_TIER_HIGH_PCT = 70;
export const LTV_TIER_MID_PCT = 50;
export const AMORT_PCT_HIGH = 2;
export const AMORT_PCT_MID = 1;
export const AMORT_PCT_LOW = 0;
export const LTV_CAP_PCT = 90;

/**
 * Monthly ränteavdrag tax credit on the given monthly interest.
 * 30% on the first 100 000 kr annual interest, 21% above.
 */
export function ranteavdragMonthlyCredit(monthlyInterestKr: number): number {
  const annual = monthlyInterestKr * 12;
  const credit =
    annual <= RANTEAVDRAG_CAP_ANNUAL
      ? Math.round(annual * RANTEAVDRAG_RATE_BELOW)
      : Math.round(
          RANTEAVDRAG_CAP_ANNUAL * RANTEAVDRAG_RATE_BELOW +
            (annual - RANTEAVDRAG_CAP_ANNUAL) * RANTEAVDRAG_RATE_ABOVE,
        );
  return Math.floor(credit / 12);
}

/**
 * Statutory minimum amortization tier (lag 2026:226). Pure LTV-based.
 * Boundaries are exclusive on the lower side: LTV = 50% gets 0%, LTV = 70% gets 1%.
 */
export function recommendedAmortPct(ltvPct: number): number {
  if (ltvPct > LTV_TIER_HIGH_PCT) return AMORT_PCT_HIGH;
  if (ltvPct > LTV_TIER_MID_PCT) return AMORT_PCT_MID;
  return AMORT_PCT_LOW;
}

/**
 * One-time costs + monthly costs for a purchase scenario.
 * `params` = { hpPct, existingPantbrev, rate, amort, monthlyFee, tenure? }.
 */
export function computeForPrice(price: number, params: PurchaseParams): PurchaseResult {
  const { hpPct, existingPantbrev, rate, amort, monthlyFee, tenure = "aganderatt" } = params;
  const hpTotal = Math.round((price * hpPct) / 100);
  const loan = Math.max(0, price - hpTotal);
  const ltv = price > 0 ? (loan / price) * 100 : 0;

  // A bostadsrätt is pledged via the association: no title, no mortgage deeds.
  const registersTitle = tenure !== "bostadsratt";
  const lagfart =
    registersTitle && price > 0 ? Math.round(STAMP_DUTY_RATE * price) + LAGFART_FEE_KR : 0;
  const newPantbrev = Math.max(0, loan - existingPantbrev);
  const pantbrev =
    registersTitle && newPantbrev > 0
      ? Math.round(PANTBREV_RATE * newPantbrev) + PANTBREV_FEE_KR
      : 0;
  const onetimeTotal = hpTotal + lagfart + pantbrev;

  const monthlyInterest = Math.round((loan * (rate / 100)) / 12);
  const monthlyAmort = Math.round((loan * (amort / 100)) / 12);
  const monthlyTotal = monthlyInterest + monthlyAmort + monthlyFee;
  const monthlyAfterTax = monthlyTotal - ranteavdragMonthlyCredit(monthlyInterest);

  return {
    price,
    hpTotal,
    loan,
    ltv,
    lagfart,
    pantbrev,
    onetimeTotal,
    monthlyInterest,
    monthlyAmort,
    monthlyFee,
    monthlyTotal,
    monthlyAfterTax,
  };
}

/**
 * Year-by-year payoff projection under FI tier rules (auto-stepping
 * amortization as LTV falls) vs continued voluntary 2% throughout.
 * Amortization base = initial loan (Booli/SBAB convention).
 */
export function projectPayoff(
  initialLoan: number,
  initialPrice: number,
  rate: number,
  appreciationPct: number,
  maxYears = 50,
): PayoffResult {
  const fiSeries: PayoffResult["fiSeries"] = [];
  const voluntarySeries: PayoffResult["voluntarySeries"] = [];
  let remainingFi = initialLoan;
  let remainingVol = initialLoan;
  let houseValue = initialPrice;

  let yearTier1: number | null = null;
  let yearTier0: number | null = null;
  let yearPaidOffFi: number | null = null;
  let yearPaidOffVol: number | null = null;

  const initialLtv = initialPrice > 0 ? (100 * initialLoan) / initialPrice : 0;
  fiSeries.push({ year: 0, remaining: remainingFi, ltv: initialLtv });
  voluntarySeries.push({ year: 0, remaining: remainingVol, ltv: initialLtv });

  const voluntaryAnnualAmort = 0.02 * initialLoan;

  for (let year = 1; year <= maxYears; year++) {
    houseValue = houseValue * (1 + appreciationPct / 100);

    const ltvFi = houseValue > 0 ? (remainingFi / houseValue) * 100 : 0;
    const amortPctFi = recommendedAmortPct(ltvFi);
    const annualAmortFi = (amortPctFi / 100) * initialLoan;
    const paidFi = Math.min(annualAmortFi, remainingFi);
    remainingFi = Math.max(0, remainingFi - paidFi);

    if (yearTier1 === null && ltvFi <= LTV_TIER_HIGH_PCT) yearTier1 = year;
    if (yearTier0 === null && ltvFi <= LTV_TIER_MID_PCT) yearTier0 = year;
    if (yearPaidOffFi === null && remainingFi <= 0) yearPaidOffFi = year;

    fiSeries.push({ year, remaining: remainingFi, ltv: ltvFi });

    const paidVol = Math.min(voluntaryAnnualAmort, remainingVol);
    remainingVol = Math.max(0, remainingVol - paidVol);
    if (yearPaidOffVol === null && remainingVol <= 0) yearPaidOffVol = year;

    voluntarySeries.push({
      year,
      remaining: remainingVol,
      ltv: houseValue > 0 ? (100 * remainingVol) / houseValue : 0,
    });
  }

  // Sum interest for years 1..30 using each year's start-of-year balance
  // (= prior year's remaining). Approximation: ignores intra-year amortization.
  const totalInterestFi30 = fiSeries
    .slice(0, 30)
    .reduce((sum, snapshot) => sum + snapshot.remaining * (rate / 100), 0);

  return {
    fiSeries,
    voluntarySeries,
    yearTier1,
    yearTier0,
    yearPaidOffFi,
    yearPaidOffVol,
    totalInterestFi30,
  };
}
  