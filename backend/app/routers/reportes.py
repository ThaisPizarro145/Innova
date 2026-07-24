from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from app import crud
from app.database import get_db

router = APIRouter()


@router.get("/resumen")
def resumen(
    periodo: str = Query("mes", description="dia | semana | mes | año | custom"),
    fecha_desde: str = Query("", alias="fecha_desde"),
    fecha_hasta: str = Query("", alias="fecha_hasta"),
    db: Session = Depends(get_db),
):
    """
    Resumen integral: ventas, compras, ganancia, ticket promedio,
    ventas por día y top 10 productos — todo calculado desde la BD.
    """
    return crud.reporte_resumen(db, periodo=periodo, fecha_desde=fecha_desde, fecha_hasta=fecha_hasta)
