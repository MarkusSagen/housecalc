// Fetches current Swedish mortgage rates, validates them, and rewrites
// data/rates/se.json. Run by .github/workflows/rates.yml on a schedule.
//
//   node scripts/rates/update.ts            # write se.json + print report
//   node scripts/rates/update.ts --dry-run  # report only
//
// Exit code 0 even when checks fail: the workflow reads `review` from
// $GITHUB_OUTPUT and opens a PR instead of pushing. Exit 1 only when every
// source failed (so the workflow run goes red and notifies).
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import type { RatesFile } from "../../packages/core/src/market.ts";
import { formatPeriodSv, type FetchedRates } from "./lib.ts";
import { fetchScbAverage3m } from "./scb.ts";
import { SE_SOURCES } from "./sources/index.ts";
import { validateAgainstScb, validateBank, type Issue } from "./validate.ts";

const FILE = new URL("../../data/rates/se.json", import.meta.url);
const dryRun = process.argv.includes("--dry-run");
const today = new Date();
const todayStr = today.toISOString().slice(0, 10);

const data = JSON.parse(readFileSync(FILE, "utf8")) as RatesFile;
const before = JSON.stringify(data);
const issues: Issue[] = [];
const fetched = new Map<string, FetchedRates>();

for (const source of SE_SOURCES) {
  try {
    const rates = await source.fetch();
    const prev = data.banks.find((b) => b.name === source.bank);
    issues.push(...validateBank(source.bank, rates, prev, today));
    fetched.set(source.bank, rates);
  } catch (err) {
    // A broken scraper keeps yesterday's (correct, if older) values.
    issues.push({ bank: source.bank, level: "warn", message: `fetch failed: ${(err as Error).message}` });
  }
}

try {
  const scb = await fetchScbAverage3m();
  const snitt3m = [...fetched.values()].map((r) => r.snitt["3m"]).filter((v): v is number => typeof v === "number");
  issues.push(...validateAgainstScb(snitt3m, scb));
} catch (err) {
  issues.push({ bank: "SCB", level: "warn", message: `cross-check unavailable: ${(err as Error).message}` });
}

for (const [name, rates] of fetched) {
  const bank = data.banks.find((b) => b.name === name);
  if (!bank) {
    issues.push({ bank: name, level: "warn", message: "not present in se.json; skipped" });
    continue;
  }
  bank.list = rates.list;
  bank.snitt = rates.snitt;
  if (rates.snittPeriod) bank.snitt_period = rates.snittPeriod;
  bank.fetched = todayStr;
}

// Headline period = the most common snitt period among automated banks.
const periods = [...fetched.values()].map((r) => r.snittPeriod).filter(Boolean) as string[];
if (periods.length) {
  const counts = new Map<string, number>();
  for (const p of periods) counts.set(p, (counts.get(p) ?? 0) + 1);
  const top = [...counts].sort((a, b) => b[1] - a[1])[0]?.[0];
  if (top) data.snittranta_period = formatPeriodSv(top);
}

// Only bump `updated` when a rate actually changed; `fetched` stamps alone
// shouldn't produce a daily commit.
const strip = (d: RatesFile) =>
  JSON.stringify({ ...d, updated: "", banks: d.banks.map(({ fetched: _f, ...b }) => b) });
const ratesChanged = strip(JSON.parse(before)) !== strip(data);
if (ratesChanged) data.updated = todayStr;

const blocking = issues.filter((i) => i.level === "block");
const report = [
  `## Rates update ${todayStr}`,
  "",
  `Fetched ${fetched.size}/${SE_SOURCES.length} sources. Rates changed: **${ratesChanged ? "yes" : "no"}**.`,
  "",
  ...(issues.length ? ["| Bank | Level | Issue |", "|---|---|---|", ...issues.map((i) => `| ${i.bank} | ${i.level} | ${i.message} |`)] : ["All checks passed."]),
  "",
].join("\n");
console.log(report);

if (!dryRun && ratesChanged) writeFileSync(FILE, JSON.stringify(data, null, 2) + "\n");

if (process.env.GITHUB_OUTPUT) {
  appendFileSync(process.env.GITHUB_OUTPUT, `changed=${ratesChanged}\nreview=${blocking.length > 0}\n`);
}
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, report);
writeFileSync(new URL("../../rates-report.md", import.meta.url), report);

if (fetched.size === 0) process.exit(1);
