from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from app import crud, schemas
from app.database import get_db

router = APIRouter()


@router.get("", response_model=List[schemas.CategoriaConfigResponse])
def listar(db: Session = Depends(get_db)):
    return crud.listar_categorias_config(db)


@router.post("", response_model=schemas.CategoriaConfigResponse)
def crear(data: schemas.CategoriaConfigCreate, db: Session = Depends(get_db)):
    try:
        return crud.crear_categoria_config(db, data)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/por-nombre/{nombre}", response_model=schemas.CategoriaConfigResponse)
def obtener_por_nombre(nombre: str, db: Session = Depends(get_db)):
    obj = crud.get_categoria_config_por_nombre(db, nombre)
    if not obj:
        raise HTTPException(status_code=404, detail="Categoría no encontrada")
    return obj


@router.get("/{categoria_id}", response_model=schemas.CategoriaConfigResponse)
def obtener(categoria_id: int, db: Session = Depends(get_db)):
    obj = crud.get_categoria_config(db, categoria_id)
    if not obj:
        raise HTTPException(status_code=404, detail="Categoría no encontrada")
    return obj


@router.patch("/{categoria_id}", response_model=schemas.CategoriaConfigResponse)
def actualizar(categoria_id: int, data: schemas.CategoriaConfigUpdate, db: Session = Depends(get_db)):
    obj = crud.actualizar_categoria_config(db, categoria_id, data)
    if not obj:
        raise HTTPException(status_code=404, detail="Categoría no encontrada")
    return obj


@router.delete("/{categoria_id}")
def eliminar(categoria_id: int, db: Session = Depends(get_db)):
    obj = crud.eliminar_categoria_config(db, categoria_id)
    if not obj:
        raise HTTPException(status_code=404, detail="Categoría no encontrada")
    return {"ok": True}


@router.post("/calcular-precios", response_model=schemas.CalculoPrecioResponse)
def calcular_precios(req: schemas.CalculoPrecioRequest, db: Session = Depends(get_db)):
    """
    Calcula precios sugeridos de venta para todas las unidades de la categoría
    dado el costo de compra en una unidad específica.
    """
    try:
        return crud.calcular_precios_por_categoria(
            db=db,
            categoria_nombre=req.categoria_nombre,
            unidad_compra=req.unidad_compra,
            costo_compra=req.costo_compra,
            cantidad_comprada=req.cantidad_comprada,
            margen_ganancia=req.margen_ganancia,
            factor_override=req.factor_override,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/sembrar-defaults")
def sembrar(db: Session = Depends(get_db)):
    """Inserta las categorías predeterminadas (idempotente)."""
    crud.sembrar_categorias_default(db)
    return {"ok": True, "message": "Categorías predeterminadas sembradas"}
