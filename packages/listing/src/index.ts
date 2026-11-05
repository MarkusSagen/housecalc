import { extractJsonLd } from "./generic-jsonld.ts";
import { extractText } from "./generic-text.ts";
import { booli } from "./sites/booli.ts";
import { hemnet } from "./sites/hemnet.ts";
import type { Listing, ListingFields, SiteAdapter } from "./types.ts";

export type * from "./types.ts";
export { parseMonthlyCost, parseNumber, parsePrice, parseTenure } from "./normalize.ts";

// Sites whose structured data needs custom code. Everything else (Mäklarhuset,
// Svensk Fast, Bjurfors, …) is covered by the generic JSON-LD + label passes;
// they get a name here so the popup can say where the data came from.
export const ADAPTERS: SiteAdapter[] = [hemnet, booli];

const NAMED_SITES: [RegExp, string][] = [
  [/(^|\.)maklarhuset\.se$/, "maklarhuset"],
  [/(^|\.)svenskfast\.se$/, "svenskfast"],
  [/(^|\.)fastighetsbyran\.com$/, "fastighetsbyran"],
  [/(^|\.)erikolsson\.se$/, "erikolsson"],
  [/(^|\.)bjurfors\.se$/, "bjurfors"],
  [/(^|\.)notar\.se$/, "notar"],
  [/(^|\.)lansfast\.se$/, "lansfast"],
];

const FIELDS = [
  "price", "monthlyFee", "operatingCostMonthly", "tenure", "propertyType",
  "livingArea", "pantbrev", "address", "municipality",
] as const satisfies readonly (keyof ListingFields)[];

/**
 * Read a listing from the page. Three passes, first value per field wins:
 * site-specific structured data → schema.org JSON-LD → visible label text.
 */
export function extractListing(doc: Document, href: string): Listing {
  const url = new URL(href);
  const adapter = ADAPTERS.find((a) => a.hosts.test(url.hostname));
  const passes: ListingFields[] = [];
  if (adapter) {
    try {
      passes.push(adapter.extract(doc, url));
    } catch {
      // A site redesign must not take down the generic passes.
    }
  }
  passes.push(extractJsonLd(doc, url), extractText(doc));

  const listing: Listing = {
    url: href,
    site: adapter?.id ?? NAMED_SITES.find(([re]) => re.test(url.hostname))?.[1] ?? "generic",
  };
  for (const key of FIELDS) {
    const hit = passes.find((p) => p[key] !== undefined)?.[key];
    if (hit) (listing as any)[key] = hit;
  }
  return listing;
}

/** Enough to calculate with: a price, or at least a monthly cost and a tenure. */
export function looksLikeListing(l: Listing): boolean {
  return l.price !== undefined || (l.monthlyFee !== undefined && l.tenure !== undefined);
}
