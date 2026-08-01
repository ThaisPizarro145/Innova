from datetime import datetime, date
from sqlalchemy import Column, Integer, String, Boolean, Date, DateTime, Float, ForeignKey, Text, JSON, Index, text
from sqlalchemy.orm import relationship
from app.database import Base


def now():
    return datetime.utcnow()


class Categoria(Base):
    """Categorías de productos (ícono, color, nombre)."""
    __tablename__ = "categorias"

    id = Column(Integer, primary_key=True, index=True)
    nombre = Column(String(150), unique=True, nullable=False, index=True)
    descripcion = Column(String(300), nullable=True)
    icono = Column(String(20), default="📦")
    color = Column(String(20), default="#0f6df2")
    activo = Column(Boolean, default=True)
    eliminado = Column(Boolean, default=False)
    created_at = Column(DateTime, default=now)
    updated_at = Column(DateTime, default=now, onupdate=now)


class EmpresaConfig(Base):
    """Datos de la empresa (fila única, global) mostrados en el encabezado
    de los comprobantes. Antes vivían en localStorage del navegador; ahora
    se guardan en el servidor para que apliquen en todos los dispositivos."""
    __tablename__ = "empresa_config"

    id = Column(Integer, primary_key=True, index=True)
    nombre = Column(String(200), nullable=True)
    ruc = Column(String(20), nullable=True)
    direccion = Column(String(250), nullable=True)
    distrito = Column(String(100), nullable=True)
    provincia = Column(String(100), nullable=True)
    departamento = Column(String(100), nullable=True)
    telefono = Column(String(30), nullable=True)
    email = Column(String(150), nullable=True)
    vendedor = Column(String(150), nullable=True)
    updated_at = Column(DateTime, default=now, onupdate=now)


class CajaMovimiento(Base):
    """Movimientos de caja libre (ingresos/egresos manuales)."""
    __tablename__ = "caja_movimientos"

    id = Column(Integer, primary_key=True, index=True)
    tipo = Column(String(20), nullable=False, default="INGRESO")   # INGRESO | EGRESO
    categoria = Column(String(100), nullable=True)
    descripcion = Column(String(300), nullable=True)
    monto = Column(Float, nullable=False, default=0.0)
    fecha = Column(String(10), nullable=True)   # "YYYY-MM-DD"
    es_recurrente = Column(Boolean, default=False)
    created_at = Column(DateTime, default=now)
    updated_at = Column(DateTime, default=now, onupdate=now)


class CategoriaConfig(Base):
    """
    Configuración de unidades y conversiones por categoría de producto.

    Estructura de unidades_compra (JSON):
      ["saco", "paquete"]  → nombres de las unidades válidas para comprar

    Estructura de unidades_venta (JSON):
      ["kilo", "medio_saco", "saco"]  → nombres de las unidades válidas para vender

    Estructura de conversiones (JSON):
      {
        "saco":       { "tipo": "peso",    "kg": 100 },
        "medio_saco": { "tipo": "fraccion","base": "saco", "factor": 0.5 },
        "caja":       { "tipo": "conteo",  "unidades": 12 },
        "paquete":    { "tipo": "multinivel", "nivel2": "maple", "nivel2_cantidad": 8, "kg_por_empaque": 19.2 },
        "maple":      { "tipo": "conteo",  "unidades": 30 },
        "kilo":       { "tipo": "base_peso" },
        "unidad":     { "tipo": "base_conteo" },
      }

    tipo_flujo_default: flujo de compra sugerido para productos de esta categoría
      "caja_unidad" | "saco_kilo" | "saco_unidad" | "multinivel"
    """
    __tablename__ = "categoria_config"

    id = Column(Integer, primary_key=True, index=True)
    # Nombre de la categoría — debe coincidir con Producto.categoria
    nombre = Column(String(150), unique=True, nullable=False, index=True)
    descripcion = Column(String(300), nullable=True)
    icono = Column(String(20), default="📦")
    color = Column(String(20), default="#0f6df2")

    # Unidades permitidas para compra y venta
    unidades_compra = Column(JSON, nullable=False, default=list)   # ["saco", "caja"]
    unidades_venta  = Column(JSON, nullable=False, default=list)   # ["kilo", "saco"]

    # Tabla de conversiones entre unidades
    conversiones = Column(JSON, nullable=False, default=dict)

    # Flujo de compra por defecto para productos de esta categoría
    tipo_flujo_default = Column(String(30), nullable=True)         # saco_kilo, caja_unidad…

    # Empaque mayor y unidad menor por defecto
    empaque_mayor_default   = Column(String(50), nullable=True)    # "Saco", "Caja", "Paquete"
    unidad_menor_default    = Column(String(50), nullable=True)    # "Kilo", "Unidad"
    nivel2_nombre_default   = Column(String(50), nullable=True)    # "Maple" (solo multinivel)

    # Margen de ganancia sugerido para esta categoría
    margen_ganancia_default = Column(Float, default=20.0)

    activo    = Column(Boolean, default=True)
    eliminado = Column(Boolean, default=False)
    created_at = Column(DateTime, default=now)
    updated_at = Column(DateTime, default=now, onupdate=now)


