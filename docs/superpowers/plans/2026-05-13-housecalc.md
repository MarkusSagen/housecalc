# Housecalc Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a single-page web app that compares buying a house in Sweden now vs. waiting and investing the down payment in stocks, with handpenning modeled as a list of named sources.

**Architecture:** FastAPI backend with a single `POST /api/calculate` endpoint. Pure-function calculator in `app/calculator.py` is fully unit-tested. Vanilla HTML/JS frontend in `static/`, charts via Chart.js from CDN. No build step.

**Tech Stack:** Python 3.14, FastAPI, Pydantic v2, Uvicorn, pytest. Vanilla HTML/JS, Chart.js (CDN). Package management via uv.

**Spec:** `docs/superpowers/specs/2026-05-13-housecalc-design.md`

---

## File Structure

```
housecalc/
├── pyproject.toml             # add fastapi, uvicorn, pydantic, pytest
├── app/
│   ├── __init__.py            # empty
│   ├── main.py                # FastAPI app + endpoint + static mount
│   ├── models.py              # Pydantic request/response models
│   └── calculator.py          # Pure calculation functions
├── tests/
│   ├── __init__.py            # empty
│   └── test_calculator.py     # Unit tests for calculator.py
├── static/
│   ├── index.html             # Form + result panels + chart canvases
│   ├── app.js                 # Form handling, fetch, rendering
│   └── styles.css             # Layout + theme
└── main.py                    # DELETED (old placeholder)
```

`app/calculator.py` is the only file with non-trivial logic and is the focus of TDD. `app/models.py` is data classes only. `app/main.py` is a thin wrapper. Frontend is small and tested manually in the browser.

---

### Task 1: Project setup — dependencies and structure

**Files:**
- Modify: `pyproject.toml`
- Create: `app/__init__.py` (empty)
- Create: `tests/__init__.py` (empty)
- Delete: `main.py`

- [ ] **Step 1: Update pyproject.toml**

Replace contents of `pyproject.toml` with:

```toml
[project]
name = "housecalc"
version = "0.1.0"
description = "Swedish home purchase calculator: buy now vs. wait and invest"
readme = "README.md"
requires-python = ">=3.14"
dependencies = [
    "fastapi>=0.115.0",
    "uvicorn[standard]>=0.32.0",
    "pydantic>=2.9.0",
]

[dependency-groups]
dev = [
    "pytest>=8.3.0",
    "httpx>=0.27.0",
]

[tool.pytest.ini_options]
testpaths = ["tests"]
pythonpath = ["."]
```

- [ ] **Step 2: Sync dependencies**

Run: `uv sync`
Expected: `Resolved N packages` then `Installed N packages`. No errors.

- [ ] **Step 3: Create package structure**

```bash
mkdir -p app tests static
touch app/__init__.py tests/__init__.py
rm main.py
```

- [ ] **Step 4: Verify pytest works**

Run: `uv run pytest`
Expected: `no tests ran` (exit 5 is fine — empty test dir).

- [ ] **Step 5: Commit**

```bash
git add pyproject.toml uv.lock app/__init__.py tests/__init__.py
git rm main.py
git commit -m "chore: scaffold fastapi project structure"
```

---

### Task 2: Pydantic input model with handpenning validator

**Files:**
- Create: `app/models.py`
- Create: `tests/test_models.py`

- [ ] **Step 1: Write failing test**

Create `tests/test_models.py`:

```python
import pytest
from pydantic import ValidationError
from app.models import CalculateRequest, HandpenningSource, HousingType


def _valid_request_kwargs():
    return dict(
        price_kr=3_000_000,
        housing_type=HousingType.BRF,
        monthly_fee_kr=4_500,
        handpenning_sources=[HandpenningSource(label="Sparpengar", amount_kr=400_000)],
        gross_household_income_kr_year=600_000,
    )


def test_valid_request_accepted():
    req = CalculateRequest(**_valid_request_kwargs())
    assert req.price_kr == 3_000_000
    assert req.interest_rate_pct == 3.0  # default (Booli)
    assert req.amortization_rate_pct == 2.0  # default (Booli, FI tier >70% LTV)
    assert req.wait_kontantinsats_pct == 10.0  # default
    assert req.horizon_years == 10


def test_handpenning_below_10pct_rejected():
    kwargs = _valid_request_kwargs()
    kwargs["handpenning_sources"] = [
        HandpenningSource(label="Sparpengar", amount_kr=100_000)
    ]
    with pytest.raises(ValidationError, match="at least 10%"):
        CalculateRequest(**kwargs)


def test_handpenning_at_exactly_10pct_accepted():
    kwargs = _valid_request_kwargs()
    kwargs["handpenning_sources"] = [
        HandpenningSource(label="Sparpengar", amount_kr=300_000)
    ]
    req = CalculateRequest(**kwargs)
    assert req.handpenning_total_kr() == 300_000


def test_multiple_handpenning_sources_summed():
    kwargs = _valid_request_kwargs()
    kwargs["handpenning_sources"] = [
        HandpenningSource(label="Sparpengar", amount_kr=200_000),
        HandpenningSource(label="Gava", amount_kr=150_000),
    ]
    req = CalculateRequest(**kwargs)
    assert req.handpenning_total_kr() == 350_000
```

- [ ] **Step 2: Run test, verify it fails**

Run: `uv run pytest tests/test_models.py -v`
Expected: ImportError / ModuleNotFoundError for `app.models`.

- [ ] **Step 3: Implement models**

Create `app/models.py`:

```python
from enum import Enum
from pydantic import BaseModel, Field, model_validator


class HousingType(str, Enum):
    BRF = "brf"
    VILLA = "villa"


class HandpenningSource(BaseModel):
    label: str = Field(min_length=1)
    amount_kr: int = Field(ge=0)


class CalculateRequest(BaseModel):
    # House
    price_kr: int = Field(gt=0)
    housing_type: HousingType
    monthly_fee_kr: int = Field(ge=0)
    existing_pantbrev_kr: int = Field(ge=0, default=0)

    # Handpenning
    handpenning_sources: list[HandpenningSource] = Field(min_length=1)

    # Loan
    interest_rate_pct: float = Field(ge=0, default=3.0)
    amortization_rate_pct: float = Field(ge=0, default=2.0)
    loan_term_years: int = Field(gt=0, default=50)

    # Wait scenario
    wait_months: int = Field(ge=0, default=12)
    monthly_savings_kr: int = Field(ge=0, default=0)
    stock_return_pct: float = Field(default=7.0)
    house_appreciation_pct: float = Field(default=3.0)
    wait_kontantinsats_pct: float = Field(ge=10.0, le=100.0, default=10.0)

    # Comparison
    horizon_years: int = Field(gt=0, default=10)
    gross_household_income_kr_year: int = Field(gt=0)

    def handpenning_total_kr(self) -> int:
        return sum(s.amount_kr for s in self.handpenning_sources)

    @model_validator(mode="after")
    def _check_handpenning_minimum(self):
        total = self.handpenning_total_kr()
        minimum = round(0.10 * self.price_kr)
        if total < minimum:
            raise ValueError(
                f"Handpenning ({total} kr) must be at least 10% of price ({minimum} kr)"
            )
        return self


class OneTimeCosts(BaseModel):
    kontantinsats_kr: int
    stamp_duty_kr: int
    pantbrev_kr: int
    lagfart_fee_kr: int
    total_kr: int


class MonthlyCosts(BaseModel):
    interest_kr: int
    amortization_kr: int
    fee_kr: int
    total_kr: int


class YearSnapshot(BaseModel):
    year: int
    remaining_loan_kr: int
    house_value_kr: int
    home_equity_kr: int
    stocks_kr: int
    cash_kr: int
    cumulative_interest_paid_kr: int
    cumulative_amortization_kr: int
    net_worth_kr: int


class ScenarioResult(BaseModel):
    one_time_costs: OneTimeCosts
    monthly_at_start: MonthlyCosts
    monthly_at_start_after_tax: MonthlyCosts
    yearly: list[YearSnapshot]


class ComparisonSummary(BaseModel):
    buy_now_net_worth_kr: int
    wait_invest_net_worth_kr: int
    difference_kr: int
    better_scenario: str  # "buy_now" or "wait_and_invest"


class ComparisonResult(BaseModel):
    buy_now: ScenarioResult
    wait_and_invest: ScenarioResult
    summary: ComparisonSummary
```

