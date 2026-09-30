import { nextFlightPayload, objectsContaining } from "../dom.ts";
import { clean, parseMonthlyCost, parseNumber, parsePrice, parseTenure } from "../normalize.ts";
import type { ListingFields, SiteAdapter } from "../types.ts";

type Obj = Record<string, any>;

/** Booli wraps numbers as FormattedValue { raw, value, unit }. */
const raw = (v: any): number | null => (v && typeof v === "object" ? parseNumber(v.raw) : parseNumber(v));

// booli.se/annons/<id>: Next.js app router. Data is streamed in
// self.__next_f.push script tags; the listing is the object with
// "__typename":"Listing" whose booliId matches the URL (similar-listing
// cards are Listings too).
export const booli: SiteAdapter = {
  id: "booli",
  hosts: /(^|\.)booli\.se$/,
  extract(doc, url) {
    const id = url.pathname.match(/^\/annons\/(\d+)/)?.[1];
    if (!id) return {};
    const L = objectsContaining(nextFlightPayload(doc), '"__typename":"Listing"').find(
      (o): o is Obj => String((o as Obj).booliId) === id,
    );
    if (!L) return {};

    const out: ListingFields = {};
    const s = "structured" as const;
    const price = parsePrice(raw(L.listPrice));
    if (price !== null) out.price = { value: price, source: s };
    const fee = raw(L.rent);
    if (fee !== null) out.monthlyFee = { value: fee, source: s };
    if (L.operatingCost) {
      const drift = parseMonthlyCost(`${raw(L.operatingCost)} ${L.operatingCost.unit ?? ""}`, "month");
      if (drift !== null) out.operatingCostMonthly = { value: drift, source: s };
    }
    const tenure = parseTenure(L.tenureForm);
    if (tenure) out.tenure = { value: tenure, source: s };
    const type = clean(L.objectType);
    if (type) out.propertyType = { value: type, source: s };
    const area = raw(L.livingArea);
    if (area) out.livingArea = { value: area, source: s };
    const pantbrev = raw(L.mortgageDeed);
    if (pantbrev !== null) out.pantbrev = { value: pantbrev, source: s };
    const street = clean(L.streetAddress);
    if (street) out.address = { value: street, source: s };
    const muni = clean(L.location?.region?.municipalityName ?? L.location?.namedAreas?.[0]);
    if (muni) out.municipality = { value: muni, source: s };
    return out;
  },
};