class Producto(Base):
    __tablename__ = "productos"
    __table_args__ = (
        # Único solo entre productos NO eliminados: permite reingresar un
        # código que quedó "libre" tras un borrado lógico sin chocar contra
        # el UNIQUE global (evita el error 500 al recrear un producto).
        Index(
            "ux_productos_codigo_activo",
            "codigo",
            unique=True,
            postgresql_where=text("eliminado = false"),
        ),
    )

    id = Column(Integer, primary_key=True, index=True)
    codigo = Column(String(80), index=True, nullable=True)
    nombre = Column(String(200), nullable=False)
    categoria = Column(String(150), nullable=True)
    proveedor = Column(String(150), nullable=True)
    laboratorio = Column(String(150), nullable=True)
    lote = Column(String(100), nullable=True)
    fecha_vencimiento = Column(Date, nullable=True)
    costo = Column(Float, default=0.0)
    precio_venta = Column(Float, default=0.0)
    iva = Column(Boolean, default=False)
    utilidad = Column(Float, default=0.0)
    stock_actual = Column(Float, default=0.0)
    stock_minimo = Column(Float, default=0.0)
    unidad_base = Column(String(30), default="unidad")
    precios_presentacion = Column(JSON, nullable=True, default=dict)

    # ── Configuración de empaque / flujo mayorista‑minorista (Módulo 1) ────
    # tipo_flujo: "caja_unidad" | "saco_kilo" | "saco_unidad" | "multinivel"
    tipo_flujo = Column(String(30), nullable=True)
    # Nombre personalizable del empaque mayor (Caja, Saco, Paquete…)
    nombre_empaque_mayor = Column(String(50), nullable=True)
    # nombre de la unidad menor (Unidad, Kilo, Bolsa, Maple…)
    nombre_unidad_menor = Column(String(50), nullable=True)
    # Nombre del nivel intermedio si aplica (Maple)
    nombre_nivel2 = Column(String(50), nullable=True)
    # Factores de conversión y pesos almacenados como JSON
    # Estructura: {
    #   "unidades_por_empaque": 12,   // caja_unidad / saco_unidad
    #   "kg_por_empaque": 50,         // saco_kilo / multinivel
    #   "nivel2_por_empaque": 8,      // multinivel (maples/paquete)
    #   "unidades_por_nivel2": 30,    // multinivel (huevos/maple)
    # }
    equivalencias = Column(JSON, nullable=True, default=dict)
    # Margen de ganancia por defecto para este producto (%)
    margen_ganancia_default = Column(Float, default=20.0)

    activo = Column(Boolean, default=True)
    eliminado = Column(Boolean, default=False)
    created_at = Column(DateTime, default=now)
    updated_at = Column(DateTime, default=now, onupdate=now)

    movimientos = relationship("MovimientoInventario", back_populates="producto")
    detalles_venta = relationship("VentaDetalle", back_populates="producto")


class Cliente(Base):
    __tablename__ = "clientes"
    __table_args__ = (
        # Únicos solo entre clientes NO eliminados y con documento informado:
        # permite reingresar un DNI/RUC que quedó "libre" tras un borrado
        # lógico sin chocar contra el UNIQUE global (evita el error 500).
        Index(
            "ux_clientes_dni_activo",
            "dni",
            unique=True,
            postgresql_where=text("eliminado = false AND dni IS NOT NULL"),
        ),
        Index(
            "ux_clientes_ruc_activo",
            "ruc",
            unique=True,
            postgresql_where=text("eliminado = false AND ruc IS NOT NULL"),
        ),
    )

    id = Column(Integer, primary_key=True, index=True)
    dni = Column(String(20), index=True, nullable=True)
    ruc = Column(String(20), index=True, nullable=True)
    nombre = Column(String(150), nullable=True)
    apellidos = Column(String(150), nullable=True)
    razon_social = Column(String(200), nullable=True)
    direccion = Column(String(250), nullable=True)
    distrito = Column(String(120), nullable=True)
    provincia = Column(String(120), nullable=True)
    departamento = Column(String(120), nullable=True)
    celular = Column(String(30), nullable=True)
    email = Column(String(150), nullable=True)
    fecha_nacimiento = Column(Date, nullable=True)
    observaciones = Column(Text, nullable=True)
    activo = Column(Boolean, default=True)
    eliminado = Column(Boolean, default=False)
    created_at = Column(DateTime, default=now)
    updated_at = Column(DateTime, default=now, onupdate=now)

    ventas = relationship("Venta", back_populates="cliente")


