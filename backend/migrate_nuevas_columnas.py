"""
Migración: Agrega columnas faltantes:
  - movimientos_inventario: lote, fecha_vencimiento
  - ventas: cliente_nombre

Ejecutar una sola vez desde la carpeta backend/:
    python migrate_nuevas_columnas.py
"""
from app.database import engine
from sqlalchemy import text


def run():
    with engine.connect() as conn:
        # 1. Columnas en movimientos_inventario
        conn.execute(text("""
            ALTER TABLE movimientos_inventario
                ADD COLUMN IF NOT EXISTS lote VARCHAR(100),
                ADD COLUMN IF NOT EXISTS fecha_vencimiento DATE;
        """))

        # 2. Columna cliente_nombre en ventas
        conn.execute(text("""
            ALTER TABLE ventas
                ADD COLUMN IF NOT EXISTS cliente_nombre VARCHAR(200);
        """))

        conn.commit()
        print("✅ Migración completada: columnas lote, fecha_vencimiento y cliente_nombre agregadas.")


if __name__ == "__main__":
    run()
