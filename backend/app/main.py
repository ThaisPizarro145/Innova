from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from app.routers import test, inventario, clientes, ventas, compras, categorias_config, categorias, caja, reportes
from app.database import engine
from app import models, crud

models.Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="FarmaSys API",
    version="1.0.0",
    redirect_slashes=False,
)

import os

# Permitir orígenes locales y de producción (Vercel, Render, etc.)
ALLOWED_ORIGINS_ENV = os.getenv("ALLOWED_ORIGINS", "")
EXTRA_ORIGINS = [origin.strip() for origin in ALLOWED_ORIGINS_ENV.split(",") if origin.strip()]

ORIGINS = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:5174",
    "http://127.0.0.1:5174",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:8001",
    "http://127.0.0.1:8001",
] + EXTRA_ORIGINS

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(test.router)
app.include_router(inventario.router, prefix="/inventario", tags=["Inventario"])
app.include_router(clientes.router, prefix="/clientes", tags=["Clientes"])
app.include_router(ventas.router, prefix="/ventas", tags=["Ventas"])
app.include_router(compras.router, prefix="/compras", tags=["Compras"])
app.include_router(categorias.router, prefix="/categorias", tags=["Categorías"])
app.include_router(categorias_config.router, prefix="/categorias-config", tags=["Categorías Config"])
app.include_router(caja.router, prefix="/caja", tags=["Caja"])
app.include_router(reportes.router, prefix="/reportes", tags=["Reportes"])

@app.on_event("startup")
def on_startup():
    """Sembrar categorías predeterminadas al arrancar si no existen."""
    from app.database import SessionLocal
    db = SessionLocal()
    try:
        crud.sembrar_categorias_default(db)
    finally:
        db.close()

@app.get("/")
def inicio():
    return {
        "mensaje": "Bienvenido a FarmaSys API"
    }