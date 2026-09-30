import * as cheerio from "cheerio";
import { fetchText, parsePeriod, setRate, type RateSource, type TenorRates } from "../lib.ts";

// Server-rendered table captioned "Aktuella bolåneräntor" with columns
// Bindningstid | Snittränta (<månad år>) | Listränta (ändrad …).
export const swedbank: RateSource = {
  bank: "Swedbank",
  url: "https://www.swedbank.se/privat/boende-och-bolan/bolanerantor.html",
  async fetch() {
    const $ = cheerio.load(await fetchText(this.url));
    const table = $("table").filter((_, t) => /aktuella bolåneräntor/i.test($(t).find("caption").text())).first();
    const headers = table.find("tr").first().find("th,td").map((_, c) => $(c).text().trim()).get();
    const snittCol = headers.findIndex((h) => /snittränta/i.test(h));
    const listCol = headers.findIndex((h) => /listränta/i.test(h));
    if (snittCol < 0 || listCol < 0) throw new Error(`unexpected headers: ${headers.join(" | ")}`);

    const list: TenorRates = {};
    const snitt: TenorRates = {};
    table.find("tr").slice(1).each((_, row) => {
      const cells = $(row).find("th,td").map((_, c) => $(c).text().trim()).get();
      setRate(snitt, cells[0], cells[snittCol]);
      setRate(list, cells[0], cells[listCol]);
    });
    return { list, snitt, snittPeriod: parsePeriod(headers[snittCol]) };
  },
};
