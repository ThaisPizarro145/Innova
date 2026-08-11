from fastapi import APIRouter, Depends, HTTPException, Query
from typing import List, Optional
from sqlalchemy.orm import Session
from app import crud, schemas
from app.database import get_db

router = APIRouter()

@router.get("", response_model=List[schemas.ProveedorResponse])
def listar_proveedores(
    skip: int = 0,
    limit: int = 100,
    query: Optional[str] = Query(None, description="Buscar por nombre o RUC"),
    db: Session = Depends(get_db),
):
    return crud.listar_proveedores(db, skip=skip, limit=limit, query=query)

@router.post("", response_model=schemas.ProveedorResponse)
def crear_proveedor(proveedor: schemas.ProveedorCreate, db: Session = Depends(get_db)):
    try:
        return crud.crear_proveedor(db, proveedor)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error))

@router.get("/{proveedor_id}", response_model=schemas.ProveedorResponse)
def obtener_proveedor(proveedor_id: int, db: Session = Depends(get_db)):
    db_proveedor = crud.get_proveedor(db, proveedor_id)
    if not db_proveedor:
        raise HTTPException(status_code=404, detail="Proveedor no encontrado")
    return db_proveedor

@router.patch("/{proveedor_id}", response_model=schemas.ProveedorResponse)
def actualizar_proveedor(proveedor_id: int, proveedor: schemas.ProveedorUpdate, db: Session = Depends(get_db)):
    try:
        db_proveedor = crud.actualizar_proveedor(db, proveedor_id, proveedor)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error))
    if not db_proveedor:
        raise HTTPException(status_code=404, detail="Proveedor no encontrado")
    return db_proveedor

@router.delete("/{proveedor_id}")
def eliminar_proveedor(proveedor_id: int, db: Session = Depends(get_db)):
    resultado, borrado_fisico = crud.eliminar_proveedor(db, proveedor_id)
    if resultado is None:
        raise HTTPException(status_code=404, detail="Proveedor no encontrado")
    datos = resultado if isinstance(resultado, dict) else schemas.ProveedorResponse.from_orm(resultado).dict()
    datos["borrado_fisico"] = borrado_fisico
    return datos
