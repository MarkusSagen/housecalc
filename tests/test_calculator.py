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
