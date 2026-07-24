"""
Agrega la columna nombre_producto a ventas_detalles si no existe.
Ejecutar: python migrate_nombre_producto_detalle.py
"""
import sys
import os
sys.path.insert(0, os.path.dirname(__file__))

from app.database import engine
from sqlalchemy import text

def migrar():
    with engine.connect() as conn:
        # Verificar si la columna ya existe
        result = conn.execute(text("""
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name='ventas_detalles' AND column_name='nombre_producto'
        """))
        if result.fetchone():
            print("✅ La columna nombre_producto ya existe en ventas_detalles.")
            return

        # Agregar la columna
        conn.execute(text("""
            ALTER TABLE ventas_detalles 
            ADD COLUMN nombre_producto VARCHAR(200)
        """))
        conn.commit()

        # Rellenar con nombres actuales desde la tabla productos
        conn.execute(text("""
            UPDATE ventas_detalles vd
            SET nombre_producto = p.nombre
            FROM productos p
            WHERE vd.producto_id = p.id
              AND vd.nombre_producto IS NULL
        """))
        conn.commit()
        print("✅ Columna nombre_producto agregada y datos históricos rellenados.")

if __name__ == "__main__":
    migrar()
