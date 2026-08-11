import logging
import traceback

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from app.routers import test, inventario, clientes, ventas, compras, categorias, caja, reportes, consulta, empresa, proveedores
from app.database import engine
from app import models, crud

logger = logging.getLogger("farmasys")

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

@app.exception_handler(Exception)
async def manejar_excepcion_no_controlada(request: Request, exc: Exception):
    # FastAPI registra los handlers de la clase base Exception como el
    # "error_handler" de ServerErrorMiddleware, que en el stack ASGI queda
    # POR FUERA de CORSMiddleware (éste se agrega como user_middleware, que
    # ServerErrorMiddleware envuelve). Por eso la respuesta de este handler
    # nunca pasa por CORSMiddleware y el navegador la reporta como "Failed to
    # fetch" / bloqueo CORS en vez de mostrar el 500 real. Hay que añadir el
    # header de CORS a mano aquí.
    logger.error("Error no controlado en %s %s:\n%s", request.method, request.url.path, traceback.format_exc())
    origin = request.headers.get("origin")
    headers = {"Access-Control-Allow-Origin": origin or "*"}
    return JSONResponse(status_code=500, content={"detail": f"Error interno del servidor: {exc}"}, headers=headers)

app.include_router(test.router)
app.include_router(inventario.router, prefix="/inventario", tags=["Inventario"])
app.include_router(clientes.router, prefix="/clientes", tags=["Clientes"])
app.include_router(proveedores.router, prefix="/proveedores", tags=["Proveedores"])
app.include_router(ventas.router, prefix="/ventas", tags=["Ventas"])
app.include_router(compras.router, prefix="/compras", tags=["Compras"])
app.include_router(categorias.router, prefix="/categorias", tags=["Categorías"])
app.include_router(caja.router, prefix="/caja", tags=["Caja"])
app.include_router(reportes.router, prefix="/reportes", tags=["Reportes"])
app.include_router(consulta.router, prefix="/consulta", tags=["Consulta RUC/DNI"])
app.include_router(empresa.router, prefix="/empresa", tags=["Empresa"])

@app.on_event("startup")
def on_startup():
    from app.database import SessionLocal
    db = SessionLocal()
    try:
        crud.sembrar_categorias_default(db)
    except Exception:
        # El seed de categorías no debe tumbar el arranque del servidor.
        logger.error("Error al sembrar categorías predeterminadas:\n%s", traceback.format_exc())
    finally:
        db.close()

@app.get("/")
def inicio():
    return {
        "mensaje": "Bienvenido a FarmaSys API"
    }