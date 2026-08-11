from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import Dict, List, Optional
from app import crud, schemas
from app.database import get_db

router = APIRouter()

@router.get("/productos", response_model=List[schemas.ProductoResponse])
def listar_productos(
    skip: int = 0,
    limit: int = 100,
    query: Optional[str] = Query(None, description="Buscar por nombre, laboratorio, marca o categoría"),
    db: Session = Depends(get_db),
):
    return crud.listar_productos(db, skip=skip, limit=limit, query=query)

@router.post("/productos", response_model=schemas.ProductoResponse)
def crear_producto(producto: schemas.ProductoCreate, db: Session = Depends(get_db)):
    try:
        return crud.crear_producto(db, producto)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error))

@router.patch("/productos/{producto_id}", response_model=schemas.ProductoResponse)
def actualizar_producto(producto_id: int, producto: schemas.ProductoUpdate, db: Session = Depends(get_db)):
    try:
        db_producto = crud.actualizar_producto(db, producto_id, producto)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error))
    if not db_producto:
        raise HTTPException(status_code=404, detail="Producto no encontrado")
    return db_producto

@router.patch("/productos/{producto_id}/precios", response_model=schemas.ProductoResponse)
def actualizar_precios_presentacion(
    producto_id: int,
    precios: Dict[str, float],
    db: Session = Depends(get_db),
):
    """Actualiza solo el dict precios_presentacion de un producto (precios independientes por presentación)."""
    producto = crud.get_producto(db, producto_id)
    if not producto:
        raise HTTPException(status_code=404, detail="Producto no encontrado")
    # Merge: conservar claves existentes y sobreescribir las enviadas
    nuevos = dict(producto.precios_presentacion or {})
    nuevos.update({k: float(v) for k, v in precios.items() if float(v) >= 0})
    producto.precios_presentacion = nuevos
    import datetime
    producto.updated_at = datetime.datetime.utcnow()
    db.commit()
    db.refresh(producto)
    crud.enriquecer_producto(db, producto)
    return producto

@router.delete("/productos/{producto_id}", response_model=schemas.ProductoResponse)
def eliminar_producto(producto_id: int, db: Session = Depends(get_db)):
    db_producto = crud.eliminar_producto(db, producto_id)
    if not db_producto:
        raise HTTPException(status_code=404, detail="Producto no encontrado")
    return db_producto

@router.get("/lotes", response_model=List[schemas.LoteResponse])
def listar_lotes(
    producto_id: Optional[int] = Query(None),
    solo_disponibles: bool = Query(False),
    db: Session = Depends(get_db),
):
    return crud.listar_lotes(db, producto_id=producto_id, solo_disponibles=solo_disponibles)

@router.post("/movimientos", response_model=schemas.MovimientoInventarioResponse)
def crear_movimiento(movimiento: schemas.MovimientoInventarioCreate, db: Session = Depends(get_db)):
    """Solo ajustes manuales (AJUSTE_POSITIVO / AJUSTE_NEGATIVO) — ENTRADA/SALIDA
    los genera el sistema desde Compras/Ventas."""
    try:
        return crud.crear_movimiento_inventario(db, movimiento)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error))

@router.get("/movimientos", response_model=List[schemas.MovimientoInventarioResponse])
def listar_movimientos(
    producto_id: Optional[int] = Query(None),
    skip: int = 0,
    limit: int = 200,
    db: Session = Depends(get_db),
):
    return crud.listar_movimientos(db, skip=skip, limit=limit, producto_id=producto_id)

@router.patch("/movimientos/{movimiento_id}", response_model=schemas.MovimientoInventarioResponse)
def actualizar_movimiento(movimiento_id: int, datos: schemas.MovimientoInventarioUpdate, db: Session = Depends(get_db)):
    try:
        mov = crud.actualizar_movimiento(db, movimiento_id, datos.dict(exclude_none=False))
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error))
    if not mov:
        raise HTTPException(status_code=404, detail="Movimiento no encontrado")
    return mov

@router.delete("/movimientos/{movimiento_id}")
def eliminar_movimiento(movimiento_id: int, db: Session = Depends(get_db)):
    try:
        mov = crud.eliminar_movimiento(db, movimiento_id)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error))
    if not mov:
        raise HTTPException(status_code=404, detail="Movimiento no encontrado")
    return {"ok": True, "id": movimiento_id}

@router.get("/reportes/vencidos", response_model=List[schemas.LoteResponse])
def productos_vencidos(db: Session = Depends(get_db)):
    return crud.reporte_productos_vencidos(db)

@router.get("/reportes/stock-bajo", response_model=List[schemas.ProductoResponse])
def stock_bajo(db: Session = Depends(get_db)):
    return crud.reporte_stock_bajo(db)

@router.get("/reportes/sin-stock", response_model=List[schemas.ProductoResponse])
def sin_stock(db: Session = Depends(get_db)):
    return crud.reporte_sin_stock(db)

@router.get("/reportes/proximos-vencer", response_model=List[schemas.LoteResponse])
def proximos_vencer(dias: int = Query(30, ge=1), db: Session = Depends(get_db)):
    return crud.reporte_proximos_vencer(db, dias=dias)
