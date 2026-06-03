set shell := ["bash", "-uc"]

# Default: list recipes
default:
    @just --list

# Serve the app on http://127.0.0.1:3000/ and open it in the default browser
dev port='3000':
    ( sleep 1 && open http://127.0.0.1:{{port}}/ ) &
    npx serve . -l {{port}}

# Open the running app in the default browser (if `just dev` is already running)
open port='3000':
    open http://127.0.0.1:{{port}}/

# Open the local file directly via file:// — no server needed
file:
    open index.html

# Run unit tests against the calc code extracted from index.html (Node 18+ required)
test:
    node --test test/calc.test.mjs
