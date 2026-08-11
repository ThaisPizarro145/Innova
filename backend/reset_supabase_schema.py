"""
Reset de esquema en Supabase: descarta los datos de prueba del modelo
"bodega" anterior y recrea el esquema simplificado de farmacia
(Caja/Unidad/Blíster, productos.categoria_id -> categorias.id).

- Preserva `empresa_config` (datos reales de la empresa).
- Elimina todas las demás tablas de la app y las vuelve a crear desde
  app.models (incluye el nuevo esquema de Producto/CompraDetalle).

Ejecutar una sola vez: `python reset_supabase_schema.py`
"""
from sqlalchemy import text
from app.database import engine
from app import models

TABLAS_A_BORRAR = [
    "movimientos_inventario",
    "ventas_detalles",
    "ventas",
    "caja",
    "caja_aperturas",
    "compras_detalles",
    "lotes",
    "compras",
    "productos",
    "proveedores",
    "clientes",
    "categoria_config",
    "categorias",
    "contadores_documento",
    "caja_movimientos",
]


def main():
    with engine.begin() as conn:
        for tabla in TABLAS_A_BORRAR:
            conn.execute(text(f"DROP TABLE IF EXISTS {tabla} CASCADE"))
            print(f"Tabla eliminada (si existía): {tabla}")

    print("Recreando esquema con los modelos actuales...")
    models.Base.metadata.create_all(bind=engine)
    print("Esquema recreado.")

    with engine.connect() as conn:
        tablas_verificar = [t for t in TABLAS_A_BORRAR if t != "categoria_config"] + ["empresa_config"]
        for tabla in tablas_verificar:
            count = conn.execute(text(f"SELECT COUNT(*) FROM {tabla}")).scalar()
            print(f"{tabla}: {count} filas")


if __name__ == "__main__":
    main()
