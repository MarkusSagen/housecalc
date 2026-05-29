# Housecalc — Trim Dead Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the unused Python calculation backend and the wait-and-invest scenario so the shipped UI is the single source of truth. Keep `app/main.py` as a static-file server only. Update README and design spec to match what actually ships.

**Architecture:** The frontend (`static/app.js`) already computes everything live in JS — pantbrev, stämpelskatt, ränteavdrag, FI amortization tiers, payoff timeline. There is zero `fetch` call from JS to the FastAPI endpoint. We delete the duplicated Python math (`app/calculator.py`, `app/models.py`, related tests) and the unused `POST /api/calculate` route. `app/main.py` is trimmed to a 10-line static server so the dev command (`uv run uvicorn app.main:app --reload`) keeps working without changes. Pydantic moves to a transitive dep (it stays installed via FastAPI but we no longer list it as a direct dep). Docs are rewritten to describe the shipped UI rather than the abandoned wait-vs-invest design.

**Tech Stack:** FastAPI (static serving only), uvicorn, ruff, uv. Frontend: vanilla HTML/CSS/JS + Chart.js (CDN). No build step.

**Decision log (for reviewers):**
- *Not chosen: wire frontend to backend.* Sliders need sub-100ms updates; network round-trip + debouncing would regress UX.
- *Not chosen: keep both implementations and document.* Violates single-source-of-truth and the duplicated rules WILL drift.
- *Not chosen: replace FastAPI with `python -m http.server`.* Would require either moving `index.html` to repo root or rewriting `/static/...` paths in HTML. FastAPI as a 10-line static server is cheaper.

---

## File map

**Delete:**
- `app/calculator.py` — pure functions for buy-now / wait-and-invest / compare; no longer reachable from UI.
- `app/models.py` — `CalculateRequest`, `ScenarioResult`, `ComparisonResult`, etc.; only consumed by deleted endpoint.
- `tests/test_calculator.py` — covered the deleted code.
- `tests/test_models.py` — covered the deleted models.

**Modify:**
- `app/main.py` — drop `/api/calculate`, drop imports of `calculator`/`models`, drop the defensive `if STATIC_DIR.exists()` guards (fail loud if the static dir is missing).
- `tests/test_api.py` — keep only the static-index-served check; drop calculate / handpenning / shortfall tests.
- `pyproject.toml` — drop `pydantic` from runtime deps (now transitive via FastAPI); keep `fastapi`, `uvicorn[standard]`, and dev deps as-is.
- `README.md` — replace the "buy vs. wait" pitch with the shipped UI: monthly cost calculator with ränteavdrag, FI tier table, rate stress test, multi-price compare, payoff timeline.
- `docs/superpowers/specs/2026-05-13-housecalc-design.md` — add a "Status" header noting that the spec is historical (v0 design); the shipped UI diverged. Either rewrite to match shipped UI or mark sections as historical with a pointer to the current README.

**Create:**
- None.

**Stage (already on disk, untracked):**
- `.gitignore`
- `.python-version`

---

## Task 1: Track `.gitignore` and `.python-version`

These are project tooling files sitting untracked in the working tree. Both are standard candidates to commit.

**Files:**
- Stage: `.gitignore`, `.python-version`

- [ ] **Step 1: Verify content of untracked files**

Run:
```bash
cat .gitignore .python-version
```

Expected output:
```
# Python-generated files
__pycache__/
*.py[oc]
build/
dist/
wheels/
*.egg-info

# Virtual environments
.venv
3.14
```

If either file has unexpected content (e.g., secrets, OS-specific noise), stop and report.

- [ ] **Step 2: Stage and commit**

Run:
```bash
git add .gitignore .python-version
git commit -m "chore: track .gitignore and .python-version"
```

Expected: one commit, two files added.

---

## Task 2: Delete the dead calculation backend

Remove the Python code paths that the shipped UI never calls. After this task the only Python code left in `app/` is a static-file server.