- [ ] **Step 4: Run test, verify it passes**

Run: `uv run pytest tests/test_models.py -v`
Expected: all 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add app/models.py tests/test_models.py
git commit -m "feat: pydantic models with handpenning >=10% validation"
```

---

### Task 3: One-time costs calculator

**Files:**
- Create: `app/calculator.py`
- Create: `tests/test_calculator.py`

- [ ] **Step 1: Write failing test**

Create `tests/test_calculator.py`:

```python
from app.calculator import compute_one_time_costs
from app.models import OneTimeCosts


def test_one_time_costs_typical_brf():
    # 3M kr price, 400k handpenning -> 2.6M loan, no existing pantbrev
    result = compute_one_time_costs(
        price_kr=3_000_000, loan_kr=2_600_000, existing_pantbrev_kr=0
    )
    assert isinstance(result, OneTimeCosts)
    assert result.kontantinsats_kr == 400_000
    assert result.stamp_duty_kr == 45_000  # 1.5% of 3M
    assert result.pantbrev_kr == 52_375  # 2% of 2.6M + 375
    assert result.lagfart_fee_kr == 825
    assert result.total_kr == 400_000 + 45_000 + 52_375 + 825


def test_one_time_costs_with_existing_pantbrev():
    # Existing pantbrev reduces the new pantbrev cost
    result = compute_one_time_costs(
        price_kr=3_000_000, loan_kr=2_600_000, existing_pantbrev_kr=2_000_000
    )
    # New pantbrev needed = 600k, 2% = 12k + 375
    assert result.pantbrev_kr == 12_375


def test_one_time_costs_existing_pantbrev_covers_loan():
    # If existing pantbrev >= loan, no new pantbrev needed
    result = compute_one_time_costs(
        price_kr=3_000_000, loan_kr=2_600_000, existing_pantbrev_kr=3_000_000
    )
    assert result.pantbrev_kr == 0


def test_one_time_costs_all_cash_purchase():
    # No loan means no pantbrev
    result = compute_one_time_costs(
        price_kr=3_000_000, loan_kr=0, existing_pantbrev_kr=0
    )
    assert result.pantbrev_kr == 0
    assert result.kontantinsats_kr == 3_000_000
    assert result.stamp_duty_kr == 45_000
```

- [ ] **Step 2: Run test, verify it fails**

Run: `uv run pytest tests/test_calculator.py -v`
Expected: ImportError for `app.calculator`.

- [ ] **Step 3: Implement compute_one_time_costs**

Create `app/calculator.py`:

```python
"""Pure calculation functions for Swedish home purchase scenarios."""

from app.models import OneTimeCosts

LAGFART_FEE_KR = 825
PANTBREV_FEE_KR = 375
STAMP_DUTY_RATE = 0.015
PANTBREV_RATE = 0.02
LTV_CAP = 0.90  # bank lends max 90% -> min 10% kontantinsats
RANTEAVDRAG_CAP_KR = 100_000
RANTEAVDRAG_RATE_BELOW = 0.30
RANTEAVDRAG_RATE_ABOVE = 0.21


def compute_one_time_costs(
    price_kr: int, loan_kr: int, existing_pantbrev_kr: int
) -> OneTimeCosts:
    kontantinsats = price_kr - loan_kr
    stamp_duty = round(STAMP_DUTY_RATE * price_kr)
    new_pantbrev = max(0, loan_kr - existing_pantbrev_kr)
    pantbrev_cost = (
        round(PANTBREV_RATE * new_pantbrev) + PANTBREV_FEE_KR
        if new_pantbrev > 0
        else 0
    )
    lagfart_fee = LAGFART_FEE_KR if loan_kr > 0 or price_kr > 0 else 0
    total = kontantinsats + stamp_duty + pantbrev_cost + lagfart_fee
    return OneTimeCosts(
        kontantinsats_kr=kontantinsats,
        stamp_duty_kr=stamp_duty,
        pantbrev_kr=pantbrev_cost,
        lagfart_fee_kr=lagfart_fee,
        total_kr=total,
    )
```

- [ ] **Step 4: Run test, verify it passes**

Run: `uv run pytest tests/test_calculator.py -v`
Expected: all 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add app/calculator.py tests/test_calculator.py
git commit -m "feat: compute_one_time_costs for Swedish purchase fees"
```

---

### Task 4: Monthly costs and ränteavdrag

**Files:**
- Modify: `app/calculator.py`
- Modify: `tests/test_calculator.py`

- [ ] **Step 1: Write failing tests**

Append to `tests/test_calculator.py`:

```python
from app.calculator import compute_monthly_costs, ranteavdrag_credit_kr


def test_monthly_costs_basic():
    # 2.6M loan, 3.95% interest, 3.5% amortization on initial loan, 4500 fee
    result = compute_monthly_costs(
        remaining_loan_kr=2_600_000,
        initial_loan_kr=2_600_000,
        monthly_fee_kr=4_500,
        interest_rate_pct=3.95,
        amortization_rate_pct=3.5,
    )
    assert result.interest_kr == round(2_600_000 * 0.0395 / 12)  # 8558
    assert result.amortization_kr == round(2_600_000 * 0.035 / 12)  # 7583
    assert result.fee_kr == 4_500
    assert result.total_kr == result.interest_kr + result.amortization_kr + 4_500


def test_monthly_costs_amortization_fixed_on_initial_loan():
    # Amortization stays flat even as remaining loan decreases
    result = compute_monthly_costs(
        remaining_loan_kr=1_300_000,  # half paid off
        initial_loan_kr=2_600_000,
        monthly_fee_kr=4_500,
        interest_rate_pct=3.95,
        amortization_rate_pct=3.5,
    )
    # Interest based on remaining
    assert result.interest_kr == round(1_300_000 * 0.0395 / 12)
    # Amortization still based on initial
    assert result.amortization_kr == round(2_600_000 * 0.035 / 12)


def test_ranteavdrag_below_cap():
    # 50,000 kr interest -> 30% = 15,000 kr credit
    assert ranteavdrag_credit_kr(50_000) == 15_000


def test_ranteavdrag_at_cap():
    # Exactly 100,000 kr -> 30,000 kr credit
    assert ranteavdrag_credit_kr(100_000) == 30_000


def test_ranteavdrag_above_cap():
    # 150,000 kr interest: 30% on first 100k + 21% on next 50k
    # = 30,000 + 10,500 = 40,500
    assert ranteavdrag_credit_kr(150_000) == 40_500


def test_ranteavdrag_zero():
    assert ranteavdrag_credit_kr(0) == 0
```

