import type { Tenure } from "@housecalc/core";

/** Where a value came from, shown in the popup so the user knows what to trust. */
export type FieldSource = "structured" | "jsonld" | "text";

export interface Field<T> {
  value: T;
  source: FieldSource;
}

export interface Listing {
  url: string;
  /** Adapter id, or "generic" when no site adapter matched. */
  site: string;
  /** Asking price (utgångspris) in kr; absent for "Pris ej angivet"/bidding. */
  price?: Field<number>;
  /** BRF avgift, kr/mån. */
  monthlyFee?: Field<number>;
  /** Driftkostnad normalised to kr/mån. */
  operatingCostMonthly?: Field<number>;
  tenure?: Field<Tenure>;
  /** Display label, e.g. "Lägenhet", "Villa", "Kedjehus". */
  propertyType?: Field<string>;
  livingArea?: Field<number>;
  /** Existing mortgage deeds (pantbrev) in kr, when stated. */
  pantbrev?: Field<number>;
  address?: Field<string>;
  municipality?: Field<string>;
}

export type ListingFields = Omit<Listing, "url" | "site">;

export interface SiteAdapter {
  id: string;
  hosts: RegExp;
  /** Structured extraction; must return {} unless the data is for *this* URL's listing. */
  extract(doc: Document, url: URL): ListingFields;
}
