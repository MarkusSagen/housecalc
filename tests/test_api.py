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