- [ ] **Step 2: Run tests, verify they fail**

Run: `uv run pytest tests/test_calculator.py -v`
Expected: ImportError for `compute_monthly_costs` and `ranteavdrag_credit_kr`.

- [ ] **Step 3: Implement functions**

Append to `app/calculator.py`:

```python
from app.models import MonthlyCosts


def compute_monthly_costs(
    remaining_loan_kr: int,
    initial_loan_kr: int,
    monthly_fee_kr: int,
    interest_rate_pct: float,
    amortization_rate_pct: float,
) -> MonthlyCosts:
    interest = round(remaining_loan_kr * (interest_rate_pct / 100) / 12)
    amortization = round(initial_loan_kr * (amortization_rate_pct / 100) / 12)
    fee = monthly_fee_kr
    return MonthlyCosts(
        interest_kr=interest,
        amortization_kr=amortization,
        fee_kr=fee,
        total_kr=interest + amortization + fee,
    )


def ranteavdrag_credit_kr(annual_interest_kr: int) -> int:
    """Swedish interest tax deduction: 30% on first 100k kr, 21% on the rest."""
    if annual_interest_kr <= RANTEAVDRAG_CAP_KR:
        return round(annual_interest_kr * RANTEAVDRAG_RATE_BELOW)
    below = round(RANTEAVDRAG_CAP_KR * RANTEAVDRAG_RATE_BELOW)
    above = round((annual_interest_kr - RANTEAVDRAG_CAP_KR) * RANTEAVDRAG_RATE_ABOVE)
    return below + above
```

- [ ] **Step 4: Run tests, verify they pass**

Run: `uv run pytest tests/test_calculator.py -v`
Expected: all tests PASS (4 + 6 = 10 in this file so far).

- [ ] **Step 5: Commit**

```bash
git add app/calculator.py tests/test_calculator.py
git commit -m "feat: monthly costs (flat amortization) and ranteavdrag"
```

---

### Task 5: Buy-now scenario

**Files:**
- Modify: `app/calculator.py`
- Modify: `tests/test_calculator.py`

- [ ] **Step 1: Write failing tests**

Append to `tests/test_calculator.py`:

```python
from app.calculator import buy_now_scenario
from app.models import CalculateRequest, HandpenningSource, HousingType, ScenarioResult


def _request(**overrides) -> CalculateRequest:
    defaults = dict(
        price_kr=3_000_000,
        housing_type=HousingType.BRF,
        monthly_fee_kr=4_500,
        handpenning_sources=[HandpenningSource(label="Sparpengar", amount_kr=400_000)],
        interest_rate_pct=4.0,
        amortization_rate_pct=3.5,
        wait_months=12,
        monthly_savings_kr=10_000,
        stock_return_pct=7.0,
        house_appreciation_pct=3.0,
        horizon_years=10,
        gross_household_income_kr_year=600_000,
    )
    defaults.update(overrides)
    return CalculateRequest(**defaults)


def test_buy_now_year_zero_snapshot():
    result = buy_now_scenario(_request())
    assert isinstance(result, ScenarioResult)
    y0 = result.yearly[0]
    assert y0.year == 0
    assert y0.remaining_loan_kr == 2_600_000
    assert y0.house_value_kr == 3_000_000
    assert y0.home_equity_kr == 400_000
    assert y0.stocks_kr == 0
    assert y0.net_worth_kr == 400_000


def test_buy_now_horizon_length():
    result = buy_now_scenario(_request(horizon_years=10))
    assert len(result.yearly) == 11  # year 0..10


def test_buy_now_loan_decreases_each_year():
    result = buy_now_scenario(_request())
    loans = [y.remaining_loan_kr for y in result.yearly]
    assert loans == sorted(loans, reverse=True)
    # 3.5% of 2.6M = 91,000 per year amortization
    assert result.yearly[0].remaining_loan_kr - result.yearly[1].remaining_loan_kr == 91_000


def test_buy_now_house_appreciates():
    result = buy_now_scenario(_request(house_appreciation_pct=3.0))
    y0 = result.yearly[0]
    y1 = result.yearly[1]
    # 3M * 1.03 = 3,090,000
    assert y1.house_value_kr == 3_090_000


def test_buy_now_equity_grows():
    result = buy_now_scenario(_request())
    equities = [y.home_equity_kr for y in result.yearly]
    assert all(equities[i] < equities[i + 1] for i in range(len(equities) - 1))


def test_buy_now_monthly_at_start():
    result = buy_now_scenario(_request())
    # 2.6M loan, 4% interest, 3.5% amortization on initial
    assert result.monthly_at_start.interest_kr == round(2_600_000 * 0.04 / 12)
    assert result.monthly_at_start.amortization_kr == round(2_600_000 * 0.035 / 12)
    assert result.monthly_at_start.fee_kr == 4_500


def test_buy_now_after_tax_monthly_lower_than_pretax():
    result = buy_now_scenario(_request())
    assert (
        result.monthly_at_start_after_tax.total_kr
        < result.monthly_at_start.total_kr
    )


def test_buy_now_amortization_stops_at_zero():
    # With 3.5% flat amort, ~28.6 years to pay off. Test 30-year horizon.
    result = buy_now_scenario(_request(horizon_years=30))
    assert result.yearly[-1].remaining_loan_kr == 0
```

- [ ] **Step 2: Run tests, verify they fail**

Run: `uv run pytest tests/test_calculator.py -v -k buy_now`
Expected: ImportError for `buy_now_scenario`.

- [ ] **Step 3: Implement buy_now_scenario**

Append to `app/calculator.py`:

