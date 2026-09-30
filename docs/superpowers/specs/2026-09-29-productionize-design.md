# Productionize: multi-market core, live rates, SEO, affiliates, browser extension

Status: phase 1 shipped on `feature/productionize`; phases 2–4 planned.

## Goals

1. A public, fast, indexable Swedish mortgage calculator ("bolånekalkylator").
2. Bank rates that stay correct without hand edits.
3. Revenue from loan-broker affiliates (Lendo, Zmarta) without compromising trust.
4. A Chrome + Firefox extension that shows the true monthly cost directly on
   Hemnet, Booli and broker listing pages.
5. An architecture where adding a country is one folder, not a fork.

## Architecture

```
packages/core/            market-agnostic types + one folder per market
  src/market.ts           Market, PurchaseParams/Result, RatesFile types
  src/markets/se/         Swedish rules (lagfart, pantbrev, ränteavdrag, amorteringskrav)
apps/web/                 Vite static site (GitHub Pages)
apps/extension/           (phase 3) WXT, MV3, Chrome + Firefox from one codebase
data/rates/se.json        rates source of truth; imported at build time
scripts/rates/            fetch → validate → write; run by cron
.github/workflows/        ci.yml, deploy.yml, rates.yml
```

- **No runtime network calls.** Rates are baked into the bundle at build time.
  The site and extension work offline and never leak what the user looks at.
- **Tests run on Node's built-in runner** with native TypeScript type stripping
  (Node ≥ 24). No test framework dependency.
- **Adding a market:** create `packages/core/src/markets/<id>/` implementing
  `Market`, a `data/rates/<id>.json`, sources in `scripts/rates/sources/<id>/`,
  and register it in `markets`. The web UI is still Swedish-only (copy is
  inline in `index.html`); phase 4 extracts copy into per-market message files
  and moves SE-specific inputs (pantbrev) behind `Market` capabilities.

## Rates pipeline (phase 1: shipped)

`rates.yml` runs at 05:15 and 13:15 UTC.

| Bank | Source | Method |
|---|---|---|
| Handelsbanken | open JSON API (`/mortgagerates/interestrates`, `/averagerates`) | JSON |
| SBAB | open JSON APIs (list + 12-month average history) | JSON |
| Swedbank | `table` captioned "Aktuella bolåneräntor" | HTML (cheerio) |
| Nordea | tables captioned "Våra genomsnittliga…" / "Aktuella…" | HTML (cheerio) |

The other 16 banks keep hand-maintained values. The UI tags each row with its
snitt month, and marks hand-maintained rows "manuell".

Guardrails (`scripts/rates/validate.ts`):

- **block** (→ PR instead of push): empty parse, value outside 0.5–12 %,
  a single tenor moving > 1.0 pp, or the mean fetched 3m snitt more than
  0.4 pp from SCB's market-wide average (open CC0 API, Riksbanken data).
- **warn** (published, reported in the job summary): fetch failure (the old
  value is kept), snitt period missing or > 62 days old.
- `updated` only changes when a rate changes, so there's no daily no-op commit.
- The job goes red only when *every* source fails. GitHub emails on failure.

Next sources, in order of effort:
1. Länsförsäkringar, Danske Bank (Crawl-delay 5), Skandia: HTML parsers.
2. SEB: its public JSON API requires spoofing a Referer. **Don't do that**;
   render seb.se with Playwright instead.
3. Avanza, ICA Banken (bot protection), Nordnet: Playwright.
4. Finansportalen (Compricer) aggregates 13 lenders, but its terms forbid
   copying the database. Use it only as a cross-check unless we get written
   permission.

Every source must: send the honest `HousecalcRatesBot` UA, fetch once per run,
cite the bank's page in the UI, and have a parser test against a saved fixture
(todo: add fixtures under `scripts/rates/fixtures/`).

## SEO (phase 1: shipped, phase 2: content)

Shipped:
- Keyword title/description/H1 ("Bolånekalkylator"), canonical, Open Graph,
  `WebApplication` JSON-LD.
- A visible FAQ section. The build generates `FAQPage` JSON-LD from that
  markup, so the two can't drift.
- `robots.txt` + `sitemap.xml` (lastmod = rates `updated`) emitted at build.
- ExcelJS (~940 kB) lazy-loaded on export click. The initial JS is ~85 kB gzip.
- Shareable scenario URLs: `?pris=&avgift=&kontant=&ranta=&pantbrev=`.

Phase 2:
- Custom `.se` domain (set repo variable `SITE_URL`, add `CNAME`). This is the
  single biggest SEO lever; the `github.io` URL is placeholder-only.
- Landing pages per high-intent query, each a prefilled calculator plus 300–600
  words of unique copy: "bolåneräntor idag" (the live rates table), "kontantinsats
  räkna", "lagfart kostnad", "amorteringskrav 2026", "vad kostar ett bolån på
  3 miljoner" (price-level pages). Vite multi-page build.