**Files:**
- Delete: `app/calculator.py`
- Delete: `app/models.py`
- Delete: `tests/test_calculator.py`
- Delete: `tests/test_models.py`
- Modify: `app/main.py` (drop imports + `/api/calculate` route + defensive guards)
- Modify: `tests/test_api.py` (keep only the static-index check)

- [ ] **Step 1: Confirm nothing else imports the doomed modules**

Run:
```bash
grep -rn "from app.calculator\|from app.models\|import app.calculator\|import app.models" --include="*.py" .
```

Expected output (only the files we're about to delete or modify):
```
./app/main.py:7:from app.calculator import compare_scenarios
./app/main.py:8:from app.models import CalculateRequest, ComparisonResult
./tests/test_api.py:3:from app.main import app
./tests/test_calculator.py:3:from app.calculator import (
./tests/test_calculator.py:11:from app.models import (
./tests/test_models.py:4:from app.models import CalculateRequest, HandpenningSource, HousingType
```

If anything else imports them (e.g., a script or notebook), stop and report.

- [ ] **Step 2: Delete the four doomed files**

Run:
```bash
rm app/calculator.py app/models.py tests/test_calculator.py tests/test_models.py
```

- [ ] **Step 3: Rewrite `app/main.py` as a pure static server**

Replace the entire contents of `app/main.py` with:

```python
from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

app = FastAPI(title="Housecalc", description="Swedish home purchase calculator")

STATIC_DIR = Path(__file__).parent.parent / "static"

app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


@app.get("/")
def index() -> FileResponse:
    return FileResponse(STATIC_DIR / "index.html")
```

Rationale: drop the `if STATIC_DIR.exists()` guards — if the static dir is missing, we want a loud startup failure, not a silent 404.

- [ ] **Step 4: Rewrite `tests/test_api.py` to only test static serving**

Replace the entire contents of `tests/test_api.py` with:

```python
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_static_index_served():
    response = client.get("/")
    assert response.status_code == 200
    assert "<title>Housecalc" in response.text


def test_static_assets_served():
    response = client.get("/static/styles.css")
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/css")
```

The second test is new — cheap insurance that `/static/...` mount is wired up.

- [ ] **Step 5: Run tests**

Run:
```bash
uv run pytest -v
```

Expected: 2 passed (the two tests in `test_api.py`). If anything else fails, stop and investigate.

- [ ] **Step 6: Run lint + format**

Run:
```bash
uv run ruff check .
uv run ruff format --check .
```

Expected: "All checks passed!" + "N files already formatted". If `ruff format --check` complains, run `uv run ruff format .` and re-check.

- [ ] **Step 7: Verify the dev server still boots and serves the UI**

Run (in background):
```bash
uv run uvicorn app.main:app --port 8765 &
SERVER_PID=$!
sleep 1
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:8765/
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:8765/static/app.js
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:8765/static/styles.css
kill $SERVER_PID
```

Expected: three `200` lines. If any returns `404` or `500`, stop and investigate.

- [ ] **Step 8: Commit**

Run:
```bash
git add app/main.py app/calculator.py app/models.py tests/test_api.py tests/test_calculator.py tests/test_models.py
git commit -m "refactor: drop unused calculation backend

The shipped UI does all math in static/app.js — there is zero fetch call
to /api/calculate. Remove the duplicate Python implementation
(calculator.py, models.py, the endpoint, and their tests) so the JS is
the single source of truth. Keep app/main.py as a static-file server."
```

Expected: one commit, 6 files changed (4 deletions, 2 modifications).

---

## Task 3: Prune unused direct dependency

After Task 2, no application code imports `pydantic` directly. FastAPI still pulls it in transitively, so test-time `TestClient` instantiation keeps working. We just stop *declaring* pydantic ourselves.

`httpx` stays in dev deps — `fastapi.testclient.TestClient` requires it.

**Files:**
- Modify: `pyproject.toml`
- Regenerate: `uv.lock`

- [ ] **Step 1: Confirm pydantic is unused at the source level**

Run:
```bash
grep -rn "pydantic" --include="*.py" .
```

Expected: no matches.

- [ ] **Step 2: Edit `pyproject.toml`**

In `pyproject.toml`, find:

```toml
dependencies = [
    "fastapi>=0.115.0",
    "uvicorn[standard]>=0.32.0",
    "pydantic>=2.9.0",
]
```

Replace with:

```toml
dependencies = [
    "fastapi>=0.115.0",
    "uvicorn[standard]>=0.32.0",
]
```

- [ ] **Step 3: Regenerate the lockfile**

Run:
```bash
uv sync
```

Expected: uv resolves the new dep set; `uv.lock` updates. Pydantic stays in `uv.lock` as a transitive dep of FastAPI.

- [ ] **Step 4: Re-run tests to confirm nothing broke**

Run:
```bash
uv run pytest -v
```

Expected: 2 passed.

- [ ] **Step 5: Commit**

Run:
```bash
git add pyproject.toml uv.lock
git commit -m "chore: drop pydantic from direct deps

No application code imports pydantic now that the calculation backend
is gone. It remains available as a FastAPI transitive dep."
```

---

## Task 4: Update `README.md` to match the shipped UI

The README still pitches a "buy vs. wait" comparison that was removed from the UI. Rewrite it.

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Replace README contents**

Replace the entire contents of `README.md` with:

````markdown
# Housecalc

Swedish home-purchase calculator. Live single-page UI that shows the true monthly
cost of a mortgage (with ränteavdrag), one-time costs (stämpelskatt, pantbrev,
lagfart), the impact of FI's amortization tiers, a rate-stress table, a
multi-price compare table, and a payoff timeline that auto-steps amortization
down across LTV tiers.

Output matches Booli/SBAB to the krona for typical Swedish purchases.

## Run

    uv sync
    uv run uvicorn app.main:app --reload

Open http://127.0.0.1:8000/. All calculations happen client-side in
`static/app.js`; the backend only serves static files.

## Test

    uv run pytest

(Two smoke tests verifying static files are served. The calculator math itself
lives in `static/app.js` and is verified visually against Booli/SBAB.)

## Layout

- `app/main.py` — FastAPI static-file server (one route: `GET /`).
- `static/index.html` — single-page UI.
- `static/app.js` — sliders, live recompute, FI tier rules, payoff chart.
- `static/styles.css` — Booli-style layout.

## Rules encoded in the UI

| Rule | Value | Source |
|------|-------|--------|
| LTV cap (bolånetak) | 90% (≥10% kontantinsats) | Finansinspektionen |
| Amortization (FI tiers) | >70% LTV = 2%, 50–70% = 1%, ≤50% = 0%; +1% if loan > 4.5× årsinkomst | Finansinspektionen |
| Stämpelskatt (lagfart) | 1.5% of purchase price | Lantmäteriet |
| Pantbrev stamp duty | 2% of *new* pantbrev + 375 kr | Lantmäteriet |
| Lagfart fee | 825 kr | Lantmäteriet |
| Ränteavdrag | 30% on first 100 000 kr, 21% beyond | Skatteverket |

## Design history

See `docs/superpowers/specs/2026-05-13-housecalc-design.md` for the original
buy-vs-wait spec. The shipped UI diverged (no wait-and-invest scenario, no
backend math) — this README is the source of truth for what actually runs.
````

- [ ] **Step 2: Sanity-check the rendered README**

Run:
```bash
head -40 README.md
```

Verify the document opens, headings are intact, table renders as markdown.

- [ ] **Step 3: Commit**

Run:
```bash
git add README.md
git commit -m "docs: rewrite README to describe the shipped UI

Drop the buy-vs-wait pitch (removed from UI). Document what actually
runs: client-side monthly cost calculator with FI tiers, ränteavdrag,
rate stress, multi-price compare, and payoff timeline."
```

---

## Task 5: Mark the design spec as historical

The spec still describes a wait-and-invest comparison and a backend-driven flow. Rather than rewriting it (the original intent has historical value), add a status banner at the top and a pointer to the README for the shipped UI.

**Files:**
- Modify: `docs/superpowers/specs/2026-05-13-housecalc-design.md`

- [ ] **Step 1: Insert a status banner at the top of the spec**

In `docs/superpowers/specs/2026-05-13-housecalc-design.md`, find the first line:

```markdown
# Housecalc — Swedish Home Purchase Calculator
```

Replace it with:

```markdown
# Housecalc — Swedish Home Purchase Calculator

> **Status: HISTORICAL (v0 design, 2026-05-13).** The shipped UI diverged from
> this spec. The wait-and-invest scenario was dropped (commit `eae60d8`) and
> the calculation backend was removed (commit added by this PR). All math now
> lives in `static/app.js`. See `README.md` for what actually runs today.
> This document is retained for context on the original design intent.
```

- [ ] **Step 2: Commit**

Run:
```bash
git add docs/superpowers/specs/2026-05-13-housecalc-design.md
git commit -m "docs: mark v0 design spec as historical

The shipped UI diverged from the original buy-vs-wait spec. Add a
status banner pointing readers at the README for the current state."
```

---

## Task 6: Final verification

End-to-end sanity check that nothing regressed.

- [ ] **Step 1: Lint, format, tests all clean**

Run:
```bash
uv run ruff check .
uv run ruff format --check .
uv run pytest -v
```

Expected: ruff "All checks passed!", format clean, 2 tests pass.

- [ ] **Step 2: Boot the server and curl every static asset**

Run:
```bash
uv run uvicorn app.main:app --port 8765 &
SERVER_PID=$!
sleep 1
for path in / /static/app.js /static/styles.css /static/index.html; do
  echo "$path -> $(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:8765$path)"
done
kill $SERVER_PID
```

Expected: four `200`s.

- [ ] **Step 3: Open the UI in a browser and exercise the golden path**

Run:
```bash
uv run uvicorn app.main:app &
SERVER_PID=$!
sleep 1
open http://127.0.0.1:8000/
```

(After you've verified manually, `kill $SERVER_PID`.)

Verify:
- Sliders for price / kontantinsats / ränta / amortering / driftkostnad update the hero card live.
- "Du behöver i kontanter" formula breakdown sums correctly.
- Rate-preset buttons (SBAB 2.95% / Booli 3.00% / 3y 3.50%) sync slider + input.
- Tier table and rate-stress table render.
- "+ Lägg till pris" adds a row to the compare table and edits update live.
- Payoff chart renders with two lines (FI minimum vs voluntary 2%) and tooltip shows LTV%.

If any of these regress, stop and investigate before declaring done.

- [ ] **Step 4: Inspect the final diff against `main`**

Run:
```bash
git log main..HEAD --oneline
git diff main...HEAD --stat
```

Expected: the original 25 commits + 5 new commits from this plan (Tasks 1–5). The stat should show net deletions (~700+ lines gone, ~80 lines of doc updates).

- [ ] **Step 5: Confirm no orphaned references**

Run:
```bash
grep -rn "compare_scenarios\|wait_and_invest\|buy_now_scenario\|CalculateRequest\|ComparisonResult\|/api/calculate" --include="*.py" --include="*.md" --include="*.html" --include="*.js" --include="*.css" .
```

Expected: matches only in the (now-banner'd) design spec — the historical doc still describes these by name. Zero matches in any `.py`, `.html`, `.js`, `.css`, or in the README. If a match shows up in live code, stop and clean it.

---

## What this leaves behind

- A static-only frontend served by a 10-line FastAPI app.
- Two smoke tests verifying the server config.
- A README that matches what runs.
- A design spec preserved as historical context, clearly labelled.
- Math rules (stämpelskatt, pantbrev, ränteavdrag, FI tiers) in exactly one place: `static/app.js`.

## What this does NOT do

- Does not add JS unit tests for the math. For a hobby calculator the math is simple and visually verifiable against Booli/SBAB. If you want unit tests later, the natural move is to extract the pure functions from `app.js` into `static/calc.js` as an ES module and add a Node-native `--test` harness — no build step needed. Out of scope for this PR.
- Does not change any user-visible behavior.
- Does not touch the existing 25 commits on the branch.
