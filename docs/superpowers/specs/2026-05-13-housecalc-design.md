# Housecalc — Swedish Home Purchase Calculator

## Purpose

A web app that calculates and compares two scenarios for a Swedish house
purchase:

1. **Buy now** — show one-time costs, monthly costs, and projected net worth
   over a configurable horizon.
2. **Wait and invest** — money saved + monthly contributions invested in stocks
   for a wait period, then buy a house (at appreciated price), and project net
   worth over the remaining horizon.

The user can model their **handpenning** (down payment) as a sum of multiple
named sources (own savings, gift, bonus, etc.) that must total ≥10% of the
house price under current Swedish rules.

## Tech Stack

- **Backend:** FastAPI (Python 3.14) — single `POST /api/calculate` endpoint.
- **Frontend:** Vanilla HTML/JS, no build step. Chart.js loaded from CDN for
  charts. FastAPI serves `static/` as the frontend.
- **Dependencies:** `fastapi`, `uvicorn[standard]`, `pydantic`. Managed via
  `pyproject.toml` (uv).

## Project Layout

```
housecalc/
├── pyproject.toml        # add fastapi, uvicorn, pydantic
├── app/
│   ├── __init__.py
│   ├── main.py           # FastAPI app, /api/calculate, mount /static
│   ├── models.py         # Pydantic: Inputs, ScenarioResult, ComparisonResult
│   └── calculator.py     # Pure functions: buy_now(), wait_and_invest()
├── static/
│   ├── index.html        # Form + result panels + charts
│   ├── app.js            # Form handling, fetch /api/calculate, render charts
│   └── styles.css        # Clean Swedish-bank-ish look
└── docs/superpowers/specs/2026-05-13-housecalc-design.md
```

Old `main.py` placeholder is removed.

## Rules and Assumptions (Sweden)

Defaults are pre-filled in the form; user may adjust any of them.

| Rule | Value | Source |
|------|-------|--------|
| LTV cap (bolånetak) | 90% (i.e. ≥10% kontantinsats) | Updated Finansinspektionen rule |
| Amortization rate (flat) | 2% of original loan/year | Booli/SBAB default for LTV > 70% |
| Stämpelskatt (lagfart) | 1.5% of purchase price | Lantmäteriet |
| Pantbrev stamp duty | 2% of new pantbrev amount + 375 kr | Lantmäteriet |
| Lagfart fee | 825 kr | Lantmäteriet |
| Interest rate default | 3.95% (SBAB list rate) | SBAB current |
| Stock return default | 7% nominal/year | Long-term historical |
| House appreciation default | 3%/year | Booli historical |
| Ränteavdrag (interest tax deduction) | 30% on first 100 000 kr, 21% beyond | Skatteverket |

## Inputs

**House**
- `price_kr` (int) — purchase price.
- `housing_type` (enum: `brf` | `villa`).
- `monthly_fee_kr` (int) — avgift (BRF) or driftkostnad (villa).
- `existing_pantbrev_kr` (int, default 0) — for pantbrev cost calculation.

**Handpenning sources** (list, ≥1 row, sum ≥ 10% of price)
- `label` (string) — e.g. "Egna sparpengar".
- `amount_kr` (int).

**Loan**
- `interest_rate_pct` (float, default 3.0). Booli default.
- `amortization_rate_pct` (float, default 2.0). Booli default; matches FI tier
  for LTV > 70%.
- `loan_term_years` (int, default 50). Used only as a sanity bound; with
  flat 2% the loan is paid off in 50 years exactly.

**Wait-and-invest**
- `wait_months` (int, default 12).
- `monthly_savings_kr` (int) — added to stock portfolio each month *during the
  wait only*. After buying, no further monthly investing is modeled in v1.
- `stock_return_pct` (float, default 7).
- `house_appreciation_pct` (float, default 3).
- `wait_kontantinsats_pct` (float, default 10.0, min 10.0) — % of the new
  (appreciated) price to put down as kontantinsats at the future purchase.
  Lets the user model "same loan ratio" (10%) vs. "larger down payment"
  (e.g. 20%) using the same input form. Any leftover stocks stay invested.

**Comparison**
- `horizon_years` (enum: 5 | 10 | 20 | 30, default 10).
- `gross_household_income_kr_year` (int) — for ränteavdrag cap check.

## Outputs

Both scenarios return identical shapes so the frontend can compare directly.

