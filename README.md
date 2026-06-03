# Housecalc

Swedish home-purchase calculator. Live single-page UI that shows the true monthly
cost of a mortgage (with ränteavdrag), one-time costs (stämpelskatt, pantbrev,
lagfart), the impact of FI's amortization tiers, a rate-stress table, a
multi-price compare table, and a payoff timeline that auto-steps amortization
down across LTV tiers.

Output matches Booli/SBAB to the krona for typical Swedish purchases.

## Run

Single self-contained `index.html` — no build step, no dependencies, no
network calls at runtime. Just open it:

    open index.html               # double-click works too (file:// is fine)

Or serve it over HTTP if you prefer:

    just dev                      # npx serve . -l 3000
    # or
    npx serve .

All math runs client-side.

## Layout

- `index.html` — everything: markup, inlined styles, inlined bank-rates JSON
  (`<script type="application/json" id="rates-data">`), vendored Chart.js,
  and the inlined calc + app module (calc code is wrapped in
  `/* CALC-START */ … /* CALC-END */` markers so tests can extract it).
- `test/calc.test.mjs` — Node `--test` harness that parses the CALC block
  out of `index.html` and runs assertions against the extracted module.

## Updating bank rates

Edit the `<script type="application/json" id="rates-data">` block inside
`index.html`. Each bank entry is `{ name, source, list, snitt }` with `list`
and `snitt` keyed by binding term (`3m`, `1y`, `2y`, `3y`, `5y`, `10y`).
Bump `updated` and `snittranta_period` at the top of the JSON. Reload the
page — no rebuild needed.

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
