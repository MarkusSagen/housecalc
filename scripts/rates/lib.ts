import type { Tenor } from "../../packages/core/src/market.ts";

export type TenorRates = Partial<Record<Tenor, number>>;

export interface FetchedRates {
  list: TenorRates;
  snitt: TenorRates;
  /** YYYY-MM the snitt values refer to. */
  snittPeriod?: string;
}

export interface RateSource {
  /** Must equal the bank's `name` in data/rates/<market>.json. */
  bank: string;
  /** Human-facing page we cite in the UI. */
  url: string;
  fetch(): Promise<FetchedRates>;
}

// Honest, contactable UA. We fetch each page once per run.
export const USER_AGENT = "HousecalcRatesBot/0.1 (+https://github.com/MarkusSagen/housecalc)";

async function get(url: string, accept: string): Promise<Response> {
  const res = await fetch(url, {
    headers: { "user-agent": USER_AGENT, accept },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
  return res;
}

export const fetchJson = async <T = unknown>(url: string): Promise<T> =>
  (await get(url, "application/json")).json() as Promise<T>;

export const fetchText = async (url: string): Promise<string> =>
  (await get(url, "text/html")).text();

const TENORS: readonly Tenor[] = ["3m", "1y", "2y", "3y", "4y", "5y", "6y", "7y", "8y", "10y"];

/**
 * "3 månader" / "3 mån" / "1 år" / "10 år" / "P_3_MONTHS" / "P_10_YEARS" → Tenor.
 * Returns null for anything we don't track (e.g. "Räntetak 2 år" is rejected
 * by callers before it gets here).
 */
export function parseTenor(label: string): Tenor | null {
  const s = label.toLowerCase().replace(/\*/g, "").trim();
  const m = s.match(/(\d+)\s*[_ ]?\s*(mån|månad|månader|months?|år|years?)\b/) ??
    s.match(/p_(\d+)_(months?|years?)/);
  if (!m) return null;
  const n = Number(m[1]);
  const unit = /^(mån|month)/.test(m[2] ?? "") ? "m" : "y";
  const t = `${n}${unit}` as Tenor;
  return TENORS.includes(t) ? t : null;
}

/** "2,70 %" / "3.15" / "2,77&nbsp;%" → 2.7. Returns null when not a number. */
export function parsePct(text: string | number | null | undefined): number | null {
  if (text === null || text === undefined) return null;
  if (typeof text === "number") return Number.isFinite(text) ? text : null;
  const cleaned = text.replace(/&nbsp;| /g, " ").replace("%", "").replace(",", ".").trim();
  if (!/^-?\d+(\.\d+)?$/.test(cleaned)) return null;
  return Number(cleaned);
}

const MONTHS_SV = [
  "januari", "februari", "mars", "april", "maj", "juni",
  "juli", "augusti", "september", "oktober", "november", "december",
];

/** "augusti 2026" / "202608" / "2026-08-31" → "2026-08". */
export function parsePeriod(text: string): string | undefined {
  const s = text.toLowerCase();
  let m = s.match(/(20\d{2})-?(0[1-9]|1[0-2])/);
  if (m) return `${m[1]}-${m[2]}`;
  m = s.match(new RegExp(`(${MONTHS_SV.join("|")})\\s+(20\\d{2})`));
  if (m?.[1]) return `${m[2]}-${String(MONTHS_SV.indexOf(m[1]) + 1).padStart(2, "0")}`;
  return undefined;
}

/** "2026-08" → "augusti 2026". */
export function formatPeriodSv(period: string): string {
  const [y, mo] = period.split("-");
  return `${MONTHS_SV[Number(mo) - 1]} ${y}`;
}

export function setRate(target: TenorRates, tenorLabel: string | undefined, value: string | number | null | undefined) {
  const t = tenorLabel ? parseTenor(tenorLabel) : null;
  const v = parsePct(value);
  if (t && v !== null) target[t] = v;
}
