import { fetchJson, parsePeriod, type RateSource, type TenorRates } from "../lib.ts";

// Open JSON API behind handelsbanken.se's (client-rendered) rates page.
const API = "https://www.handelsbanken.se/rsopdistresource/slan/resource/open/v1/mortgagerates";

interface HbRate {
  term: string;
  /** "3" = months, "4" = years. */
  periodBasisType: string;
  rateValue: { valueRaw: number };
}

function toRates(rows: HbRate[]): TenorRates {
  const out: TenorRates = {};
  for (const r of rows) {
    const unit = r.periodBasisType === "3" ? "m" : r.periodBasisType === "4" ? "y" : null;
    if (!unit) continue;
    out[`${r.term}${unit}` as keyof TenorRates] = r.rateValue.valueRaw;
  }
  return out;
}

export const handelsbanken: RateSource = {
  bank: "Handelsbanken",
  url: "https://www.handelsbanken.se/sv/privat/bolan/bolanerantor",
  async fetch() {
    const list = await fetchJson<{ interestRates: HbRate[] }>(`${API}/interestrates`);
    const avg = await fetchJson<{ averageRatePeriods: { period: string; rates: HbRate[] }[] }>(
      `${API}/averagerates`,
    );
    const latest = avg.averageRatePeriods.toSorted((a, b) => b.period.localeCompare(a.period))[0];
    return {
      list: toRates(list.interestRates),
      snitt: latest ? toRates(latest.rates) : {},
      snittPeriod: latest ? parsePeriod(latest.period) : undefined,
    };
  },
};
