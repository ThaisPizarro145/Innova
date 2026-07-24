"""
Agrega columnas lote y fecha_vencimiento a movimientos_inventario si no existen.
Ejecutar: python migrate_movimientos_columnas.py
"""
import sys, os
sys.path.insert(0, os.path.dirname(__file__))

from app.database import engine
from sqlalchemy import text

def migrar():
    with engine.connect() as conn:
        # lote
        r = conn.execute(text("""
            SELECT column_name FROM information_schema.columns
            WHERE table_name='movimientos_inventario' AND column_name='lote'
        """))
        if not r.fetchone():
            conn.execute(text("ALTER TABLE movimientos_inventario ADD COLUMN lote VARCHAR(100)"))
            conn.commit()
            print("✅ Columna 'lote' agregada.")
        else:
            print("✅ 'lote' ya existe.")

        # fecha_vencimiento
        r = conn.execute(text("""
            SELECT column_name FROM information_schema.columns
            WHERE table_name='movimientos_inventario' AND column_name='fecha_vencimiento'
        """))
        if not r.fetchone():
            conn.execute(text("ALTER TABLE movimientos_inventario ADD COLUMN fecha_vencimiento DATE"))
            conn.commit()
            print("✅ Columna 'fecha_vencimiento' agregada.")
        else:
            print("✅ 'fecha_vencimiento' ya existe.")

if __name__ == "__main__":
    migrar()
