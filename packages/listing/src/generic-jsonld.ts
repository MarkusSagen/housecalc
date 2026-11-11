import { parseJsonSafe, scriptText } from "./dom.ts";
import { clean, parseNumber, parsePrice, propertyTypeFromSchema } from "./normalize.ts";
import type { ListingFields } from "./types.ts";

type Node = Record<string, unknown>;

const RESIDENCE = /Apartment|House|Residence|RealEstateListing|Accommodation|Product/;

function flatten(value: unknown, out: Node[] = []): Node[] {
  if (Array.isArray(value)) value.forEach((v) => flatten(v, out));
  else if (value && typeof value === "object") {
    const node = value as Node;
    out.push(node);
    if (node["@graph"]) flatten(node["@graph"], out);
    if (node.offers) flatten(node.offers, out);
    if (node.itemOffered && typeof node.itemOffered === "object") flatten(node.itemOffered, out);
  }
  return out;
}

const typeOf = (n: Node) => [n["@type"]].flat().join(" ");

/** True when the node names a different page than the one we're on (stale SPA data). */
function isForOtherPage(n: Node, url: URL): boolean {
  const raw = typeof n.url === "string" ? n.url : null;
  if (!raw) return false;
  try {
    return new URL(raw, url).pathname.replace(/\/$/, "") !== url.pathname.replace(/\/$/, "");
  } catch {
    return false;
  }
}

/** schema.org data most broker sites embed (Offer.price, floorSize, address, @type). */
export function extractJsonLd(doc: Document, url: URL): ListingFields {
  const nodes = scriptText(doc, 'script[type="application/ld+json"]')
    .flatMap((t) => flatten(parseJsonSafe(t)))
    .filter((n) => !isForOtherPage(n, url));

  const out: ListingFields = {};
  const offer = nodes.find((n) => /Offer/.test(typeOf(n)) && n.price !== undefined);
  const price = offer ? parsePrice(offer.price as string | number) : null;
  if (price !== null && (!offer?.priceCurrency || offer.priceCurrency === "SEK"))
    out.price = { value: price, source: "jsonld" };

  const home = nodes.find((n) => RESIDENCE.test(typeOf(n)) && !/Offer|Agent|Organization/.test(typeOf(n)));
  if (home) {
    const type = propertyTypeFromSchema(home["@type"] as string | string[]);
    if (type) out.propertyType = { value: type, source: "jsonld" };
    const floor = home.floorSize as Node | undefined;
    const area = parseNumber((floor?.value as string | number) ?? null);
    if (area) out.livingArea = { value: area, source: "jsonld" };
    const addr = home.address as Node | undefined;
    const street = clean(addr?.streetAddress as string);
    if (street) out.address = { value: street, source: "jsonld" };
    const locality = clean(addr?.addressLocality as string);
    if (locality) out.municipality = { value: locality, source: "jsonld" };
  }
  return out;
}