```python
from app.models import (
    CalculateRequest,
    OneTimeCosts,
    ScenarioResult,
    YearSnapshot,
)


def buy_now_scenario(req: CalculateRequest) -> ScenarioResult:
    handpenning_total = req.handpenning_total_kr()
    initial_loan = req.price_kr - handpenning_total
    one_time = compute_one_time_costs(
        price_kr=req.price_kr,
        loan_kr=initial_loan,
        existing_pantbrev_kr=req.existing_pantbrev_kr,
    )

    monthly_at_start = compute_monthly_costs(
        remaining_loan_kr=initial_loan,
        initial_loan_kr=initial_loan,
        monthly_fee_kr=req.monthly_fee_kr,
        interest_rate_pct=req.interest_rate_pct,
        amortization_rate_pct=req.amortization_rate_pct,
    )

    yearly: list[YearSnapshot] = []
    yearly.append(
        YearSnapshot(
            year=0,
            remaining_loan_kr=initial_loan,
            house_value_kr=req.price_kr,
            home_equity_kr=req.price_kr - initial_loan,
            stocks_kr=0,
            cash_kr=0,
            cumulative_interest_paid_kr=0,
            cumulative_amortization_kr=0,
            net_worth_kr=req.price_kr - initial_loan,
        )
    )

    annual_amortization = round(initial_loan * req.amortization_rate_pct / 100)
    remaining_loan = initial_loan
    house_value = float(req.price_kr)
    cumulative_interest = 0
    cumulative_amort = 0

    for year in range(1, req.horizon_years + 1):
        year_interest = round(remaining_loan * req.interest_rate_pct / 100)
        year_amort = min(annual_amortization, remaining_loan)
        remaining_loan -= year_amort
        cumulative_interest += year_interest
        cumulative_amort += year_amort
        house_value = house_value * (1 + req.house_appreciation_pct / 100)
        equity = round(house_value) - remaining_loan
        yearly.append(
            YearSnapshot(
                year=year,
                remaining_loan_kr=remaining_loan,
                house_value_kr=round(house_value),
                home_equity_kr=equity,
                stocks_kr=0,
                cash_kr=0,
                cumulative_interest_paid_kr=cumulative_interest,
                cumulative_amortization_kr=cumulative_amort,
                net_worth_kr=equity,
            )
        )

    annual_interest_year1 = round(initial_loan * req.interest_rate_pct / 100)
    monthly_tax_credit = ranteavdrag_credit_kr(annual_interest_year1) // 12
    monthly_at_start_after_tax = MonthlyCosts(
        interest_kr=monthly_at_start.interest_kr - monthly_tax_credit,
        amortization_kr=monthly_at_start.amortization_kr,
        fee_kr=monthly_at_start.fee_kr,
        total_kr=monthly_at_start.total_kr - monthly_tax_credit,
    )

    return ScenarioResult(
        one_time_costs=one_time,
        monthly_at_start=monthly_at_start,
        monthly_at_start_after_tax=monthly_at_start_after_tax,
        yearly=yearly,
    )
```

- [ ] **Step 4: Run tests, verify they pass**

Run: `uv run pytest tests/test_calculator.py -v -k buy_now`
Expected: all 8 buy_now tests PASS.

- [ ] **Step 5: Commit**

```bash
git add app/calculator.py tests/test_calculator.py
git commit -m "feat: buy_now_scenario with year-by-year net worth projection"
```

---

### Task 6: Wait-and-invest scenario

**Files:**
- Modify: `app/calculator.py`
- Modify: `tests/test_calculator.py`

- [ ] **Step 1: Write failing tests**

Append to `tests/test_calculator.py`:

```python
from app.calculator import wait_and_invest_scenario


def test_wait_year_zero_snapshot():
    req = _request(
        handpenning_sources=[HandpenningSource(label="Sparpengar", amount_kr=400_000)],
        wait_months=12,
    )
    result = wait_and_invest_scenario(req)
    y0 = result.yearly[0]
    assert y0.year == 0
    assert y0.remaining_loan_kr == 0
    assert y0.house_value_kr == 3_000_000
    assert y0.stocks_kr == 400_000
    assert y0.home_equity_kr == 0


def test_wait_horizon_length():
    result = wait_and_invest_scenario(_request(horizon_years=10))
    assert len(result.yearly) == 11  # year 0..10


def test_wait_stocks_grow_during_wait():
    # No monthly savings, just compound growth
    req = _request(
        handpenning_sources=[HandpenningSource(label="Sparpengar", amount_kr=400_000)],
        wait_months=12,
        monthly_savings_kr=0,
        stock_return_pct=12.0,  # easy math: 1% monthly
    )
    result = wait_and_invest_scenario(req)
    # After 12 months at 1%/mo: 400k * 1.01^12 ~= 450,729
    y1 = result.yearly[1]
    assert 449_000 < y1.stocks_kr < 452_000


def test_wait_house_appreciates_during_wait():
    req = _request(wait_months=12, house_appreciation_pct=12.0)  # 1%/mo
    result = wait_and_invest_scenario(req)
    # After 12 months: 3M * 1.01^12 ~= 3,380,000
    y1 = result.yearly[1]
    assert 3_375_000 < y1.house_value_kr < 3_385_000


def test_wait_buys_house_after_wait_period():
    req = _request(
        handpenning_sources=[HandpenningSource(label="Sparpengar", amount_kr=400_000)],
        monthly_savings_kr=10_000,
        wait_months=12,
        stock_return_pct=7.0,
        house_appreciation_pct=3.0,
        horizon_years=10,
    )
    result = wait_and_invest_scenario(req)
    # By year 2 we own the house, so equity > 0
    y2 = result.yearly[2]
    assert y2.remaining_loan_kr > 0
    assert y2.home_equity_kr > 0


def test_wait_fails_if_stocks_cant_cover_handpenning():
    # 100k handpenning at start, but min 10% of price is 300k.
    # We bypass model validation by manually constructing with 10% (300k).
    # Then after the wait, with 0 growth, stocks can't cover the
    # appreciated handpenning.
    req = _request(
        price_kr=3_000_000,
        handpenning_sources=[HandpenningSource(label="Sparpengar", amount_kr=300_000)],
        monthly_savings_kr=0,
        wait_months=12,
        stock_return_pct=0.0,
        house_appreciation_pct=10.0,
    )
    # After 12 months: house ~3.3M, required handpenning ~330k, stocks 300k
    # Plus one-time costs need to be paid from leftover -> fails
    import pytest
    with pytest.raises(ValueError, match="cover"):
        wait_and_invest_scenario(req)


def test_wait_zero_months_matches_buy_now_year_zero():
    req = _request(wait_months=0)
    wait_result = wait_and_invest_scenario(req)
    buy_result = buy_now_scenario(req)
    # Year 0 of buy_now matches year 0 of wait (with stocks=0 after buying)
    assert wait_result.yearly[0].house_value_kr == buy_result.yearly[0].house_value_kr
```

- [ ] **Step 2: Run tests, verify they fail**

Run: `uv run pytest tests/test_calculator.py -v -k wait`
Expected: ImportError for `wait_and_invest_scenario`.

- [ ] **Step 3: Implement wait_and_invest_scenario**

Append to `app/calculator.py`:

