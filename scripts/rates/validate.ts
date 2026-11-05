import type { BankRates } from "../../packages/core/src/market.ts";
import type { FetchedRates, TenorRates } from "./lib.ts";

// Guardrails deciding whether a run may be auto-published or needs a human.
export const MIN_RATE = 0.5;
export const MAX_RATE = 12;
/** Largest plausible day-to-day move for a single tenor, percentage points. */
export const MAX_DELTA_PP = 1.0;
/** Snitt older than this (days after the end of its month) is flagged stale. */
export const MAX_SNITT_AGE_DAYS = 62;
/** Allowed gap between the mean fetched 3m snitt and SCB's market average. */
export const MAX_SCB_GAP_PP = 0.4;

export interface Issue {
  bank: string;
  /** "block" = don't auto-publish; "warn" = publish, but report. */
  level: "block" | "warn";
  message: string;
}

function checkSeries(bank: string, kind: "list" | "snitt", next: TenorRates, prev: BankRates[typeof kind]): Issue[] {
  const issues: Issue[] = [];
  const entries = Object.entries(next);
  if (entries.length === 0) issues.push({ bank, level: "block", message: `no ${kind} rates parsed` });
  for (const [tenor, v] of entries) {
    if (v < MIN_RATE || v > MAX_RATE)
      issues.push({ bank, level: "block", message: `${kind} ${tenor} = ${v}% outside ${MIN_RATE}–${MAX_RATE}%` });
    const old = prev?.[tenor as keyof TenorRates];
    if (typeof old === "number" && Math.abs(v - old) > MAX_DELTA_PP)
      issues.push({ bank, level: "block", message: `${kind} ${tenor} moved ${old}% → ${v}% (>${MAX_DELTA_PP}pp)` });
  }
  return issues;
}

export function validateBank(bank: string, next: FetchedRates, prev: BankRates | undefined, today: Date): Issue[] {
  const issues = [...checkSeries(bank, "list", next.list, prev?.list), ...checkSeries(bank, "snitt", next.snitt, prev?.snitt)];
  if (!next.snittPeriod) {
    issues.push({ bank, level: "warn", message: "snitt period not found on page" });
  } else {
    const [y = 0, m = 0] = next.snittPeriod.split("-").map(Number);
    const endOfPeriod = Date.UTC(y, m, 0); // day 0 of next month = last day of this one
    const ageDays = (today.getTime() - endOfPeriod) / 86_400_000;
    if (ageDays > MAX_SNITT_AGE_DAYS)
      issues.push({ bank, level: "warn", message: `snitt period ${next.snittPeriod} is ${Math.round(ageDays)} days old` });
  }
  return issues;
}

export function validateAgainstScb(snitt3m: number[], scb: { period: string; rate: number }): Issue[] {
  if (snitt3m.length === 0) return [];
  const mean = snitt3m.reduce((a, b) => a + b, 0) / snitt3m.length;
  const gap = Math.abs(mean - scb.rate);
  return gap > MAX_SCB_GAP_PP
    ? [{ bank: "SCB", level: "block", message: `mean 3m snitt ${mean.toFixed(2)}% vs SCB ${scb.rate}% (${scb.period}) differs by ${gap.toFixed(2)}pp` }]
    : [];
}
