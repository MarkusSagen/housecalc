set shell := ["bash", "-uc"]

# Default: list recipes
default:
    @just --list

# Vite dev server for the web app
dev:
    npm run dev

# Core calc + rates pipeline tests (Node 24+)
test:
    npm test

# Typecheck, test, and build the static site into apps/web/dist
check:
    npm run typecheck && npm test && npm run build

# Fetch live bank rates into data/rates/se.json (pass --dry-run to only report)
rates *args:
    node scripts/rates/update.ts {{args}}
