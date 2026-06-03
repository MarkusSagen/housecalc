set shell := ["bash", "-uc"]

# Default: list recipes
default:
    @just --list

# Serve the app locally on http://127.0.0.1:8000/
dev port='8000':
    python3 -m http.server {{port}}

# Open the running app in the default browser
open:
    open http://127.0.0.1:8000/
