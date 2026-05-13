import pytest

from app.calculator import (
    buy_now_scenario,
    compare_scenarios,
    compute_monthly_costs,
    compute_one_time_costs,
    ranteavdrag_credit_kr,
    wait_and_invest_scenario,
)
from app.models import (
    CalculateRequest,
    ComparisonResult,
    HandpenningSource,
    HousingType,
    OneTimeCosts,
    ScenarioResult,
)


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
    assert (
        result.yearly[0].remaining_loan_kr - result.yearly[1].remaining_loan_kr
        == 91_000
    )


def test_buy_now_house_appreciates():
    result = buy_now_scenario(_request(house_appreciation_pct=3.0))
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
    assert result.monthly_at_start_after_tax.total_kr < result.monthly_at_start.total_kr


def test_buy_now_amortization_stops_at_zero():
    # With 3.5% flat amort, ~28.6 years to pay off. Test 30-year horizon.
    result = buy_now_scenario(_request(horizon_years=30))
    assert result.yearly[-1].remaining_loan_kr == 0


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
    # 300k handpenning (exactly 10%), no monthly savings, 0% stock return,
    # house appreciates so much that required handpenning at end of wait
    # exceeds the stocks.
    req = _request(
        price_kr=3_000_000,
        handpenning_sources=[HandpenningSource(label="Sparpengar", amount_kr=300_000)],
        monthly_savings_kr=0,
        wait_months=12,
        stock_return_pct=0.0,
        house_appreciation_pct=20.0,
    )
    with pytest.raises(ValueError, match="cover"):
        wait_and_invest_scenario(req)


def test_wait_zero_months_matches_buy_now_year_zero():
    req = _request(wait_months=0)
    wait_result = wait_and_invest_scenario(req)
    buy_result = buy_now_scenario(req)
    # Year 0 of buy_now matches year 0 of wait (house value the same).
    assert wait_result.yearly[0].house_value_kr == buy_result.yearly[0].house_value_kr


def test_wait_higher_kontantinsats_means_smaller_loan():
    # Compare 10% vs 15% kontantinsats at end of wait.
    base = dict(
        handpenning_sources=[HandpenningSource(label="Sparpengar", amount_kr=600_000)],
        wait_months=12,
        monthly_savings_kr=0,
        stock_return_pct=7.0,
        house_appreciation_pct=3.0,
    )
    r10 = wait_and_invest_scenario(_request(**base, wait_kontantinsats_pct=10.0))
    r20 = wait_and_invest_scenario(_request(**base, wait_kontantinsats_pct=20.0))
    # After buying, the 20% version should have a smaller remaining loan
    # at year 2 (first year after the 12-month wait).
    assert r20.yearly[2].remaining_loan_kr < r10.yearly[2].remaining_loan_kr


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