class MovimientoInventario(Base):
    __tablename__ = "movimientos_inventario"

    id = Column(Integer, primary_key=True, index=True)
    producto_id = Column(Integer, ForeignKey("productos.id"), nullable=False)
    tipo = Column(String(50), nullable=False)
    cantidad = Column(Float, nullable=False, default=0.0)
    costo_unitario = Column(Float, default=0.0)
    precio_unitario = Column(Float, default=0.0)
    fecha = Column(DateTime, default=now)
    nota = Column(String(250), nullable=True)
    lote = Column(String(100), nullable=True)
    fecha_vencimiento = Column(Date, nullable=True)
    stock_despues = Column(Float, default=0.0)

    producto = relationship("Producto", back_populates="movimientos")


class ContadorDocumento(Base):
    """Contador de numeración correlativa por serie de documento."""
    __tablename__ = "contadores_documento"

    id = Column(Integer, primary_key=True, index=True)
    serie = Column(String(10), unique=True, nullable=False, index=True)  # NV01, B001, F001
    ultimo_numero = Column(Integer, default=0, nullable=False)
    updated_at = Column(DateTime, default=now, onupdate=now)


class Venta(Base):
    __tablename__ = "ventas"

    id = Column(Integer, primary_key=True, index=True)
    cliente_id = Column(Integer, ForeignKey("clientes.id"), nullable=True)
    fecha = Column(DateTime, default=now)
    subtotal = Column(Float, default=0.0)
    descuento = Column(Float, default=0.0)
    igv = Column(Float, default=0.0)
    total = Column(Float, default=0.0)
    forma_pago = Column(String(50), nullable=False, default="Efectivo")
    estado = Column(String(50), nullable=False, default="COMPLETADA")
    venta_rapida = Column(Boolean, default=False)
    # Tipo de documento y numeración
    tipo_documento = Column(String(20), nullable=False, default="NOTA_VENTA")  # NOTA_VENTA | BOLETA | FACTURA
    serie = Column(String(10), nullable=True)        # NV01, B001, F001
    numero_documento = Column(String(15), nullable=True)  # 00000001
    cliente_nombre = Column(String(200), nullable=True)   # nombre libre si no hay cliente registrado
    cliente_dni = Column(String(20), nullable=True)        # snapshot del DNI del cliente al momento de la venta
    cliente_ruc = Column(String(20), nullable=True)        # snapshot del RUC del cliente al momento de la venta
    created_at = Column(DateTime, default=now)
    updated_at = Column(DateTime, default=now, onupdate=now)

    cliente = relationship("Cliente", back_populates="ventas")
    detalles = relationship("VentaDetalle", back_populates="venta", cascade="all, delete-orphan")
    caja = relationship("Caja", back_populates="venta", uselist=False, cascade="all, delete-orphan")


class VentaDetalle(Base):
    __tablename__ = "ventas_detalles"

    id = Column(Integer, primary_key=True, index=True)
    venta_id = Column(Integer, ForeignKey("ventas.id"), nullable=False)
    producto_id = Column(Integer, ForeignKey("productos.id"), nullable=False)
    cantidad = Column(Float, nullable=False, default=1.0)
    precio_unitario = Column(Float, default=0.0)
    descuento = Column(Float, default=0.0)
    subtotal = Column(Float, default=0.0)
    total = Column(Float, default=0.0)
    lote = Column(String(100), nullable=True)
    fecha_vencimiento = Column(Date, nullable=True)
    presentacion = Column(String(30), nullable=True, default="unidad")
    nombre_producto = Column(String(200), nullable=True)  # guardado en el momento de la venta

    venta = relationship("Venta", back_populates="detalles")
    producto = relationship("Producto", back_populates="detalles_venta")

    @property
    def nombre_producto_display(self):
        return self.nombre_producto or (self.producto.nombre if self.producto else None)


