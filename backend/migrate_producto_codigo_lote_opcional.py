"""
Migración: el código y el lote de un producto ya no se digitan a mano.
El identificador de cada producto pasa a ser el id autoincremental de la
tabla (igual que en Supabase). El código se sigue guardando (autogenerado
como "P-000N") por compatibilidad con reportes y búsquedas existentes.

Cambios:
  - productos.codigo pasa a ser NULLABLE (antes era obligatorio)

Ejecutar una sola vez desde la carpeta backend/:
    python migrate_producto_codigo_lote_opcional.py
"""
from app.database import engine
from sqlalchemy import text


def run():
    with engine.connect() as conn:
        conn.execute(text("""
            ALTER TABLE productos
                ALTER COLUMN codigo DROP NOT NULL;
        """))
        conn.commit()
        print("Migracion completada: productos.codigo ahora es opcional (se autogenera desde el id).")


if __name__ == "__main__":
    run()