- Search Console + Bing Webmaster; submit the sitemap.
- Pre-render the rates table into static HTML (today it's JS-rendered).
- A trimmed Chart.js registration (~245 kB → ~100 kB).

## Affiliates (phase 2)

A slot is shipped and hidden by default: `apps/web/src/affiliates.js` reads
`VITE_AFF_LENDO` / `VITE_AFF_ZMARTA` (repo variables `AFF_LENDO`, `AFF_ZMARTA`).
The card appears as soon as one URL is set.

Rules we follow:
- Every link is labelled **"Annonslänkar"** and has an in-card disclosure
  (marknadsföringslagen). Links use `rel="sponsored"`.
- Links open only on click. No cookie stuffing, no link rewriting.
- Konsumentkreditlagen: if copy ever mentions a rate or cost of credit, it must
  include a representative example. Keep affiliate copy rate-free.
- Sign up via the networks that run these programs (Adtraction/Awin). Approval
  usually needs a live site with real content, so ship the domain + content first.

## Browser extension (phase 3)

**Stack:** WXT (MV3, one codebase → Chrome + Firefox zips), importing
`@housecalc/core` and `data/rates/se.json` directly.

**Behaviour:** on a listing page, inject a compact panel (Shadow DOM, clearly
branded "Housecalc") showing monthly cost after ränteavdrag, kontantinsats,
lagfart/pantbrev, and the cheapest bank snitt. "Öppna full kalkyl" deep-links
to the site with `?pris=&avgift=…`. Settings in the popup: kontantinsats %,
rate, hide on site X.

**Data extraction.** Each site gets a pure `parse(document) → Listing | null`
tested against saved HTML fixtures. The label-text fallback (Utgångspris,
Avgift, Driftkostnad, Boarea) runs everywhere.

| Site | Matches | Source | SPA |
|---|---|---|---|
| hemnet.se | `/bostad/*` | `__NEXT_DATA__` Apollo `ActivePropertyListing:<id>` | yes |
| booli.se | `/annons/*` | `self.__next_f` Listing object; DOM labels | yes |
| maklarhuset.se | `/bostad/sverige/*` | JSON-LD `@graph` + DOM | no |
| svenskfast.se | `/{bostadsratt,hus,…}/*/<id>/` | `li.info--icon` + JSON-LD | no |
| fastighetsbyran.com | `/sv/sverige/till-salu/*/objekt/*` | base64 `__PRELOADED_STATE__` | yes |
| erikolsson.se | `/homes/*` | Vitec object in `self.__next_f` | yes |
| bjurfors.se | `/sv/tillsalu/*` | JSON-LD `RealEstateListing` + `dl.c-details` | no |
| notar.se | `/kopa-bostad/objekt/*` | `__NUXT_DATA__` | yes |
| lansfast.se | `/till-salu/…` | JSON-LD + client DOM | partly |

Gotchas:
- On SPA sites, register the content script for the whole host, detect listing
  URLs in code, and watch `pushState`/`popstate`. Embedded JSON goes stale after
  client navigation, so fall back to DOM/JSON-LD there.
- Driftkostnad is per year on Hemnet, Mäklarhuset and Svensk Fast, and per month
  on Booli and Erik Olsson. Parse the unit.
- Lagfart and pantbrev don't apply to bostadsrätt. The core needs a
  `propertyType` param (a phase 3 prerequisite, and a fix for the web UI too).

**Policy constraints** (both stores):
- Read only the page the user has open. No background fetches, no prefetching
  of other listings, nothing sent to any server. This keeps us clear of
  Hemnet's and Fastighetsbyrån's anti-scraping terms, which forbid crawling.
- No site names or logos in the extension name or icon (trademark). Say
  "works on major Swedish listing sites".
- Chrome affiliate policy: disclose it on the store page, in the UI and before
  install; links only after a user action. AMO forbids adding affiliate tags to
  web content, so affiliate links may appear **only** inside our own
  panel/popup and must be labelled.
- Narrow `host_permissions` to the listed sites. No remote code. Submit source
  + build instructions to AMO. Publish a privacy policy page on the site.

**Release:** a `release-extension.yml` on tag `ext-v*` that builds zips,
uploads them to the Chrome Web Store (API) and AMO (`web-ext sign`), with
secrets for store credentials. Rates are bundled, so each rates change needs
a release. Instead: a weekly scheduled extension release if `se.json` changed.
The alternative, fetching the rates JSON from the site at runtime, is simpler
for freshness but is remote data. That's allowed (it isn't code), but it must
be disclosed. Decide at phase 3.

## Phases

1. **Foundation (done):** monorepo, core + SE market, Vite site, rates cron
   (4 banks) with guardrails, SEO basics, affiliate slot, CI/deploy.
2. **Go live:** create the GitHub repo + Pages, buy the domain, Search Console,
   affiliate sign-ups, landing pages, pre-rendered rates table, 3 more HTML
   rate sources + fixtures.
3. **Extension:** `propertyType` in core, WXT app, Hemnet + Booli + Mäklarhuset
   parsers first, store listings, release workflow.
4. **Markets:** extract UI copy/i18n, generalise one-time costs into
   market-defined line items, and add the second market (Norway or Denmark:
   similar listing sites (Finn.no, Boligsiden) and mortgage structure).