```python
class ScenarioResult:
    one_time_costs: OneTimeCosts          # kontantinsats, stämpel, pantbrev, ...
    monthly_at_start: MonthlyCosts        # ränta, amortering, avgift, total
    monthly_at_start_after_tax: MonthlyCosts  # after ränteavdrag
    yearly: list[YearSnapshot]            # one row per year up to horizon

class YearSnapshot:
    year: int                             # 0..horizon
    remaining_loan_kr: int
    house_value_kr: int
    home_equity_kr: int                   # house_value - remaining_loan
    stocks_kr: int                        # 0 for buy_now, grows for wait
    cash_kr: int                          # leftover cash if any
    cumulative_interest_paid_kr: int
    cumulative_amortization_kr: int
    net_worth_kr: int                     # equity + stocks + cash - taxes_owed
```

`ComparisonResult` wraps two `ScenarioResult` plus a `summary` with the
horizon-end delta.

## Calculation Logic

### Scenario A — Buy now

1. **Validate:** sum(handpenning) ≥ 10% of price. Reject otherwise.
2. **Loan amount** = price − sum(handpenning).
3. **One-time costs:**
   - kontantinsats (sum of handpenning, paid out of pocket)
   - stämpelskatt = 1.5% × price
   - pantbrev = 2% × max(0, loan − existing_pantbrev) + 375 kr
   - lagfart fee = 825 kr
4. **Monthly amortization** (fixed) = (amortization_rate × initial loan) / 12.
5. **Monthly interest (year n)** = (remaining loan at year n) × interest / 12.
6. **Year loop** (0 to horizon):
   - Pay 12 months of amortization → reduce loan.
   - Accumulate interest paid.
   - Grow house value by `house_appreciation_pct`.
   - Compute equity = house value − remaining loan.
   - Net worth = equity + remaining cash (initial leftover after one-time
     costs) + any leftover monthly savings *invested in stocks* (see below).
7. **Monthly savings during ownership:** if user's `monthly_savings_kr` >
   monthly housing cost difference, the excess goes into stocks (so the two
   scenarios are compared on equal monthly outflow). Simpler v1: just compare
   net worth without re-investing the difference. Decision: **v1 keeps it
   simple** — buy_now doesn't invest in stocks. Documented as a known
   limitation; can extend later.

### Scenario B — Wait and invest

1. **Wait period** (months 0 to `wait_months`):
   - Stocks start at sum(handpenning).
   - Each month: stocks grow by monthly stock return AND user adds
     `monthly_savings_kr`.
   - House price grows by `house_appreciation_pct` over the wait.
2. **Buy at end of wait:** new price, new handpenning = `wait_kontantinsats_pct`
   × new price (default 10%, user can raise it). Leftover stocks stay invested.
   - If stocks < required handpenning + closing costs, raise a clear error.
3. From there, run the same year loop as Scenario A but starting at
   year = `wait_months / 12` and ending at horizon. Stocks continue to grow
   on whatever wasn't used for handpenning + one-time costs.

### Ränteavdrag

Applied each year on interest paid:
- First 100 000 kr of interest: 30% credit.
- Remainder: 21% credit.

Shown as a separate line on monthly costs (`monthly_at_start_after_tax`).

## Frontend UX

**Layout:** Single page, two columns on desktop (form left, results right),
stacked on mobile.

**Form sections** (collapsible after first fill):
1. Bostad (price, type, fee, existing pantbrev)
2. Handpenning (add/remove rows; live total kr / % of price / LTV%; warn if < 10%)
3. Lån (interest, amortization, term)
4. Vänta och investera (wait months, monthly savings, stock return, house
   appreciation, wait_kontantinsats_pct)
5. Jämförelse (horizon, household income)

**Results panel:**
- **Engångskostnader** card: total + breakdown.
- **Månadskostnad** card: total + breakdown, with after-tax row.
- **Jämförelse** card: side-by-side net worth at horizon, with delta.
- **Charts:**
  - Line: net worth over time, two series.
  - Stacked bar: monthly cost breakdown.
  - Stacked bar: one-time cost breakdown.

All currency formatted as Swedish kronor (`1 234 567 kr`).

## Error Handling

- Backend validates handpenning ≥ 10% and rejects with a clear message.
- Backend validates all inputs are non-negative.
- Frontend shows inline validation (handpenning sum row turns red if < 10%).
- Network error: results panel shows an error banner with retry button.

## Testing

- `app/calculator.py` is pure functions → unit-tested directly.
- Test cases: trivial all-cash purchase, exactly-10% handpenning, wait
  period of 0 (should match buy-now closely), wait period long enough that
  stocks fully fund the new handpenning, ränteavdrag cap at 100 000 kr.
- Frontend not tested in v1 (small surface, hobby project).

## Out of Scope (v1)

- Variable interest rate over time (we use one flat rate).
- Re-investing the monthly cost difference in scenario A.
- Inflation adjustment (everything is nominal).
- Multiple loan tranches (bottom + top loan with different rates).
- Saving/loading scenarios.
- Persistence; everything is computed on demand.
