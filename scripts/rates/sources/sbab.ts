import { fetchJson, parsePeriod, setRate, type RateSource, type TenorRates } from "../lib.ts";

const LIST_API = "https://www.sbab.se/api/interest-mortgage-service/api/external/v1/interest";
const AVG_API =
  "https://www.sbab.se/api/historical-average-interest-rate-service/interest-rate/average-interest-rate-last-twelve-months-by-period";

const AVG_KEYS: Record<string, string> = {
  three_months: "3 mån",
  one_year: "1 år",
  two_years: "2 år",
  three_years: "3 år",
  four_years: "4 år",
  five_years: "5 år",
  seven_years: "7 år",
  ten_years: "10 år",
};

export const sbab: RateSource = {
  bank: "SBAB",
  url: "https://www.sbab.se/1/privat/lana/bolan/bolanerantor.html",
  async fetch() {
    const listRes = await fetchJson<{ listInterests: { period: string; interestRate: string }[] }>(LIST_API);
    const list: TenorRates = {};
    for (const r of listRes.listInterests) setRate(list, r.period, r.interestRate);

    const avgRes = await fetchJson<{ average_interest_rate_last_twelve_months: Record<string, number | string | null>[] }>(
      AVG_API,
    );
    const latest = avgRes.average_interest_rate_last_twelve_months.toSorted((a, b) =>
      String(b.period).localeCompare(String(a.period)),
    )[0];
    const snitt: TenorRates = {};
    if (latest) for (const [key, label] of Object.entries(AVG_KEYS)) setRate(snitt, label, latest[key]);
    return { list, snitt, snittPeriod: latest ? parsePeriod(String(latest.period)) : undefined };
  },
};
