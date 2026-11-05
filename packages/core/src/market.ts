// A Market bundles everything country-specific: purchase fees, tax relief,
// amortization law, locale/currency and the list of lenders whose rates we
// track. The UI, the extension and the rates pipeline only talk to this
// interface, so adding a country means adding one folder under markets/.

/**
 * Upplåtelseform. It decides the one-time costs: only freehold (äganderätt) and
 * site leasehold (tomträtt) register title and mortgage deeds; a bostadsrätt
 * is pledged through the association, so it has no lagfart or pantbrev.
 */
export type Tenure = "aganderatt" | "tomtratt" | "bostadsratt";

export interface PurchaseParams {
  /** Defaults to "aganderatt". */
  tenure?: Tenure;
  /** Down payment as % of price. */
  hpPct: number;
  /** Mortgage deeds (pantbrev) already on the property, in currency units. */
  existingPantbrev: number;
  /** Nominal annual interest rate, %. */
  rate: number;
  /** Annual amortization, % of initial loan. */
  amort: number;
  /** Monthly fee (avgift/driftkostnad), currency units. */
  monthlyFee: number;
}

export interface PurchaseResult {
  price: number;
  hpTotal: number;
  loan: number;
  ltv: number;
  lagfart: number;
  pantbrev: number;
  onetimeTotal: number;
  monthlyInterest: number;
  monthlyAmort: number;
  monthlyFee: number;
  monthlyTotal: number;
  monthlyAfterTax: number;
}

export interface PayoffPoint {
  year: number;
  remaining: number;
  ltv: number;
}

export interface PayoffResult {
  fiSeries: PayoffPoint[];
  voluntarySeries: PayoffPoint[];
  yearTier1: number | null;
  yearTier0: number | null;
  yearPaidOffFi: number | null;
  yearPaidOffVol: number | null;
  totalInterestFi30: number;
}

export interface Market {
  id: string;
  /** BCP 47 locale used for number formatting and UI copy. */
  locale: string;
  /** ISO 4217. */
  currency: string;
  /** Regulatory maximum loan-to-value, %. */
  ltvCapPct: number;
  computeForPrice(price: number, params: PurchaseParams): PurchaseResult;
  recommendedAmortPct(ltvPct: number): number;
  /** Monthly tax credit on the given monthly interest (0 where none exists). */
  monthlyInterestTaxCredit(monthlyInterest: number): number;
  projectPayoff(
    initialLoan: number,
    initialPrice: number,
    rate: number,
    appreciationPct: number,
    maxYears?: number,
  ): PayoffResult;
}

/** Shape of data/rates/<market>.json, written by scripts/rates. */
export interface RatesFile {
  market: string;
  updated: string;
  snittranta_period: string;
  /** Date/period of the last hand edit, for banks without automated sources. */
  manual_updated?: string;
  manual_period?: string;
  note?: string;
  banks: BankRates[];
}

export type Tenor = "3m" | "1y" | "2y" | "3y" | "4y" | "5y" | "6y" | "7y" | "8y" | "10y";

export interface BankRates {
  name: string;
  source: string;
  type?: string;
  list?: Partial<Record<Tenor, number | null>>;
  snitt?: Partial<Record<Tenor, number | null>>;
  /** YYYY-MM-DD of the last successful automated fetch; absent = hand-maintained. */
  fetched?: string;
  /** Period (YYYY-MM) the snitt values refer to, when the source states it. */
  snitt_period?: string;
  criteria?: Record<string, unknown>;
}
