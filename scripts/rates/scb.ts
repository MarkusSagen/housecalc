import { USER_AGENT } from "./lib.ts";

// SCB/Riksbanken market-wide average rate on new household mortgages with
// ≤3 months fixation (open data, CC0). Used only as a sanity check.
const URL_ = "https://api.scb.se/OV0104/v1/doris/sv/ssd/FM/FM5001/FM5001C/RantaT04N";

export async function fetchScbAverage3m(): Promise<{ period: string; rate: number }> {
  const res = await fetch(URL_, {
    method: "POST",
    headers: { "content-type": "application/json", "user-agent": USER_AGENT },
    signal: AbortSignal.timeout(20_000),
    body: JSON.stringify({
      query: [
        { code: "Referenssektor", selection: { filter: "item", values: ["1"] } },
        { code: "Avtal", selection: { filter: "item", values: ["0100"] } },
        { code: "Rantebindningstid", selection: { filter: "item", values: ["1.1.1"] } },
        { code: "Tid", selection: { filter: "top", values: ["1"] } },
      ],
      response: { format: "json" },
    }),
  });
  if (!res.ok) throw new Error(`SCB → HTTP ${res.status}`);
  const json = (await res.json()) as { data: { key: string[]; values: string[] }[] };
  const row = json.data[0];
  if (!row?.key[4] || !row.values[0]) throw new Error("SCB: empty response");
  const [y, m] = row.key[4].split("M");
  return { period: `${y}-${m}`, rate: Number(row.values[0]) };
}
