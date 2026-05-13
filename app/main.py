from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app.calculator import compare_scenarios
from app.models import CalculateRequest, ComparisonResult

app = FastAPI(title="Housecalc", description="Swedish home purchase calculator")

STATIC_DIR = Path(__file__).parent.parent / "static"


@app.post("/api/calculate", response_model=ComparisonResult)
def calculate(req: CalculateRequest) -> ComparisonResult:
    try:
        return compare_scenarios(req)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))


if STATIC_DIR.exists():
    app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

if (STATIC_DIR / "index.html").exists():

    @app.get("/")
    def index():
        return FileResponse(STATIC_DIR / "index.html")
