# Browser extension: click-to-calculate on listing pages

Goal: you're on a listing on Hemnet, Booli, Mäklarhuset or another Swedish
real-estate site. You click the Housecalc toolbar button, and a popup shows what
that home really costs per month and how much cash you need, based on the data
on the page you have open. Every value can be edited, and one click opens the
full calculator.

Status: M0–M2 done (see `apps/extension/README.md`). Correction made during
M0: one-time costs depend on **upplåtelseform** (tenure), not on building
type, so the core takes `tenure` and the deep-link parameter is
`upplatelse=`, not `typ=`.

Builds on `docs/superpowers/specs/2026-09-29-productionize-design.md`
(the site research and policy constraints are listed there).

## 1. How the click gets the data

```
 toolbar click
      │
      ▼
 popup.html opens ──► chrome.scripting.executeScript({ target: activeTab, files: ["extract.js"] })
      │                          │
      │                          ▼  runs once, inside the listing page (isolated world)
      │                 extract.js: pick the site adapter by hostname → Listing | null
      │                          │
      ◄──────────── result (plain JSON) ◄─┘
      │
      ▼
 popup: prefill fields → @housecalc/core computes → render
```

**Why `activeTab` + `executeScript` instead of always-on content scripts:**

- **Permissions:** the extension gets access to a tab only when you click the
  button. There are no `host_permissions`, so there is no install warning like
  "read and change your data on hemnet.se" and store review is easier.
- **Site terms:** nothing runs in the background and nothing is collected
  passively. We read the one page you asked about, on your behalf. This is the
  cleanest position given Hemnet's and Fastighetsbyrån's anti-scraping terms.
- **Every site from day one:** the generic extractors (JSON-LD and Swedish
  label text) run on *any* page. A broker site we haven't written an adapter
  for still works fairly well, and the extension needs no match-pattern list.
- **SPA staleness is handled per click:** each click extracts fresh from the
  current DOM, so client-side navigation on Hemnet or Booli doesn't matter as
  much (see §3).

The cost: no inline panel on the page. That becomes an opt-in phase later,
using `optional_host_permissions` (§8).

## 2. What we extract

```ts
// packages/listing/src/types.ts
export type PropertyType = "bostadsratt" | "villa" | "radhus" | "fritidshus" | "tomt" | "annat";

export interface Listing {
  url: string;
  site: string;                   // "hemnet" | "booli" | … | "generic"
  price: Field<number>;           // utgångspris; null when "Pris ej angivet"/bidding
  monthlyFee: Field<number>;      // avgift, kr/mån (BRF)
  operatingCostMonthly: Field<number>; // driftkostnad normalised to kr/mån
  propertyType: Field<PropertyType>;
  tenure: Field<"bostadsratt" | "aganderatt" | "tomtratt">;
  livingArea: Field<number>;      // m²
  pantbrev: Field<number>;        // existing pantbrev, when the listing states it
  address: Field<string>;
  municipality: Field<string>;
}

// The source is shown in the popup as a small tag so the user knows what to trust.
export interface Field<T> {
  value: T | null;
  source: "structured" | "jsonld" | "text" | "none";
}
```

Adapter contract. Adapters are pure, take a `Document`, and are tested
offline:

```ts
export interface SiteAdapter {
  id: string;
  hosts: RegExp;                  // /(^|\.)hemnet\.se$/
  isListing(url: URL): boolean;
  extract(doc: Document, url: URL): Partial<Listing>;
}
```

`extract.js` runs three passes and merges them field by field, with the first
non-null value winning:
1. **The site adapter,** which reads structured data: Hemnet
   `__NEXT_DATA__` Apollo, Booli `__next_f`, Fastighetsbyrån base64
   `__PRELOADED_STATE__`, Notar `__NUXT_DATA__`, Erik Olsson Vitec.
2. **Generic JSON-LD:** `Offer.price`, `floorSize`, `@type`
   (`Apartment`/`House`/`RealEstateListing`) and `address`.
3. **Generic label text:** walk `dt/dd`, `th/td`, `li > span` pairs and
   "Label value" text nodes, matching on Utgångspris, Pris, Avgift,
   Månadsavgift, Driftkostnad, Boarea, Upplåtelseform, Bostadstyp, Typ and
   Pantbrev. Units come from the text: `kr/mån`, `kr/år`, `kr per månad`.

