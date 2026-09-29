import * as cheerio from "cheerio";
import { fetchText, parsePeriod, setRate, type RateSource, type TenorRates } from "../lib.ts";

// Two server-rendered tables, told apart by caption: "Våra genomsnittliga
// bolåneräntor" (header "SNITTRÄNTA 202608") and "Aktuella bolåneräntor".
export const nordea: RateSource = {
  bank: "Nordea",
  url: "https://www.nordea.se/privat/produkter/bolan/bolanerantor.html",
  async fetch() {
    const $ = cheerio.load(await fetchText(this.url));
    const byCaption = (re: RegExp) => $("table").filter((_, t) => re.test($(t).find("caption").text())).first();

    const read = (table: ReturnType<typeof byCaption>): TenorRates => {
      const out: TenorRates = {};
      table.find("tr").slice(1).each((_, row) => {
        const cells = $(row).find("th,td").map((_, c) => $(c).text().trim()).get();
        setRate(out, cells[0], cells[1]);
      });
      return out;
    };

    const avgTable = byCaption(/genomsnittliga bolåneräntor/i);
    const listTable = byCaption(/aktuella bolåneräntor/i);
    if (!avgTable.length || !listTable.length) throw new Error("rate tables not found");
    return {
      list: read(listTable),
      snitt: read(avgTable),
      snittPeriod: parsePeriod(avgTable.find("tr").first().text()),
    };
  },
};
