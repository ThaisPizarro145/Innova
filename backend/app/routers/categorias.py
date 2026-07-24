from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from app import crud, schemas
from app.database import get_db

router = APIRouter()


@router.get("", response_model=List[schemas.CategoriaResponse])
def listar(db: Session = Depends(get_db)):
    return crud.listar_categorias(db)


@router.post("", response_model=schemas.CategoriaResponse)
def crear(data: schemas.CategoriaCreate, db: Session = Depends(get_db)):
    try:
        return crud.crear_categoria(db, data)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/{categoria_id}", response_model=schemas.CategoriaResponse)
def obtener(categoria_id: int, db: Session = Depends(get_db)):
    obj = crud.get_categoria(db, categoria_id)
    if not obj:
        raise HTTPException(status_code=404, detail="Categoría no encontrada")
    return obj


@router.patch("/{categoria_id}", response_model=schemas.CategoriaResponse)
def actualizar(categoria_id: int, data: schemas.CategoriaUpdate, db: Session = Depends(get_db)):
    obj = crud.actualizar_categoria(db, categoria_id, data)
    if not obj:
        raise HTTPException(status_code=404, detail="Categoría no encontrada")
    return obj


@router.delete("/{categoria_id}")
def eliminar(categoria_id: int, db: Session = Depends(get_db)):
    obj = crud.eliminar_categoria(db, categoria_id)
    if not obj:
        raise HTTPException(status_code=404, detail="Categoría no encontrada")
    return {"ok": True}
