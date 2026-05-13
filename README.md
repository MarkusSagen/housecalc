# Housecalc

Swedish home-purchase calculator. Compare buying a house now vs. waiting and
investing the down payment in stocks. Models handpenning as a list of named
sources, applies Swedish rules (90% LTV cap, 2% default amortization, 1.5%
stämpelskatt, 2% pantbrev, ränteavdrag 30/21%).

Output matches Booli/SBAB to the krona for typical Swedish purchases.

## Run

    uv sync
    uv run uvicorn app.main:app --reload

Open http://127.0.0.1:8000/.

## Test

    uv run pytest

## Layout

- `app/calculator.py` — pure calculation functions (TDD-covered).
- `app/models.py` — Pydantic models.
- `app/main.py` — FastAPI app + `POST /api/calculate`.
- `static/` — HTML, CSS, JS frontend (no build step).

## Design

See `docs/superpowers/specs/2026-05-13-housecalc-design.md`.
