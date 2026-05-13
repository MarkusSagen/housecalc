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
