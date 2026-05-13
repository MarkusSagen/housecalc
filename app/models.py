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
