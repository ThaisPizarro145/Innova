from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from app import crud, schemas
from app.database import get_db

router = APIRouter()


@router.get("/movimientos", response_model=List[schemas.CajaMovimientoResponse])
def listar(skip: int = 0, limit: int = 500, db: Session = Depends(get_db)):
    return crud.listar_caja_movimientos(db, skip=skip, limit=limit)


@router.post("/movimientos", response_model=schemas.CajaMovimientoResponse)
def crear(data: schemas.CajaMovimientoCreate, db: Session = Depends(get_db)):
    try:
        return crud.crear_caja_movimiento(db, data)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/movimientos/{movimiento_id}")
def eliminar(movimiento_id: int, db: Session = Depends(get_db)):
    obj = crud.eliminar_caja_movimiento(db, movimiento_id)
    if not obj:
        raise HTTPException(status_code=404, detail="Movimiento no encontrado")
    return {"ok": True}
