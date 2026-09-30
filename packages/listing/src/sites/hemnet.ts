import { parseJsonSafe, scriptText } from "../dom.ts";
import { clean, parseMonthlyCost, parsePrice, parseTenure } from "../normalize.ts";
import type { ListingFields, SiteAdapter } from "../types.ts";

type Obj = Record<string, any>;

// hemnet.se/bostad/<slug>-<id>: Next.js pages router. The listing lives in
// __NEXT_DATA__ → props.pageProps.__APOLLO_STATE__["ActivePropertyListing:<id>"].
// After client-side navigation __NEXT_DATA__ still describes the *first* page,
// so we only trust it when the id matches the current URL.
export const hemnet: SiteAdapter = {
  id: "hemnet",
  hosts: /(^|\.)hemnet\.se$/,
  extract(doc, url) {
    const id = url.pathname.match(/^\/bostad\/.*-(\d+)\/?$/)?.[1];
    if (!id) return {};
    const data = parseJsonSafe<Obj>(scriptText(doc, "script#__NEXT_DATA__")[0] ?? "");
    const state: Obj | undefined = data?.props?.pageProps?.__APOLLO_STATE__;
    if (!state) return {};
    const key = Object.keys(state).find((k) => k.endsWith(`Listing:${id}`));
    const L = key ? state[key] : null;
    if (!L || String(L.id) !== id) return {};

    const out: ListingFields = {};
    const s = "structured" as const;
    const price = parsePrice(L.askingPrice?.amount);
    if (price !== null) out.price = { value: price, source: s };
    if (typeof L.fee?.amount === "number") out.monthlyFee = { value: L.fee.amount, source: s };
    // Hemnet's runningCosts is yearly ("Driftkostnad 5 808 kr/år").
    const drift = parseMonthlyCost(L.runningCosts?.amount, "year");
    if (drift !== null) out.operatingCostMonthly = { value: drift, source: s };
    const tenure = parseTenure(L.tenure?.name ?? L.tenure?.symbol);
    if (tenure) out.tenure = { value: tenure, source: s };
    const type = clean(L.housingForm?.name);
    if (type) out.propertyType = { value: type, source: s };
    if (typeof L.livingArea === "number") out.livingArea = { value: L.livingArea, source: s };
    const street = clean(L.streetAddress);
    if (street) out.address = { value: street, source: s };
    const muni = clean(state[L.municipality?.__ref]?.fullName);
    if (muni) out.municipality = { value: muni, source: s };
    return out;
  },
};