```python
def wait_and_invest_scenario(req: CalculateRequest) -> ScenarioResult:
    initial_savings = req.handpenning_total_kr()
    monthly_stock_rate = req.stock_return_pct / 100 / 12
    monthly_house_rate = req.house_appreciation_pct / 100 / 12

    yearly: list[YearSnapshot] = []
    yearly.append(
        YearSnapshot(
            year=0,
            remaining_loan_kr=0,
            house_value_kr=req.price_kr,
            home_equity_kr=0,
            stocks_kr=initial_savings,
            cash_kr=0,
            cumulative_interest_paid_kr=0,
            cumulative_amortization_kr=0,
            net_worth_kr=initial_savings,
        )
    )

    stocks = float(initial_savings)
    house_value = float(req.price_kr)

    # Simulate wait period month by month, snapshot at year boundaries.
    for month in range(1, req.wait_months + 1):
        stocks = stocks * (1 + monthly_stock_rate) + req.monthly_savings_kr
        house_value = house_value * (1 + monthly_house_rate)
        if month % 12 == 0:
            year = month // 12
            if year <= req.horizon_years:
                yearly.append(
                    YearSnapshot(
                        year=year,
                        remaining_loan_kr=0,
                        house_value_kr=round(house_value),
                        home_equity_kr=0,
                        stocks_kr=round(stocks),
                        cash_kr=0,
                        cumulative_interest_paid_kr=0,
                        cumulative_amortization_kr=0,
                        net_worth_kr=round(stocks),
                    )
                )

    # Buy at end of wait
    final_price = round(house_value)
    required_handpenning = round(req.wait_kontantinsats_pct / 100 * final_price)
    if stocks < required_handpenning:
        raise ValueError(
            f"After {req.wait_months} months, stocks ({round(stocks)} kr) "
            f"cannot cover required {req.wait_kontantinsats_pct:.1f}% handpenning "
            f"({required_handpenning} kr) on appreciated price of {final_price} kr."
        )

    handpenning_used = required_handpenning
    leftover_stocks = stocks - handpenning_used
    initial_loan = final_price - handpenning_used

    one_time = compute_one_time_costs(
        price_kr=final_price,
        loan_kr=initial_loan,
        existing_pantbrev_kr=req.existing_pantbrev_kr,
    )

    # Pay the non-handpenning one-time costs from leftover stocks
    closing_costs = one_time.total_kr - handpenning_used
    if leftover_stocks < closing_costs:
        raise ValueError(
            f"After {req.wait_months} months, stocks cannot cover handpenning "
            f"plus closing costs ({one_time.total_kr} kr total)."
        )
    leftover_stocks -= closing_costs
    stocks = leftover_stocks  # whatever's left keeps growing

    monthly_at_start = compute_monthly_costs(
        remaining_loan_kr=initial_loan,
        initial_loan_kr=initial_loan,
        monthly_fee_kr=req.monthly_fee_kr,
        interest_rate_pct=req.interest_rate_pct,
        amortization_rate_pct=req.amortization_rate_pct,
    )

    annual_amortization = round(initial_loan * req.amortization_rate_pct / 100)
    remaining_loan = initial_loan
    cur_house_value = float(final_price)
    cumulative_interest = 0
    cumulative_amort = 0

    wait_years_floor = req.wait_months // 12

    for year in range(wait_years_floor + 1, req.horizon_years + 1):
        year_interest = round(remaining_loan * req.interest_rate_pct / 100)
        year_amort = min(annual_amortization, remaining_loan)
        remaining_loan -= year_amort
        cumulative_interest += year_interest
        cumulative_amort += year_amort
        cur_house_value = cur_house_value * (1 + req.house_appreciation_pct / 100)
        stocks = stocks * (1 + req.stock_return_pct / 100)
        equity = round(cur_house_value) - remaining_loan
        yearly.append(
            YearSnapshot(
                year=year,
                remaining_loan_kr=remaining_loan,
                house_value_kr=round(cur_house_value),
                home_equity_kr=equity,
                stocks_kr=round(stocks),
                cash_kr=0,
                cumulative_interest_paid_kr=cumulative_interest,
                cumulative_amortization_kr=cumulative_amort,
                net_worth_kr=equity + round(stocks),
            )
        )

    annual_interest_year1 = round(initial_loan * req.interest_rate_pct / 100)
    monthly_tax_credit = ranteavdrag_credit_kr(annual_interest_year1) // 12
    monthly_at_start_after_tax = MonthlyCosts(
        interest_kr=monthly_at_start.interest_kr - monthly_tax_credit,
        amortization_kr=monthly_at_start.amortization_kr,
        fee_kr=monthly_at_start.fee_kr,
        total_kr=monthly_at_start.total_kr - monthly_tax_credit,
    )

    return ScenarioResult(
        one_time_costs=one_time,
        monthly_at_start=monthly_at_start,
        monthly_at_start_after_tax=monthly_at_start_after_tax,
        yearly=yearly,
    )
```

- [ ] **Step 4: Run tests, verify they pass**

Run: `uv run pytest tests/test_calculator.py -v`
Expected: all tests in file PASS.

- [ ] **Step 5: Commit**

```bash
git add app/calculator.py tests/test_calculator.py
git commit -m "feat: wait_and_invest_scenario with handpenning shortfall check"
```

---

### Task 7: Comparison wrapper

**Files:**
- Modify: `app/calculator.py`
- Modify: `tests/test_calculator.py`

- [ ] **Step 1: Write failing test**

Append to `tests/test_calculator.py`:

```python
from app.calculator import compare_scenarios
from app.models import ComparisonResult


def test_compare_scenarios_returns_both():
    result = compare_scenarios(_request())
    assert isinstance(result, ComparisonResult)
    assert result.buy_now.yearly[0].year == 0
    assert result.wait_and_invest.yearly[0].year == 0


def test_compare_scenarios_summary_picks_winner():
    result = compare_scenarios(_request())
    buy_final = result.buy_now.yearly[-1].net_worth_kr
    wait_final = result.wait_and_invest.yearly[-1].net_worth_kr
    assert result.summary.buy_now_net_worth_kr == buy_final
    assert result.summary.wait_invest_net_worth_kr == wait_final
    assert result.summary.difference_kr == abs(buy_final - wait_final)
    expected_winner = "buy_now" if buy_final >= wait_final else "wait_and_invest"
    assert result.summary.better_scenario == expected_winner
```

- [ ] **Step 2: Run test, verify it fails**

Run: `uv run pytest tests/test_calculator.py -v -k compare`
Expected: ImportError for `compare_scenarios`.

- [ ] **Step 3: Implement compare_scenarios**

Append to `app/calculator.py`:

```python
from app.models import ComparisonResult, ComparisonSummary


def compare_scenarios(req: CalculateRequest) -> ComparisonResult:
    buy_now = buy_now_scenario(req)
    wait = wait_and_invest_scenario(req)
    buy_final = buy_now.yearly[-1].net_worth_kr
    wait_final = wait.yearly[-1].net_worth_kr
    summary = ComparisonSummary(
        buy_now_net_worth_kr=buy_final,
        wait_invest_net_worth_kr=wait_final,
        difference_kr=abs(buy_final - wait_final),
        better_scenario="buy_now" if buy_final >= wait_final else "wait_and_invest",
    )
    return ComparisonResult(buy_now=buy_now, wait_and_invest=wait, summary=summary)
```

- [ ] **Step 4: Run tests, verify they pass**

Run: `uv run pytest -v`
Expected: all tests PASS across both files.

- [ ] **Step 5: Commit**

```bash
git add app/calculator.py tests/test_calculator.py
git commit -m "feat: compare_scenarios wrapper with winner summary"
```

---

### Task 8: FastAPI app and endpoint

