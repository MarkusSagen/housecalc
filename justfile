set shell := ["bash", "-uc"]

# Default: list recipes
default:
    @just --list

# Sync deps
sync:
    uv sync

# Run the app locally with auto-reload
dev:
    uv run uvicorn app.main:app --reload

# Run tests
test *args='':
    uv run pytest {{args}}

# Lint
lint *args='.':
    uv run ruff check {{args}}

# Format and auto-fix lint
format *args='.':
    uv run ruff check --fix {{args}}
    uv run ruff format {{args}}

# Check without modifying
check:
    uv run ruff check .
    uv run ruff format --check .

# Clean caches and build artifacts
clean:
    find . -type d -name "__pycache__" -prune -exec rm -rf {} + 2>/dev/null || true
    find . -type d -name ".pytest_cache" -prune -exec rm -rf {} + 2>/dev/null || true
    find . -type d -name ".ruff_cache" -prune -exec rm -rf {} + 2>/dev/null || true
    rm -rf dist/ build/ *.egg-info 2>/dev/null || true
