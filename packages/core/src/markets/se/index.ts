import type { Market } from "../../market.ts";
import {
  LTV_CAP_PCT,
  computeForPrice,
  projectPayoff,
  ranteavdragMonthlyCredit,
  recommendedAmortPct,
} from "./calc.ts";

export * from "./calc.ts";

export const se: Market = {
  id: "se",
  locale: "sv-SE",
  currency: "SEK",
  ltvCapPct: LTV_CAP_PCT,
  computeForPrice,
  recommendedAmortPct,
  monthlyInterestTaxCredit: ranteavdragMonthlyCredit,
  projectPayoff,
};
