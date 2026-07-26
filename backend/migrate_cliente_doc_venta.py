"""
Migración: Agrega columnas cliente_dni y cliente_ruc a la tabla ventas
(snapshot del documento del cliente al momento de la venta, para que
Boleta/Factura conserven el DNI/RUC aunque el cliente se edite después
o la venta se reimprima desde el Historial).

Ejecutar una sola vez:
    python migrate_cliente_doc_venta.py
"""
from app.database import engine
from sqlalchemy import text

def run():
    with engine.connect() as conn:
        conn.execute(text("""
            ALTER TABLE ventas
                ADD COLUMN IF NOT EXISTS cliente_dni VARCHAR(20),
                ADD COLUMN IF NOT EXISTS cliente_ruc VARCHAR(20);
        """))
        conn.commit()
        print("Migracion completada.")

if __name__ == "__main__":
    run()
