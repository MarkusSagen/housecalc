"""Pure calculation functions for Swedish home purchase scenarios."""

from app.models import (
    CalculateRequest,
    ComparisonResult,
    ComparisonSummary,
    MonthlyCosts,
    OneTimeCosts,
    ScenarioResult,
    YearSnapshot,
)

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
        round(PANTBREV_RATE * new_pantbrev) + PANTBREV_FEE_KR if new_pantbrev > 0 else 0
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

    # Pay the non-handpenning one-time costs from leftover stocks (clamp at 0)
    closing_costs = one_time.total_kr - handpenning_used
    leftover_stocks = max(0.0, leftover_stocks - closing_costs)
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