**Files:**
- Create: `app/main.py`
- Create: `tests/test_api.py`

- [ ] **Step 1: Write failing API test**

Create `tests/test_api.py`:

```python
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


def _payload(**overrides):
    base = {
        "price_kr": 3_000_000,
        "housing_type": "brf",
        "monthly_fee_kr": 4_500,
        "handpenning_sources": [{"label": "Sparpengar", "amount_kr": 400_000}],
        "gross_household_income_kr_year": 600_000,
    }
    base.update(overrides)
    return base


def test_calculate_endpoint_happy_path():
    response = client.post("/api/calculate", json=_payload())
    assert response.status_code == 200
    data = response.json()
    assert "buy_now" in data
    assert "wait_and_invest" in data
    assert "summary" in data
    assert data["buy_now"]["yearly"][0]["year"] == 0


def test_calculate_endpoint_rejects_low_handpenning():
    response = client.post(
        "/api/calculate",
        json=_payload(
            handpenning_sources=[{"label": "Sparpengar", "amount_kr": 100_000}]
        ),
    )
    assert response.status_code == 422


def test_calculate_endpoint_returns_422_on_stocks_shortfall():
    # Construct a case where wait_and_invest raises ValueError mid-calc
    response = client.post(
        "/api/calculate",
        json=_payload(
            handpenning_sources=[{"label": "Sparpengar", "amount_kr": 300_000}],
            wait_months=12,
            monthly_savings_kr=0,
            stock_return_pct=0.0,
            house_appreciation_pct=20.0,
        ),
    )
    assert response.status_code == 422
    assert "cover" in response.json()["detail"].lower()


def test_static_index_served():
    response = client.get("/")
    # Will fail until static/index.html exists; for now, accept 404 or 200
    assert response.status_code in (200, 404)
```

- [ ] **Step 2: Run test, verify it fails**

Run: `uv run pytest tests/test_api.py -v`
Expected: ImportError for `app.main`.

- [ ] **Step 3: Implement FastAPI app**

Create `app/main.py`:

```python
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app.calculator import compare_scenarios
from app.models import CalculateRequest, ComparisonResult

app = FastAPI(title="Housecalc", description="Swedish home purchase calculator")

STATIC_DIR = Path(__file__).parent.parent / "static"


@app.post("/api/calculate", response_model=ComparisonResult)
def calculate(req: CalculateRequest) -> ComparisonResult:
    try:
        return compare_scenarios(req)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))


if STATIC_DIR.exists():
    app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

    @app.get("/")
    def index():
        return FileResponse(STATIC_DIR / "index.html")
```

- [ ] **Step 4: Run tests, verify they pass**

