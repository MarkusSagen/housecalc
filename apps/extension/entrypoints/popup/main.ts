import { se, type BankRates, type RatesFile, type Tenure } from "@housecalc/core";
import type { Listing } from "@housecalc/listing";
import bundledRates from "../../../../data/rates/se.json";

const SITE_URL = (import.meta.env.WXT_SITE_URL ?? "https://markussagen.github.io/housecalc").replace(/\/$/, "");
const AFFILIATE_URL: string = import.meta.env.WXT_AFF_LENDO ?? "";

// Banks anyone can get a loan from at list/snitt terms. Private-banking and
// second-tier lenders would make "best rate" misleading for most buyers.
const MAINSTREAM = new Set(["storbank", "niche", "borgo"]);

interface Settings {
  kontantPct: number;
  /** null = use the best mainstream 3-month snitt. */
  customRate: number | null;
}
const DEFAULT_SETTINGS: Settings = { kontantPct: 15, customRate: null };

const kr = new Intl.NumberFormat("sv-SE", { maximumFractionDigits: 0 });
const pct = new Intl.NumberFormat("sv-SE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const $ = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector(sel) as T;
const app = $("#app");

// ---------------------------------------------------------------- data

async function readListing(): Promise<{ listing: Listing | null; reason?: string }> {
  // ?tabId= is only used by the end-to-end test, which can't click the toolbar
  // button; real use always reads the active tab.
  const forced = Number(new URLSearchParams(location.search).get("tabId"));
  const [tab] = forced ? [await browser.tabs.get(forced)] : await browser.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !tab.url || !/^https?:/.test(tab.url)) {
    return { listing: null, reason: "Öppna en bostadsannons och klicka igen." };
  }
  try {
    const [res] = await browser.scripting.executeScript({ target: { tabId: tab.id }, files: ["/extract.js"] });
    return { listing: (res?.result as Listing | undefined) ?? null };
  } catch {
    // Browser-internal pages, extension stores, PDF viewers…
    return { listing: null, reason: "Den här sidan går inte att läsa. Öppna en bostadsannons och klicka igen." };
  }
}

/** Bundled rates, replaced by the site's copy when that is newer (cached). */
async function loadRates(): Promise<RatesFile> {
  const bundled = bundledRates as RatesFile;
  const { ratesCache } = (await browser.storage.local.get("ratesCache")) as { ratesCache?: RatesFile };
  let best = ratesCache && ratesCache.updated > bundled.updated ? ratesCache : bundled;
  try {
    const res = await fetch(`${SITE_URL}/rates/se.json`, { signal: AbortSignal.timeout(2000), cache: "no-cache" });
    if (res.ok) {
      const fresh = (await res.json()) as RatesFile;
      if (Array.isArray(fresh.banks) && fresh.updated >= best.updated) {
        best = fresh;
        await browser.storage.local.set({ ratesCache: fresh });
      }
    }
  } catch {
    // Offline or site down: bundled/cached rates are fine.
  }
  return best;
}

async function loadSettings(): Promise<Settings> {
  const { settings } = (await browser.storage.sync.get("settings")) as { settings?: Partial<Settings> };
  return { ...DEFAULT_SETTINGS, ...settings };
}

const saveSettings = (s: Settings) => browser.storage.sync.set({ settings: s });

const monthShort = (period: string) => {
  const [y = 0, m = 1] = period.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("sv-SE", { month: "short", timeZone: "UTC" }).replace(".", "");
};

/** Each bank's own snitt month: automated banks carry it, hand-maintained ones inherit manual_period. */
const periodOf = (b: BankRates, rates: RatesFile) =>
  b.snitt_period ? monthShort(b.snitt_period) : (rates.manual_period ?? "").replace(/ \d{4}$/, "");

function bestBanks(rates: RatesFile, n = 3): { name: string; rate: number; period: string }[] {
  return rates.banks
    .filter((b: BankRates) => MAINSTREAM.has(b.type ?? "") && typeof b.snitt?.["3m"] === "number")
    .map((b) => ({ name: b.name, rate: b.snitt?.["3m"] as number, period: periodOf(b, rates) }))
    .sort((a, b) => a.rate - b.rate)
    .slice(0, n);
}

// ---------------------------------------------------------------- view
//
// Built with DOM APIs only: address/type strings come from a third-party page
// and must never be able to inject markup into the (privileged) popup.

type Child = Node | string | null | false | undefined;
function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | boolean | undefined> = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === false || v === undefined) continue;
    if (k === "class") el.className = String(v);
    else el.setAttribute(k, v === true ? "" : v);
  }
  for (const c of children) if (c) el.append(c);
  return el;
}

