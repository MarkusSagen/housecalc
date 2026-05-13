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