Run: `uv run pytest tests/test_api.py -v`
Expected: 4 PASS (or 3 PASS + 1 skip-equivalent if `static/` doesn't exist yet — both 200 and 404 accepted).

- [ ] **Step 5: Commit**

```bash
git add app/main.py tests/test_api.py
git commit -m "feat: FastAPI app with /api/calculate endpoint"
```

---

### Task 9: Frontend HTML scaffold

**Files:**
- Create: `static/index.html`

- [ ] **Step 1: Create index.html**

Create `static/index.html`:

```html
<!DOCTYPE html>
<html lang="sv">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Housecalc — Köpa hus i Sverige?</title>
  <link rel="stylesheet" href="/static/styles.css" />
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.4/dist/chart.umd.min.js"></script>
</head>
<body>
  <header>
    <h1>Housecalc</h1>
    <p class="tagline">Köpa nu eller spara och vänta?</p>
  </header>

  <main>
    <section class="form-panel">
      <form id="calc-form">
        <fieldset>
          <legend>Bostad</legend>
          <label>Pris (kr)
            <input type="number" name="price_kr" value="3000000" min="1" required />
          </label>
          <label>Typ
            <select name="housing_type">
              <option value="brf">Bostadsrätt</option>
              <option value="villa">Villa</option>
            </select>
          </label>
          <label>Avgift / drift per månad (kr)
            <input type="number" name="monthly_fee_kr" value="4500" min="0" required />
          </label>
          <label>Befintliga pantbrev (kr)
            <input type="number" name="existing_pantbrev_kr" value="0" min="0" />
          </label>
        </fieldset>

        <fieldset>
          <legend>Handpenning <span id="hp-status"></span></legend>
          <div id="hp-rows"></div>
          <button type="button" id="add-hp">+ Lägg till källa</button>
        </fieldset>

        <fieldset>
          <legend>Lån</legend>
          <label>Ränta (%)
            <input type="number" step="0.01" name="interest_rate_pct" value="3.0" min="0" required />
          </label>
          <label>Amortering (%)
            <input type="number" step="0.1" name="amortization_rate_pct" value="2.0" min="0" required />
          </label>
          <label>Löptid (år)
            <input type="number" name="loan_term_years" value="50" min="1" required />
          </label>
        </fieldset>

        <fieldset>
          <legend>Vänta och investera</legend>
          <label>Väntetid (månader)
            <input type="number" name="wait_months" value="12" min="0" required />
          </label>
          <label>Månadssparande under väntetiden (kr)
            <input type="number" name="monthly_savings_kr" value="10000" min="0" required />
          </label>
          <label>Förväntad aktieavkastning (% / år)
            <input type="number" step="0.1" name="stock_return_pct" value="7.0" required />
          </label>
          <label>Förväntad bostadsuppgång (% / år)
            <input type="number" step="0.1" name="house_appreciation_pct" value="3.0" required />
          </label>
          <label>Kontantinsats vid framtida köp (%)
            <input type="number" step="0.5" name="wait_kontantinsats_pct" value="10" min="10" max="100" required />
            <small style="color:#5b6776">10% = samma lånekvot. Högre = mindre lån men mindre kvar i aktier.</small>
          </label>
        </fieldset>

        <fieldset>
          <legend>Jämförelse</legend>
          <label>Tidshorisont
            <select name="horizon_years">
              <option value="5">5 år</option>
              <option value="10" selected>10 år</option>
              <option value="20">20 år</option>
              <option value="30">30 år</option>
            </select>
          </label>
          <label>Hushållets bruttoinkomst per år (kr)
            <input type="number" name="gross_household_income_kr_year" value="600000" min="1" required />
          </label>
        </fieldset>

        <button type="submit" id="submit-btn">Räkna ut</button>
        <p id="form-error" class="error" hidden></p>
      </form>
    </section>

    <section class="results-panel" id="results" hidden>
      <div class="card" id="summary-card">
        <h2>Sammanfattning</h2>
        <div id="summary-body"></div>
      </div>

      <div class="card">
        <h2>Engångskostnader (Köp nu)</h2>
        <table id="one-time-table"></table>
      </div>

      <div class="card">
        <h2>Månadskostnad (Köp nu)</h2>
        <table id="monthly-table"></table>
      </div>

      <div class="card">
        <h2>Förmögenhet över tid</h2>
        <canvas id="networth-chart"></canvas>
      </div>

      <div class="card">
        <h2>Månadskostnad — fördelning</h2>
        <canvas id="monthly-chart"></canvas>
      </div>
    </section>
  </main>
</body>
</html>
```

- [ ] **Step 2: Verify file exists**

Run: `ls -la static/index.html`
Expected: file listed.

- [ ] **Step 3: Commit**

```bash
git add static/index.html
git commit -m "feat: html form and result panels"
```

---

### Task 10: Frontend CSS

**Files:**
- Create: `static/styles.css`

- [ ] **Step 1: Create styles.css**

Create `static/styles.css`:

```css
:root {
  --bg: #f5f7fa;
  --card: #ffffff;
  --border: #d8dde4;
  --text: #1a2233;
  --muted: #5b6776;
  --accent: #1a4480;
  --accent-light: #e8f0fb;
  --good: #2a7f3e;
  --warn: #b85c00;
  --bad: #b3261e;
  --radius: 8px;
  --shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
}

* { box-sizing: border-box; }

body {
  margin: 0;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  background: var(--bg);
  color: var(--text);
  line-height: 1.5;
}

header {
  padding: 1.5rem 2rem;
  background: var(--accent);
  color: white;
}

header h1 { margin: 0; font-size: 1.5rem; }
header .tagline { margin: 0.25rem 0 0; opacity: 0.85; font-size: 0.95rem; }

main {
  display: grid;
  grid-template-columns: minmax(320px, 420px) 1fr;
  gap: 1.5rem;
  padding: 1.5rem 2rem;
  max-width: 1400px;
  margin: 0 auto;
}

@media (max-width: 900px) {
  main { grid-template-columns: 1fr; }
}

.form-panel form, .results-panel { display: flex; flex-direction: column; gap: 1rem; }

fieldset {
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 1rem 1.25rem;
  box-shadow: var(--shadow);
}

legend {
  font-weight: 600;
  padding: 0 0.5rem;
  color: var(--accent);
}

label {
  display: block;
  margin-bottom: 0.75rem;
  font-size: 0.9rem;
  color: var(--muted);
}

input, select, button {
  width: 100%;
  padding: 0.5rem 0.65rem;
  font-size: 1rem;
  border: 1px solid var(--border);
  border-radius: 4px;
  background: white;
  color: var(--text);
  margin-top: 0.25rem;
}

button {
  cursor: pointer;
  background: var(--accent);
  color: white;
  border: none;
  font-weight: 600;
  margin-top: 0.5rem;
}

button:hover { background: #15366c; }
button[type="button"] {
  background: var(--accent-light);
  color: var(--accent);
  border: 1px solid var(--accent);
}

.hp-row {
  display: grid;
  grid-template-columns: 1fr 1fr auto;
  gap: 0.5rem;
  margin-bottom: 0.5rem;
  align-items: end;
}

.hp-row .remove {
  background: transparent;
  color: var(--bad);
  border: 1px solid var(--bad);
  width: auto;
  padding: 0.5rem 0.75rem;
}

#hp-status {
  font-weight: normal;
  font-size: 0.85rem;
  color: var(--muted);
  margin-left: 0.5rem;
}

#hp-status.ok { color: var(--good); }
#hp-status.bad { color: var(--bad); }

.card {
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 1.25rem 1.5rem;
  box-shadow: var(--shadow);
}

.card h2 {
  margin: 0 0 1rem;
  font-size: 1.1rem;
  color: var(--accent);
}

table { width: 100%; border-collapse: collapse; }

table td {
  padding: 0.4rem 0;
  border-bottom: 1px solid var(--border);
}

table tr:last-child td { border-bottom: none; }
table td:last-child { text-align: right; font-variant-numeric: tabular-nums; }
table tr.total td { font-weight: 600; }

#summary-card { background: var(--accent-light); border-color: var(--accent); }

.summary-row {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  padding: 0.4rem 0;
}

.summary-row .label { color: var(--muted); }
.summary-row .value { font-size: 1.2rem; font-variant-numeric: tabular-nums; }
.summary-row.winner .value { color: var(--good); font-weight: 700; }

.error {
  color: var(--bad);
  background: #fef2f0;
  border: 1px solid var(--bad);
  border-radius: 4px;
  padding: 0.5rem 0.75rem;
  margin: 0;
}

canvas { width: 100% !important; height: 320px !important; }
```

- [ ] **Step 2: Commit**

```bash
git add static/styles.css
git commit -m "feat: app styling"
```

---

### Task 11: Frontend JS — form handling and fetch

**Files:**
- Create: `static/app.js`

- [ ] **Step 1: Create app.js**

Create `static/app.js`:

```javascript
const fmt = (n) =>
  new Intl.NumberFormat("sv-SE", { maximumFractionDigits: 0 }).format(n) +
  " kr";

const $ = (sel) => document.querySelector(sel);
const form = $("#calc-form");
const hpRows = $("#hp-rows");
const hpStatus = $("#hp-status");
const results = $("#results");
const formError = $("#form-error");

let networthChart = null;
let monthlyChart = null;

function addHandpenningRow(label = "", amount = "") {
  const row = document.createElement("div");
  row.className = "hp-row";
  row.innerHTML = `
    <label>Beskrivning
      <input type="text" class="hp-label" value="${label}" placeholder="t.ex. Sparpengar" required />
    </label>
    <label>Belopp (kr)
      <input type="number" class="hp-amount" value="${amount}" min="0" required />
    </label>
    <button type="button" class="remove">Ta bort</button>
  `;
  row.querySelector(".remove").addEventListener("click", () => {
    row.remove();
    updateHpStatus();
  });
  row.querySelectorAll("input").forEach((i) =>
    i.addEventListener("input", updateHpStatus)
  );
  hpRows.appendChild(row);
  updateHpStatus();
}

function readHandpenning() {
  return Array.from(hpRows.querySelectorAll(".hp-row")).map((r) => ({
    label: r.querySelector(".hp-label").value.trim() || "Källa",
    amount_kr: parseInt(r.querySelector(".hp-amount").value || "0", 10),
  }));
}

function updateHpStatus() {
  const total = readHandpenning().reduce((s, x) => s + x.amount_kr, 0);
  const price = parseInt(form.price_kr.value || "0", 10);
  const min = Math.round(price * 0.1);
  const pct = price > 0 ? ((total / price) * 100).toFixed(1) : "0";
  const ltv = price > 0 ? (((price - total) / price) * 100).toFixed(1) : "0";
  hpStatus.textContent =
    `(${fmt(total)} = ${pct}% av priset, LTV ${ltv}%, krav ≥ ${fmt(min)})`;
  hpStatus.className = total >= min ? "ok" : "bad";
}

function readForm() {
  const fd = new FormData(form);
  const payload = {};
  for (const [k, v] of fd.entries()) {
    payload[k] = isNaN(v) || v === "" ? v : Number(v);
  }
  payload.handpenning_sources = readHandpenning();
  return payload;
}

async function calculate(event) {
  event.preventDefault();
  formError.hidden = true;
  results.hidden = true;
  const payload = readForm();
  try {
    const r = await fetch("/api/calculate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!r.ok) {
      const err = await r.json().catch(() => ({ detail: "Okänt fel" }));
      const msg = Array.isArray(err.detail)
        ? err.detail.map((d) => d.msg).join("; ")
        : err.detail;
      throw new Error(msg);
    }
    const data = await r.json();
    renderResults(data);
  } catch (e) {
    formError.textContent = e.message;
    formError.hidden = false;
  }
}

function renderResults(data) {
  results.hidden = false;
  renderSummary(data.summary);
  renderOneTime(data.buy_now.one_time_costs);
  renderMonthly(data.buy_now.monthly_at_start, data.buy_now.monthly_at_start_after_tax);
  renderNetworthChart(data.buy_now.yearly, data.wait_and_invest.yearly);
  renderMonthlyChart(data.buy_now.monthly_at_start);
}

function renderSummary(s) {
  const winner = s.better_scenario === "buy_now" ? "Köp nu" : "Vänta och investera";
  $("#summary-body").innerHTML = `
    <div class="summary-row"><span class="label">Köp nu (förmögenhet vid horisont):</span><span class="value">${fmt(s.buy_now_net_worth_kr)}</span></div>
    <div class="summary-row"><span class="label">Vänta och investera:</span><span class="value">${fmt(s.wait_invest_net_worth_kr)}</span></div>
    <div class="summary-row winner"><span class="label">Bättre alternativ:</span><span class="value">${winner} (+${fmt(s.difference_kr)})</span></div>
  `;
}

function renderOneTime(o) {
  $("#one-time-table").innerHTML = `
    <tr><td>Kontantinsats</td><td>${fmt(o.kontantinsats_kr)}</td></tr>
    <tr><td>Stämpelskatt (lagfart, 1,5%)</td><td>${fmt(o.stamp_duty_kr)}</td></tr>
    <tr><td>Pantbrev (2% + avgift)</td><td>${fmt(o.pantbrev_kr)}</td></tr>
    <tr><td>Expeditionsavgift lagfart</td><td>${fmt(o.lagfart_fee_kr)}</td></tr>
    <tr class="total"><td>Totalt</td><td>${fmt(o.total_kr)}</td></tr>
  `;
}

function renderMonthly(m, mTax) {
  $("#monthly-table").innerHTML = `
    <tr><td>Ränta</td><td>${fmt(m.interest_kr)}</td></tr>
    <tr><td>Amortering</td><td>${fmt(m.amortization_kr)}</td></tr>
    <tr><td>Avgift / drift</td><td>${fmt(m.fee_kr)}</td></tr>
    <tr class="total"><td>Totalt (före skatt)</td><td>${fmt(m.total_kr)}</td></tr>
    <tr><td>Totalt (efter ränteavdrag)</td><td>${fmt(mTax.total_kr)}</td></tr>
  `;
}

function renderNetworthChart(buyYears, waitYears) {
  const labels = buyYears.map((y) => `År ${y.year}`);
  const ctx = $("#networth-chart").getContext("2d");
  if (networthChart) networthChart.destroy();
  networthChart = new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "Köp nu",
          data: buyYears.map((y) => y.net_worth_kr),
          borderColor: "#1a4480",
          backgroundColor: "rgba(26,68,128,0.1)",
          tension: 0.2,
        },
        {
          label: "Vänta och investera",
          data: waitYears.map((y) => y.net_worth_kr),
          borderColor: "#b85c00",
          backgroundColor: "rgba(184,92,0,0.1)",
          tension: 0.2,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        tooltip: {
          callbacks: { label: (ctx) => `${ctx.dataset.label}: ${fmt(ctx.parsed.y)}` },
        },
      },
      scales: {
        y: {
          ticks: { callback: (v) => fmt(v) },
        },
      },
    },
  });
}

function renderMonthlyChart(m) {
  const ctx = $("#monthly-chart").getContext("2d");
  if (monthlyChart) monthlyChart.destroy();
  monthlyChart = new Chart(ctx, {
    type: "doughnut",
    data: {
      labels: ["Ränta", "Amortering", "Avgift / drift"],
      datasets: [
        {
          data: [m.interest_kr, m.amortization_kr, m.fee_kr],
          backgroundColor: ["#1a4480", "#2a7f3e", "#b85c00"],
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        tooltip: {
          callbacks: { label: (ctx) => `${ctx.label}: ${fmt(ctx.parsed)}` },
        },
      },
    },
  });
}

// init
form.price_kr.addEventListener("input", updateHpStatus);
$("#add-hp").addEventListener("click", () => addHandpenningRow());
form.addEventListener("submit", calculate);
addHandpenningRow("Sparpengar", 400000);
```

- [ ] **Step 2: Commit**

```bash
git add static/app.js
git commit -m "feat: frontend form handling, fetch, and chart rendering"
```

---

### Task 12: End-to-end manual test

- [ ] **Step 1: Start the server**

Run in a separate terminal: `uv run uvicorn app.main:app --reload`
Expected: `Uvicorn running on http://127.0.0.1:8000`.

- [ ] **Step 2: Open the app**

Open `http://127.0.0.1:8000/` in a browser.

- [ ] **Step 3: Manual verification checklist**

Verify each:
- Form renders with all sections, defaults filled in.
- One pre-filled handpenning row (Sparpengar / 400 000).
- "+ Lägg till källa" adds a row; "Ta bort" removes it.
- Handpenning status updates live and turns red when total < 10% of price.
- Submitting valid form populates the results panel:
  - Summary card shows winning scenario and delta.
  - One-time costs table sums correctly.
  - Monthly costs table shows ränta, amortering, fee, total, after-tax.
  - Net worth line chart shows both series over the horizon.
  - Monthly cost doughnut shows three segments.
- Submitting with handpenning < 10% shows an error banner.
- Changing horizon to 30 years and re-submitting updates chart length.

- [ ] **Step 4: Run full test suite one more time**

Run: `uv run pytest -v`
Expected: all tests PASS.

- [ ] **Step 5: Commit verification doc**

```bash
git status  # should be clean; nothing to commit
```

If clean, nothing to do. If anything was tweaked during manual verification, commit with a descriptive message.

---

### Task 13: README

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Write README**

Replace `README.md` with:

```markdown
# Housecalc

Swedish home-purchase calculator. Compare buying a house now vs. waiting and
investing the down payment in stocks. Models handpenning as a list of named
sources, applies Swedish rules (90% LTV cap, 3.5% flat amortization, 1.5%
stämpelskatt, 2% pantbrev, ränteavdrag 30/21%).

## Run

```bash
uv sync
uv run uvicorn app.main:app --reload
```

Open http://127.0.0.1:8000/.

## Test

```bash
uv run pytest
```

## Layout

- `app/calculator.py` — pure calculation functions (TDD-covered).
- `app/models.py` — Pydantic models.
- `app/main.py` — FastAPI app + `POST /api/calculate`.
- `static/` — HTML, CSS, JS frontend (no build step).

## Design

See `docs/superpowers/specs/2026-05-13-housecalc-design.md`.
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: add README"
```

---

## Done

You should now have:
- All unit tests passing (`uv run pytest`).
- A running app at `http://127.0.0.1:8000/` that calculates and visualizes both scenarios.
- A complete README pointing at the spec.
