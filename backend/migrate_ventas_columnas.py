"""
Migración: agrega columnas faltantes a la tabla ventas y contadores_documento.
Ejecutar una sola vez: python migrate_ventas_columnas.py
"""
import psycopg2
from pathlib import Path

# Leer .env manualmente sin depender de python-dotenv
env = {}
env_path = Path(__file__).resolve().parent / ".env"
if env_path.exists():
    for line in env_path.read_text().splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            env[k.strip()] = v.strip()

conn = psycopg2.connect(
    host=env.get("DB_HOST", "localhost"),
    port=env.get("DB_PORT", "5432"),
    dbname=env.get("DB_NAME", "farmasys"),
    user=env.get("DB_USER", "postgres"),
    password=env.get("DB_PASSWORD", "sa"),
)
conn.autocommit = True
cur = conn.cursor()

columnas = [
    ("ventas", "cliente_nombre",    "VARCHAR(200)"),
    ("ventas", "tipo_documento",    "VARCHAR(20) NOT NULL DEFAULT 'NOTA_VENTA'"),
    ("ventas", "serie",             "VARCHAR(10)"),
    ("ventas", "numero_documento",  "VARCHAR(15)"),
    ("ventas", "venta_rapida",      "BOOLEAN NOT NULL DEFAULT FALSE"),
    ("ventas", "created_at",        "TIMESTAMP DEFAULT NOW()"),
    ("ventas", "updated_at",        "TIMESTAMP DEFAULT NOW()"),
]

for tabla, columna, tipo in columnas:
    cur.execute(f"""
        SELECT column_name FROM information_schema.columns
        WHERE table_name = '{tabla}' AND column_name = '{columna}'
    """)
    if cur.fetchone():
        print(f"  [OK] {tabla}.{columna} ya existe")
    else:
        cur.execute(f"ALTER TABLE {tabla} ADD COLUMN {columna} {tipo}")
        print(f"  [+]  {tabla}.{columna} agregada")

# Crear tabla contadores_documento si no existe
cur.execute("""
    CREATE TABLE IF NOT EXISTS contadores_documento (
        id SERIAL PRIMARY KEY,
        serie VARCHAR(10) UNIQUE NOT NULL,
        ultimo_numero INTEGER NOT NULL DEFAULT 0,
        updated_at TIMESTAMP DEFAULT NOW()
    )
""")
print("  [OK] tabla contadores_documento lista")

cur.close()
conn.close()
print("\nMigración completada.")
