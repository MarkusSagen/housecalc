# Housecalc

Swedish home-purchase calculator. Live single-page UI that shows the true monthly
cost of a mortgage (with ränteavdrag), one-time costs (stämpelskatt, pantbrev,
lagfart), the impact of FI's amortization tiers, a rate-stress table, a
multi-price compare table, and a payoff timeline that auto-steps amortization
down across LTV tiers.

Output matches Booli/SBAB to the krona for typical Swedish purchases.

## Run

Pure static site — no build step, no dependencies. Any HTTP server works:

    just dev                      # python3 -m http.server 8000
    # or
    npx serve .                   # if you prefer Node
    # or
    python3 -m http.server 8000

Open http://127.0.0.1:8000/. All math runs client-side.

## Layout

- `index.html` — single-page UI.
- `app.js` — sliders, live recompute, FI tier rules, payoff chart.
- `styles.css` — Booli-style layout.

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
