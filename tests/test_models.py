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
