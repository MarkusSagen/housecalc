# Housecalc

Swedish home-purchase calculator (bolånekalkylator). Live single-page UI that shows the true monthly
cost of a mortgage (with ränteavdrag), one-time costs (stämpelskatt, pantbrev,
lagfart), the impact of FI's amortization tiers, a rate-stress table, a
multi-price compare table, and a payoff timeline that auto-steps amortization
down across LTV tiers.

Output matches Booli/SBAB to the krona for typical Swedish purchases.

## Run

Requires Node 24+ (tests use Node's native TypeScript support).

    npm install
    npm run dev          # Vite dev server
    npm test             # core calc + rates pipeline tests
    npm run typecheck
    npm run build        # static site → apps/web/dist
    npm run rates        # fetch live bank rates into data/rates/se.json

All math runs client-side, and the page makes no network calls at runtime.
Rates are baked into the bundle at build time.

## Layout

- `packages/core/` holds the market-agnostic types (`src/market.ts`) and one
  folder per market. `src/markets/se/` has the Swedish rules.
- `apps/web/` is the Vite static site: `index.html` (markup, SEO head, FAQ),
  `src/main.js` (UI) and `src/affiliates.js` (loan-broker slot, hidden until
  its URLs are configured).
- `packages/listing/` reads a listing (price, avgift, drift, upplåtelseform,
  pantbrev) from a page's DOM. It has site adapters plus generic JSON-LD and
  label-text passes.
- `apps/extension/` is the Chrome + Firefox extension (WXT, MV3): click on a
  listing to see what it costs. See `apps/extension/README.md` for how to load
  it and for the QA checklist.
- `data/rates/se.json` is the source of truth for bank rates.
- `scripts/rates/` has the fetch → validate → write pipeline. There is one
  module per bank in `sources/`, plus the guardrails in `validate.ts`.
- `.github/workflows/`:
  - `ci.yml` runs on PRs.
  - `deploy.yml` deploys to GitHub Pages on pushes to main.
  - `rates.yml` updates the rates twice a day. It auto-commits when all checks
    pass and opens a PR when a guardrail trips.

See `docs/superpowers/specs/2026-09-29-productionize-design.md` for the
roadmap: live rate sources, SEO, affiliates, the browser extension and more
markets.

## Updating bank rates

Handelsbanken, SBAB, Swedbank and Nordea are fetched automatically. Other banks
are hand-maintained in `data/rates/se.json`: edit their `list`/`snitt` values
and bump `manual_updated`/`manual_period`. To automate a bank, add a
`RateSource` in `scripts/rates/sources/` and register it in `sources/index.ts`.

## Deploy setup (one-time)

1. Push to GitHub. Under Settings → Pages, set Source to "GitHub Actions".
2. Under Settings → Actions → General, enable "Allow GitHub Actions to create
   and approve pull requests". The rates review PRs need it.
3. Optional repository variables:
   - `SITE_URL`: the custom domain, e.g. `https://example.se`.
   - `AFF_LENDO` and `AFF_ZMARTA`: affiliate tracking URLs.

## Rules encoded in the UI

| Rule | Value | Source |
|------|-------|--------|
| LTV cap (bolånetak) | 90% — raised from 85% on 2026-04-01; UI defaults to 10% kontantinsats but does not enforce | Lag 2026:226 |
| Amortization tiers | LTV >70% = 2%, 50% < LTV ≤ 70% = 1%, LTV ≤50% = 0% | Lag 2026:226 |
| Lagfart | 1.5% of purchase price + 825 kr fixed fee | Lantmäteriet |
| Pantbrev | 2% of *new* pantbrev + 375 kr fixed fee | Lantmäteriet |
| Ränteavdrag | 30% on first 100 000 kr, 21% beyond | Skatteverket |

The *skärpta amorteringskravet* (+1% extra amortization for loans > 4.5× årsinkomst) was
abolished on 2026-04-01 under lag 2026:226 and is no longer modeled here.

## Design history

See `docs/superpowers/specs/2026-05-13-housecalc-design.md` for the original
buy-vs-wait spec. The shipped UI diverged (no wait-and-invest scenario, no
backend math) — this README is the source of truth for what actually runs.