class Caja(Base):
    __tablename__ = "caja"

    id = Column(Integer, primary_key=True, index=True)
    fecha = Column(DateTime, default=now)
    descripcion = Column(String(250), nullable=True)
    ingreso = Column(Float, default=0.0)
    egreso = Column(Float, default=0.0)
    venta_id = Column(Integer, ForeignKey("ventas.id"), nullable=True)

    venta = relationship("Venta", back_populates="caja")


# ── Compras ────────────────────────────────────────────────────────────────────

class Compra(Base):
    """Cabecera de una orden de compra a proveedor."""
    __tablename__ = "compras"

    id = Column(Integer, primary_key=True, index=True)
    numero = Column(String(50), nullable=True)           # Nro. factura / guía proveedor
    proveedor = Column(String(200), nullable=True)
    fecha = Column(DateTime, default=now)
    subtotal = Column(Float, default=0.0)
    igv = Column(Float, default=0.0)
    total = Column(Float, default=0.0)
    estado = Column(String(30), default="RECIBIDA")       # RECIBIDA | PENDIENTE | ANULADA
    observaciones = Column(Text, nullable=True)
    created_at = Column(DateTime, default=now)
    updated_at = Column(DateTime, default=now, onupdate=now)

    detalles = relationship("CompraDetalle", back_populates="compra", cascade="all, delete-orphan")


class CompraDetalle(Base):
    """
    Línea de detalle de compra con toda la lógica de desglose mayorista/minorista.

    Tipos de presentación soportados:
      - caja_unidad    → Caso A: Aceite (caja de N unidades)
      - saco_kilo      → Caso B: Menestras (saco con peso en kg)
      - saco_unidad    → Caso C: Sal (saco con N bolsas internas)
      - multinivel     → Caso D: Huevos (paquete → maples → kg)
    """
    __tablename__ = "compras_detalles"

    id = Column(Integer, primary_key=True, index=True)
    compra_id = Column(Integer, ForeignKey("compras.id"), nullable=False)
    producto_id = Column(Integer, ForeignKey("productos.id"), nullable=False)

    # ── Datos del empaque comprado ──────────────────────────────────────────
    tipo_presentacion = Column(String(30), nullable=False, default="caja_unidad")
    # Cantidad de empaques comprados (cajas, sacos, paquetes, etc.)
    cantidad_empaque = Column(Float, default=1.0)
    # Nombre del empaque mayor (Caja, Saco, Paquete…)
    nombre_empaque = Column(String(50), default="Caja")
    # Precio pagado por UN empaque mayor
    precio_empaque = Column(Float, default=0.0)

    # ── Contenido del empaque ───────────────────────────────────────────────
    # Unidades/bolsas internas por empaque (Casos A, C, D‑maples)
    unidades_por_empaque = Column(Float, nullable=True)
    # Peso en kg por empaque (Casos B, D)
    kg_por_empaque = Column(Float, nullable=True)
    # Nivel intermedio para multinivel (Caso D: maples por paquete)
    nivel2_cantidad = Column(Float, nullable=True)   # maples / paquete
    nivel2_nombre = Column(String(50), nullable=True)  # "Maple"
    # Unidades dentro del nivel 2 (Caso D: huevos por maple)
    unidades_por_nivel2 = Column(Float, nullable=True)

    # ── Costos calculados (almacenados para auditoría) ──────────────────────
    costo_empaque = Column(Float, default=0.0)      # = precio_empaque (o precio_total / cant)
    costo_unitario = Column(Float, default=0.0)     # costo por unidad menor (unidad, kilo)
    costo_nivel2 = Column(Float, nullable=True)      # costo por nivel intermedio (maple)

    # ── Precios de venta sugeridos ──────────────────────────────────────────
    porcentaje_ganancia = Column(Float, default=20.0)
    precio_venta_empaque = Column(Float, default=0.0)   # PVP por empaque mayor
    precio_venta_unitario = Column(Float, default=0.0)  # PVP por unidad/kg menor
    precio_venta_nivel2 = Column(Float, nullable=True)  # PVP por nivel medio (maple)

    # ── Stock ingresado ─────────────────────────────────────────────────────
    # Unidades base que se agregan al inventario
    stock_ingresado = Column(Float, default=0.0)
    unidad_stock = Column(String(30), default="unidad")  # unidad | kilo

    lote = Column(String(100), nullable=True)
    fecha_vencimiento = Column(Date, nullable=True)

    compra = relationship("Compra", back_populates="detalles")
    producto = relationship("Producto")
