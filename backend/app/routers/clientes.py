from fastapi import APIRouter, Depends, HTTPException, Query
from typing import List, Optional
from sqlalchemy.orm import Session
from app import crud, schemas
from app.database import get_db

router = APIRouter()

@router.get("", response_model=List[schemas.ClienteResponse])
def listar_clientes(
    skip: int = 0,
    limit: int = 100,
    query: Optional[str] = Query(None, description="Buscar por DNI, nombre, apellido o razón social"),
    db: Session = Depends(get_db),
):
    return crud.listar_clientes(db, skip=skip, limit=limit, query=query)

@router.post("", response_model=schemas.ClienteResponse)
def crear_cliente(cliente: schemas.ClienteCreate, db: Session = Depends(get_db)):
    try:
        return crud.crear_cliente(db, cliente)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error))

@router.get("/{cliente_id}", response_model=schemas.ClienteResponse)
def obtener_cliente(cliente_id: int, db: Session = Depends(get_db)):
    db_cliente = crud.get_cliente(db, cliente_id)
    if not db_cliente:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")
    return db_cliente

@router.get("/{cliente_id}/historial", response_model=List[schemas.VentaResponse])
def historial_cliente(
    cliente_id: int,
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
):
    cliente = crud.get_cliente(db, cliente_id)
    if not cliente:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")
    return crud.listar_ventas_por_cliente(db, cliente_id, skip=skip, limit=limit)

@router.patch("/{cliente_id}", response_model=schemas.ClienteResponse)
def actualizar_cliente(cliente_id: int, cliente: schemas.ClienteUpdate, db: Session = Depends(get_db)):
    try:
        db_cliente = crud.actualizar_cliente(db, cliente_id, cliente)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error))
    if not db_cliente:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")
    return db_cliente

@router.delete("/{cliente_id}", response_model=schemas.ClienteResponse)
def eliminar_cliente(cliente_id: int, db: Session = Depends(get_db)):
    db_cliente = crud.eliminar_cliente(db, cliente_id)
    if not db_cliente:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")
    return db_cliente

@router.get("/reporte/frecuentes")
def clientes_frecuentes(db: Session = Depends(get_db)):
    return crud.reporte_clientes_frecuentes(db)

@router.get("/reporte/nuevos")
def clientes_nuevos(db: Session = Depends(get_db)):
    return crud.reporte_clientes_nuevos(db)
