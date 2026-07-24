from fastapi import APIRouter, Depends, HTTPException, Query
from typing import List, Optional
from sqlalchemy.orm import Session
from app import crud, schemas
from app.database import get_db

router = APIRouter()

@router.post("", response_model=schemas.VentaResponse)
def crear_venta(venta: schemas.VentaCreate, db: Session = Depends(get_db)):
    try:
        return crud.registrar_venta(db, venta)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error))

@router.get("", response_model=List[schemas.VentaResponse])
def listar_ventas(
    skip: int = 0,
    limit: int = 500,
    query: Optional[str] = Query(None, description="Buscar por cliente, forma de pago o estado"),
    fecha_desde: Optional[str] = Query(None, description="Fecha inicio YYYY-MM-DD"),
    fecha_hasta: Optional[str] = Query(None, description="Fecha fin YYYY-MM-DD"),
    db: Session = Depends(get_db),
):
    return crud.listar_ventas(db, skip=skip, limit=limit, query=query, fecha_desde=fecha_desde, fecha_hasta=fecha_hasta)

# ── Reportes (deben ir ANTES de /{venta_id} para evitar conflicto de rutas) ──

@router.get("/reportes/diarias")
def ventas_diarias(db: Session = Depends(get_db)):
    return crud.reporte_ventas_diarias(db)

@router.get("/reportes/mensuales")
def ventas_mensuales(db: Session = Depends(get_db)):
    return crud.reporte_ventas_mensuales(db)

@router.get("/reportes/mas-vendidos")
def productos_mas_vendidos(limit: int = 10, db: Session = Depends(get_db)):
    return crud.reporte_productos_mas_vendidos(db, limit=limit)

@router.get("/reportes/menos-vendidos")
def productos_menos_vendidos(limit: int = 10, db: Session = Depends(get_db)):
    return crud.reporte_productos_menos_vendidos(db, limit=limit)

@router.get("/reportes/stock")
def reporte_stock(db: Session = Depends(get_db)):
    return crud.reporte_stock_actual(db)

@router.get("/reportes/vencidos")
def reporte_vencidos(db: Session = Depends(get_db)):
    return crud.reporte_productos_vencidos(db)

# ── Operaciones por ID (deben ir DESPUÉS de las rutas literales) ──────────────

@router.get("/{venta_id}", response_model=schemas.VentaResponse)
def obtener_venta(venta_id: int, db: Session = Depends(get_db)):
    venta = crud.get_venta(db, venta_id)
    if not venta:
        raise HTTPException(status_code=404, detail="Venta no encontrada")
    return venta

@router.post("/{venta_id}/anular", response_model=schemas.VentaResponse)
def anular_venta(venta_id: int, db: Session = Depends(get_db)):
    venta = crud.anular_venta(db, venta_id)
    if not venta:
        raise HTTPException(status_code=404, detail="Venta no encontrada")
    return venta

@router.delete("/{venta_id}")
def eliminar_venta(venta_id: int, db: Session = Depends(get_db)):
    venta = crud.eliminar_venta(db, venta_id)
    if not venta:
        raise HTTPException(status_code=404, detail="Venta no encontrada")
    return {"ok": True, "id": venta_id}
