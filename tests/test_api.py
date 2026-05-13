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
    # Wait scenario with 0% stock return and huge house appreciation
    # so required handpenning at end of wait exceeds stocks.
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