The rules for normalising values live in one place (`normalize.ts`), not in
each adapter:
- Driftkostnad per year is divided by 12. Hemnet, Mäklarhuset and Svensk Fast
  publish it per year; Booli and Erik Olsson publish it per month.
- Prices like "Pris ej angivet", "Budstart", or `0` during bidding become a
  null price, so the popup asks for one.
- Type maps: "Bostadsrättslägenhet"/`Apartment`/`APARTMENT` → `bostadsratt`,
  `DetachedHouse`/"Villa"/"Enfamiljshus" → `villa`, and so on.

## 3. Site adapters: order and specifics

| # | Site | Structured source | SPA staleness plan |
|---|---|---|---|
| 1 | hemnet.se `/bostad/*` | `__NEXT_DATA__` → `props.pageProps.__APOLLO_STATE__["ActivePropertyListing:<id>"]` | Check that the Apollo listing id matches the id in the URL; if not, skip to JSON-LD/text |
| 2 | booli.se `/annons/*` | `self.__next_f.push` payloads → `__typename:"Listing"` | App router streams fresh data per navigation; if the id doesn't match, fall back to text |
| 3 | maklarhuset.se `/bostad/sverige/*` | JSON-LD `@graph` + `h6` label pairs | Not an SPA |
| 4 | svenskfast.se | `li.info--icon` pairs + JSON-LD | Not an SPA |
| 5 | fastighetsbyran.com `…/objekt/*` | `JSON.parse(utf8(atob(__PRELOADED_STATE__)))` → `maeklarObjekt.objektInfo[id]` (includes `pantbrevTotalt`) | Match on `objektID` |
| 6 | erikolsson.se `/homes/*` | Vitec object in `__next_f` | Same as Booli |
| 7 | bjurfors.se, notar.se, lansfast.se | JSON-LD / `__NUXT_DATA__` / DOM | – |

**Stale-data guard:** every structured extractor must match the listing id
in the URL, or it returns nothing. Showing the *previous* listing's price is
the worst possible bug.