const present = (...items: Child[]) => items.filter((c): c is Node | string => !!c);

const SOURCE_LABEL: Record<string, string> = { structured: "annons", jsonld: "annons", text: "sidtext" };
const sourceTag = (f?: { source: string }) =>
  f
    ? h("span", { class: "src", title: "Hämtat från sidan" }, SOURCE_LABEL[f.source] ?? "sida")
    : h("span", { class: "src src--none" }, "fyll i");

function field(label: string, id: string, value: number | undefined, unit: string, src: Child, placeholder = "0") {
  return h(
    "label",
    { id: `${id}-row` },
    label,
    h(
      "span",
      { class: "row" },
      h("input", { id, inputmode: "numeric", value: value ? kr.format(value) : "", placeholder }),
      ` ${unit} `,
      src,
    ),
  );
}

function render(listing: Listing | null, reason: string | undefined, rates: RatesFile, settings: Settings) {
  const top = bestBanks(rates);
  const bestRate = top[0]?.rate ?? 3;
  const l: Listing = listing ?? { url: "", site: "generic" };
  const found = !!(l.price || l.monthlyFee);

  const title = [l.address?.value, l.municipality?.value].filter(Boolean).join(", ");
  const initialTenure: Tenure = l.tenure?.value ?? (l.monthlyFee ? "bostadsratt" : "aganderatt");
  const tenureOpt = (value: Tenure, text: string) => h("option", { value, selected: initialTenure === value }, text);

  app.replaceChildren(...present(
    h(
      "header",
      {},
      h("strong", {}, "Housecalc"),
      h(
        "span",
        { class: "muted" },
        (title || (found ? "Bostadsannons" : "")) + (l.propertyType ? ` · ${l.propertyType.value}` : ""),
      ),
    ),
    !found && h("p", { class: "notice" }, reason ?? "Vi hittade ingen annons på sidan. Fyll i uppgifterna själv."),
    h(
      "form",
      { id: "f", autocomplete: "off" },
      field("Pris", "price", l.price?.value, "kr", sourceTag(l.price), "3 500 000"),
      h(
        "div",
        { class: "chips", id: "bid", role: "group", "aria-label": "Budmarginal" },
        ...[0, 5, 10, 15].map((p) =>
          h(
            "button",
            { type: "button", "data-bid": String(p), class: p === 0 ? "on" : undefined },
            p === 0 ? "Utgångspris" : `+${p} %`,
          ),
        ),
      ),
      field("Avgift", "fee", l.monthlyFee?.value, "kr/mån", sourceTag(l.monthlyFee)),
      field("Drift", "drift", l.operatingCostMonthly?.value, "kr/mån", sourceTag(l.operatingCostMonthly)),
      h(
        "label",
        {},
        "Upplåtelseform",
        h(
          "span",
          { class: "row" },
          h(
            "select",
            { id: "tenure" },
            tenureOpt("bostadsratt", "Bostadsrätt"),
            tenureOpt("aganderatt", "Äganderätt"),
            tenureOpt("tomtratt", "Tomträtt"),
          ),
          " ",
          sourceTag(l.tenure),
        ),
      ),
      field("Befintliga pantbrev", "pantbrev", l.pantbrev?.value, "kr", sourceTag(l.pantbrev)),
      h(
        "div",
        { class: "two" },
        h(
          "label",
          {},
          "Kontantinsats",
          h(
            "span",
            { class: "row" },
            h("input", { id: "kontant", type: "number", min: "10", max: "100", step: "1", value: String(settings.kontantPct) }),
            " %",
          ),
        ),
        h(
          "label",
          {},
          "Ränta",
          h(
            "span",
            { class: "row" },
            h("input", {
              id: "rate",
              type: "number",
              min: "0",
              max: "15",
              step: "0.01",
              value: (settings.customRate ?? bestRate).toFixed(2),
            }),
            " %",
          ),
        ),
      ),
      h("p", { class: "hint", id: "rate-hint" }),
    ),
    h(
      "section",
      { class: "result", "aria-live": "polite" },
      h("div", { class: "big", id: "monthly" }, "—"),
      h("div", { class: "muted", id: "after" }),
      h("dl", { id: "breakdown" }),
    ),
    h(
      "p",
      { class: "banks" },
      "Lägst snittränta 3 mån: " + top.map((b) => `${b.name} ${pct.format(b.rate)} % (${b.period})`).join(" · "),
    ),
    h("a", { id: "open", class: "primary", target: "_blank", rel: "noopener" }, "Öppna full kalkyl →"),
    AFFILIATE_URL &&
      h(
        "a",
        { class: "aff", href: AFFILIATE_URL, target: "_blank", rel: "sponsored noopener" },
        "Jämför bolån hos Lendo → ",
        h("span", { class: "ad" }, "Annonslänk"),
      ),
    h("footer", { class: "muted" }, `Räntor uppdaterade ${rates.updated}. Allt räknas i din webbläsare; inget skickas.`),
  ));

  let bidPct = 0;
  const input = (id: string) => $<HTMLInputElement>(`#${id}`);
  const num = (id: string) => Number(input(id).value.replace(/\D/g, "")) || 0;
  const dec = (id: string) => Number(input(id).value.replace(",", ".")) || 0;

  const recompute = () => {
    const listPrice = num("price");
    // Utgångspris as listed; a bid margin rounds to the nearest 10 000 kr like real bids.
    const price = bidPct ? Math.round((listPrice * (1 + bidPct / 100)) / 10_000) * 10_000 : listPrice;
    const tenure = $<HTMLSelectElement>("#tenure").value as Tenure;
    const kontantPct = Math.min(100, Math.max(10, dec("kontant") || 15));
    const rate = dec("rate");
    const fee = num("fee") + num("drift");
    const existingPantbrev = num("pantbrev");
    $("#pantbrev-row").hidden = tenure === "bostadsratt";

    const loan = price * (1 - kontantPct / 100);
    const amort = se.recommendedAmortPct(price > 0 ? (loan / price) * 100 : 0);
    const r = se.computeForPrice(price, { hpPct: kontantPct, existingPantbrev, rate, amort, monthlyFee: fee, tenure });

    $("#rate-hint").textContent =
      top[0] && Math.abs(rate - bestRate) < 0.005 ? `Lägsta snittränta: ${top[0].name}` : "Egen ränta";
    if (price <= 0) {
      $("#monthly").textContent = "Fyll i pris";
      $("#after").textContent = "";
      $("#breakdown").replaceChildren();
    } else {
      $("#monthly").textContent = `${kr.format(r.monthlyTotal)} kr/mån`;
      $("#after").textContent = `Efter ränteavdrag: ${kr.format(r.monthlyAfterTax)} kr/mån`;
      const rows: [string, number, string][] = [
        [`Ränta ${pct.format(rate)} %`, r.monthlyInterest, "kr/mån"],
        [`Amortering ${amort} %`, r.monthlyAmort, "kr/mån"],
        ["Avgift + drift", r.monthlyFee, "kr/mån"],
        [`Kontantinsats ${kontantPct} %`, r.hpTotal, "kr"],
        ...(tenure === "bostadsratt"
          ? []
          : ([
              ["Lagfart", r.lagfart, "kr"],
              ["Nya pantbrev", r.pantbrev, "kr"],
            ] as [string, number, string][])),
        ["Kontanter totalt", r.onetimeTotal, "kr"],
        ["Bolån", r.loan, "kr"],
      ];
      $("#breakdown").replaceChildren(
        ...rows.flatMap(([k, v, u]) => [h("dt", {}, k), h("dd", {}, `${kr.format(v)} ${u}`)]),
      );
    }

    const q = new URLSearchParams({
      pris: String(price),
      avgift: String(fee),
      kontant: String(kontantPct),
      ranta: String(rate),
      upplatelse: tenure,
    });
    if (tenure !== "bostadsratt" && existingPantbrev) q.set("pantbrev", String(existingPantbrev));
    $<HTMLAnchorElement>("#open").href = `${SITE_URL}/?${q}`;
  };

  // Keep thousands grouping readable while typing.
  for (const id of ["price", "fee", "drift", "pantbrev"]) {
    const el = input(id);
    el.addEventListener("input", () => {
      const n = num(id);
      el.value = n ? kr.format(n) : "";
      recompute();
    });
  }
  $("#tenure").addEventListener("change", recompute);
  input("kontant").addEventListener("input", () => {
    settings.kontantPct = dec("kontant");
    void saveSettings(settings);
    recompute();
  });
  input("rate").addEventListener("input", () => {
    const v = dec("rate");
    settings.customRate = Math.abs(v - bestRate) < 0.005 ? null : v;
    void saveSettings(settings);
    recompute();
  });
  $("#bid").addEventListener("click", (e) => {
    const btn = (e.target as HTMLElement).closest("button");
    if (!btn) return;
    bidPct = Number(btn.dataset.bid);
    $("#bid").querySelectorAll("button").forEach((b) => b.classList.toggle("on", b === btn));
    recompute();
  });
  recompute();
  if (!found) input("price").focus();
}

// ---------------------------------------------------------------- boot

const [{ listing, reason }, rates, settings] = await Promise.all([readListing(), loadRates(), loadSettings()]);
render(listing, reason, rates, settings);
