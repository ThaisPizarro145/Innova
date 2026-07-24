from fastapi import APIRouter
from sqlalchemy import text
from app.database import engine

router = APIRouter()

@router.get("/test-db")
def test_db():
    with engine.connect() as conn:
        conn.execute(text("SELECT 1"))

    return {"mensaje": "Conexión exitosa con PostgreSQL"}