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


@router.get("/apertura-activa", response_model=schemas.CajaAperturaResponse)
def apertura_activa(db: Session = Depends(get_db)):
    apertura = crud.get_apertura_activa(db)
    if not apertura:
        raise HTTPException(status_code=404, detail="No hay una caja abierta")
    return apertura


@router.post("/apertura", response_model=schemas.CajaAperturaResponse)
def abrir(data: schemas.CajaAperturaCreate, db: Session = Depends(get_db)):
    try:
        return crud.abrir_caja(db, data)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/cierre", response_model=schemas.CajaAperturaResponse)
def cerrar(data: schemas.CajaAperturaCierre, db: Session = Depends(get_db)):
    try:
        return crud.cerrar_caja(db, data)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/aperturas", response_model=List[schemas.CajaAperturaResponse])
def listar_aperturas(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    return crud.listar_caja_aperturas(db, skip=skip, limit=limit)
