"""
Migración: Agrega campos tipo_documento, serie, numero_documento a la tabla ventas,
y crea la tabla contadores_documento si no existe.

Ejecutar una sola vez:
    python migrate_tipo_documento.py
"""
from app.database import engine
from sqlalchemy import text

def run():
    with engine.connect() as conn:
        # 1. Crear tabla contadores_documento
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS contadores_documento (
                id SERIAL PRIMARY KEY,
                serie VARCHAR(10) UNIQUE NOT NULL,
                ultimo_numero INTEGER NOT NULL DEFAULT 0,
                updated_at TIMESTAMP DEFAULT NOW()
            );
        """))

        # 2. Agregar columnas a ventas (solo si no existen)
        conn.execute(text("""
            ALTER TABLE ventas
                ADD COLUMN IF NOT EXISTS tipo_documento VARCHAR(20) NOT NULL DEFAULT 'NOTA_VENTA',
                ADD COLUMN IF NOT EXISTS serie VARCHAR(10),
                ADD COLUMN IF NOT EXISTS numero_documento VARCHAR(15);
        """))

        conn.commit()
        print("✅ Migración completada.")

if __name__ == "__main__":
    run()
