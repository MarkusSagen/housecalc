import { visibleTexts } from "./dom.ts";
import { clean, parseMonthlyCost, parseNumber, parsePrice, parseTenure } from "./normalize.ts";
import type { ListingFields } from "./types.ts";

// Swedish listing pages all use the same field labels, whatever the markup:
// <dt>/<dd>, <th>/<td>, <h6>/<h6>, <span>/<span>, "Avgift: 4 788 kr". We walk the
// visible text in order and treat the text right after a label as its value.
// Labels are tried most-specific first, so "Utgångspris" beats a stray "Pris".
const LABELS = {
  price: [/^utgångspris$/, /^(begärt|accepterat) pris$/, /^pris$/],
  fee: [/^(månads)?avgift$/, /^avgift\/mån$/],
  drift: [/^driftkostnad(er)?( per år| per månad)?$/, /^drift$/],
  tenure: [/^upplåtelseform$/],
  type: [/^(bostadstyp|boendetyp|byggnadstyp|objekttyp)$/, /^typ$/],
  area: [/^boarea(\/biarea)?$/, /^boyta$/, /^bostadsyta$/],
  pantbrev: [/^(befintliga |uttagna )?pantbrev( totalt)?$/],
} as const;

type Key = keyof typeof LABELS;

const normLabel = (t: string) => t.toLowerCase().replace(/[:：]\s*$/, "").trim();
const hasDigit = (t: string) => /\d/.test(t);
const isUnit = (t: string) => /^(kr|sek|kvm|m²|m2)?\s*(\/|per )?\s*(mån(ad)?|år|kvm|m²)?\.?$/i.test(t) && t.length <= 14;

/** Value text for a label at index i, joining a trailing unit node ("4 788" + "kr/mån"). */
function valueAfter(texts: string[], i: number, numeric: boolean): string | null {
  for (let j = i + 1; j <= i + 3 && j < texts.length; j++) {
    const t = texts[j];
    if (numeric && !hasDigit(t)) {
      // Words like "Totalt" between label and number; stop at the next label-ish text.
      if (t.length > 20) return null;
      continue;
    }
    const next = texts[j + 1];
    return next && isUnit(next) && !/kr|kvm|m²/i.test(t) ? `${t} ${next}` : t;
  }
  return null;
}

function find(texts: string[], key: Key, numeric: boolean): string | null {
  for (const re of LABELS[key]) {
    for (let i = 0; i < texts.length; i++) {
      const t = texts[i];
      if (re.test(normLabel(t))) {
        const v = valueAfter(texts, i, numeric);
        if (v) return v;
      }
      // Inline form: "Avgift: 4 788 kr/mån" / "Boarea 63 m²".
      const m = t.match(/^([^\d:]{3,30}?)[:\s]\s*(\d.*)$/);
      if (m && re.test(normLabel(m[1]))) return m[2];
    }
  }
  return null;
}

export function extractText(doc: Document): ListingFields {
  const texts = visibleTexts(doc);
  const out: ListingFields = {};

  const price = parsePrice(find(texts, "price", true));
  if (price !== null) out.price = { value: price, source: "text" };

  const fee = parseMonthlyCost(find(texts, "fee", true), "month");
  if (fee !== null) out.monthlyFee = { value: fee, source: "text" };

  // Unlabelled driftkostnad is almost always per year on Swedish listings.
  const drift = parseMonthlyCost(find(texts, "drift", true), "year");
  if (drift !== null) out.operatingCostMonthly = { value: drift, source: "text" };

  const tenure = parseTenure(find(texts, "tenure", false));
  if (tenure) out.tenure = { value: tenure, source: "text" };

  const type = clean(find(texts, "type", false));
  if (type && type.length <= 40) out.propertyType = { value: type, source: "text" };

  const area = parseNumber(find(texts, "area", true));
  if (area) out.livingArea = { value: area, source: "text" };

  // "Det finns 8 pantbrev om totalt 1 914 000 kr." — the total, not the count.
  const pantbrevText = find(texts, "pantbrev", true);
  const pantbrev = parseNumber(pantbrevText?.match(/totalt\s+([\d\s]+kr)/i)?.[1] ?? pantbrevText);
  if (pantbrev !== null) out.pantbrev = { value: pantbrev, source: "text" };

  // A tenure word printed as the property type ("Typ: Bostadsrätt") still tells us the tenure.
  if (!out.tenure && type) {
    const t = parseTenure(type);
    if (t) out.tenure = { value: t, source: "text" };
  }
  return out;
}
