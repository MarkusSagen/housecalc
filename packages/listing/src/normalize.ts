import type { Tenure } from "@housecalc/core";

// One place for turning Swedish listing text into numbers, so every adapter
// agrees on units and edge cases.

/** "3 195 000 kr" / "4 788 kr/mån" / "44.3 kvm" / 1825000 → number; null if none. */
export function parseNumber(input: string | number | null | undefined): number | null {
  if (input === null || input === undefined) return null;
  if (typeof input === "number") return Number.isFinite(input) ? input : null;
  // Thousands separators are spaces (incl. nbsp / narrow nbsp); decimals may be , or .
  const m = input.replace(/[  ]/g, " ").match(/\d{1,3}(?: \d{3})+(?:[.,]\d+)?|\d+(?:[.,]\d+)?/);
  if (!m) return null;
  return Number(m[0].replace(/ /g, "").replace(",", "."));
}

/** Positive price in kr, or null for 0 / "Pris ej angivet" / "Budgivning pågår". */
export function parsePrice(input: string | number | null | undefined): number | null {
  if (typeof input === "string" && /ej angivet|saknas|budgivning|ange pris/i.test(input)) return null;
  const n = parseNumber(input);
  return n !== null && n >= 10_000 ? n : null;
}

/**
 * A cost to kr/mån. The unit is read from the text ("kr/år", "kr per år",
 * "/mån", "per månad"); `defaultUnit` applies when the text has none.
 */
export function parseMonthlyCost(
  input: string | number | null | undefined,
  defaultUnit: "month" | "year" = "month",
): number | null {
  const n = parseNumber(input);
  if (n === null) return null;
  let unit = defaultUnit;
  if (typeof input === "string") {
    if (/(\/|per\s*)år|årlig/i.test(input)) unit = "year";
    else if (/(\/|per\s*)mån|månad/i.test(input)) unit = "month";
  }
  return Math.round(unit === "year" ? n / 12 : n);
}

/** "Bostadsrätt" / "TENANT_OWNERSHIP" / "Äganderätt" / "Tomträtt" → Tenure. */
export function parseTenure(input: string | null | undefined): Tenure | null {
  if (!input) return null;
  const s = input.toLowerCase();
  if (/bostadsr|tenant_own|cooperative/.test(s)) return "bostadsratt";
  if (/tomtr|leasehold|site_lease/.test(s)) return "tomtratt";
  if (/ägander|aganderatt|ownership|freehold/.test(s)) return "aganderatt";
  return null;
}

/** schema.org @type → Swedish display label. */
export function propertyTypeFromSchema(type: string | string[] | undefined): string | null {
  const t = (Array.isArray(type) ? type : [type]).join(" ");
  if (/Apartment/.test(t)) return "Lägenhet";
  if (/DetachedHouse|SingleFamilyResidence/.test(t)) return "Villa";
  if (/House/.test(t)) return "Hus";
  return null;
}

export const clean = (s: string | null | undefined): string | null => {
  const t = s?.replace(/\s+/g, " ").trim();
  return t ? t : null;
};