If a later need arises, there's a fallback for stale SPAs: re-fetch
`location.href` from inside the page (one same-origin request made by the
user's click, the same as pressing reload). Don't build it unless the
id-guard plus text fallback proves insufficient.

## 4. Popup

```
┌ Housecalc ──────────────────────────────┐
│ Storgatan 12, Stockholm · Bostadsrätt    │
│ Pris     [3 195 000] kr  (annons) +5 +10 +15 %  ← budmarginal chips
│ Avgift   [4 788] kr/mån  (annons)        │
│ Drift    [  350] kr/mån  (text)          │
│ Kontant  [15 %] ▾   Ränta [2,72 %] ▾ bästa snitt: Swedbank
├──────────────────────────────────────────┤
│  18 412 kr/mån   efter ränteavdrag 16 890 │
│  Kontanter 479 250 kr (ingen lagfart: BRF)│
│  Billigast: Swedbank 2,70 · SBAB 2,75 …   │
├──────────────────────────────────────────┤
│ [Öppna full kalkyl →]                     │
│ Jämför bolån hos Lendo → (Annonslänk)      │
└──────────────────────────────────────────┘
```

- **Page not recognised:** if no price is found, show "Vi hittade ingen annons
  på sidan", keep the fields editable, and link to the site.
- **Settings:** kontantinsats %, default rate strategy (best snitt, a specific
  bank, or custom) and income. Stored in `storage.sync`, so a setting follows
  the user across listings.
- **"Öppna full kalkyl"** opens
  `SITE/?pris=&avgift=&kontant=&ranta=&typ=&pantbrev=`.
- **Stack:** vanilla TS + CSS, and the same `@housecalc/core` calc as the site,
  so the numbers match the web app to the krona. No framework: the popup
  is about 150 lines of UI.

## 5. Core changes needed first (they also fix the web UI)

1. Add `propertyType` to `PurchaseParams`. A bostadsrätt has **no lagfart and no
   pantbrev**. Today both the web UI and the core always charge them. Add a
   test for each type.
2. Add a `typ=br|villa|radhus|fritidshus` URL param and a property-type toggle
   in the web UI.
3. Publish `rates/se.json` as a static file in the site build, so the
   extension can refresh rates (§6).

## 6. Rate freshness in the extension

Bundle `data/rates/se.json` at build time, so the extension works offline.
When the popup opens, also fetch `SITE/rates/se.json` (a 2-second timeout; the
result is cached in `storage.local`) and use it if it's newer.
- This is *data*, not code, so both stores allow it.
- The only host permission needed is our own domain.
- It avoids shipping an extension release for every rates change.
- The store listing and privacy policy must disclose it.

## 7. Repo layout and tooling

```
packages/listing/                 NEW: pure extractors, no extension APIs
  src/{types,normalize,generic-jsonld,generic-text,index}.ts
  src/sites/{hemnet,booli,maklarhuset,svenskfast,fastighetsbyran,…}.ts
  test/*.test.ts                  node --test + linkedom (a DOM in Node)
  test/fixtures/<site>-<case>.html
apps/extension/                   NEW: WXT (MV3 → Chrome + Firefox zips)
  wxt.config.ts                   permissions: ["activeTab","scripting","storage"]
  entrypoints/popup/{index.html,main.ts,style.css}
  entrypoints/extract.ts          unlisted script: bundles packages/listing; returns Listing
  public/icon/*.png
```

- **Fixtures.** Save each listing page from a normal browser session, then
  trim it with a `scripts/fixtures/trim.ts`. The script keeps only the
  embedded JSON blobs and label/value DOM, and removes images, broker names
  and descriptions. The repo is public, so we must not republish full listing
  pages. Each site needs at least three fixtures: a BRF, a villa, and
  "Pris ej angivet" or bidding.
- **Live testing.** No automated crawling of Hemnet, Booli or
  Fastighetsbyrån, because their terms forbid it. Instead, keep a manual QA
  checklist in `apps/extension/QA.md`: open 3 listings per site in a real
  browser, click, and compare the values. A scheduled Playwright canary is
  acceptable only for the permissive broker sites.
- **Manifest details.**
  - Firefox needs `browser_specific_settings.gecko.id`. New AMO submissions
    must also declare `data_collection_permissions` as `none`.
  - `scripting.executeScript` returns the result from the last expression,
    so `extract.ts` ends with an expression that produces the `Listing`.

## 8. Milestones

| M | Deliverable | Done when |
|---|---|---|
| 0 | Core `propertyType` + web toggle + `typ=` param + `rates/se.json` published | Tests for BRF vs villa one-time costs pass |
| 1 | `packages/listing`: normalize, generic JSON-LD + text, Hemnet, Booli, Mäklarhuset + fixtures | Every fixture extracts price/fee/type correctly |
| 2 | `apps/extension` popup, loadable unpacked in Chrome and in Firefox via `about:debugging` | Clicking on a real Hemnet/Booli/Mäklarhuset listing matches the page, and the numbers match the web app |
| 3 | Svensk Fast, Fastighetsbyrån, Erik Olsson, Bjurfors, Notar, Länsfast adapters | Fixtures + QA checklist pass |
| 4 | Store release: icons, Swedish listing copy, privacy page on the site, `release-extension.yml` (tag `ext-v*` → Chrome Web Store API + `web-ext sign`) | Published on both stores |
| 5 | (optional) Opt-in inline panel on listing pages via `optional_host_permissions` + content scripts with SPA URL watching | – |

M0–M2 is the "usable in my own browser" slice and roughly a day of work.
M4 depends on store review times: Chrome takes from hours to a few days, and
AMO is usually faster for small add-ons.

## 9. What the user must do (can't be automated)

- Create a Chrome Web Store developer account ($5 one-time) and an AMO account.
  Add their API credentials as repo secrets for M4.
- Pick the extension name. It must not contain the words "Hemnet" or "Booli"
  (trademarks). Example: "Housecalc – bolånekalkyl för bostadsannonser".
- Decide whether affiliate links go in the popup. If they do, disclose them on
  the store page and in the popup (Chrome's affiliate policy), and keep them
  inside our own UI only (AMO policy).
