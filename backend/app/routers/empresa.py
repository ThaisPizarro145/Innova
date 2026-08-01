from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app import crud, schemas
from app.database import get_db

router = APIRouter()

@router.get("", response_model=schemas.EmpresaResponse)
def obtener_empresa(db: Session = Depends(get_db)):
    return crud.get_or_create_empresa(db)

@router.put("", response_model=schemas.EmpresaResponse)
def actualizar_empresa(datos: schemas.EmpresaUpdate, db: Session = Depends(get_db)):
    return crud.actualizar_empresa(db, datos)
