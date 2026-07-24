from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List, Optional

from app import crud, schemas
from app.database import get_db

router = APIRouter()


@router.get("", response_model=List[schemas.CompraResponse])
def listar_compras(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
):
    return crud.listar_compras(db, skip=skip, limit=limit)


@router.post("", response_model=schemas.CompraResponse)
def registrar_compra(compra: schemas.CompraCreate, db: Session = Depends(get_db)):
    try:
        return crud.registrar_compra(db, compra)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/{compra_id}", response_model=schemas.CompraResponse)
def get_compra(compra_id: int, db: Session = Depends(get_db)):
    compra = crud.get_compra(db, compra_id)
    if not compra:
        raise HTTPException(status_code=404, detail="Compra no encontrada")
    return compra


@router.post("/{compra_id}/anular", response_model=schemas.CompraResponse)
def anular_compra(compra_id: int, db: Session = Depends(get_db)):
    try:
        compra = crud.anular_compra(db, compra_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    if not compra:
        raise HTTPException(status_code=404, detail="Compra no encontrada")
    return compra


@router.post("/preview", response_model=dict)
def preview_calculo(item: schemas.CompraDetalleCreate, db: Session = Depends(get_db)):
    """
    Calcula costos y precios sugeridos sin persistir.
    Lee las equivalencias configuradas en la ficha del producto si no se pasan explícitamente.
    """
    try:
        return crud.calcular_preview_compra(item, db)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
