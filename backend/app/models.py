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


class Producto(Base):
    """Datos fijos/maestros del medicamento. El costo, lote, fecha de
    vencimiento y stock NO viven aquí: pertenecen a Compras (ver `Lote`) y se
    consultan de forma agregada/calculada (ver `crud.py`)."""
    __tablename__ = "productos"

    id = Column(Integer, primary_key=True, index=True)
    nombre = Column(String(200), nullable=False)
    categoria_id = Column(Integer, ForeignKey("categorias.id"), nullable=False)
    laboratorio = Column(String(150), nullable=True)
    marca = Column(String(150), nullable=True)
    principio_activo = Column(String(200), nullable=True)
    concentracion = Column(String(100), nullable=True)
    forma_farmaceutica = Column(String(100), nullable=True)
    presentacion_comercial = Column(String(150), nullable=True)
    iva = Column(Boolean, default=False)
    stock_minimo = Column(Float, default=0.0)
    unidad_base = Column(String(30), default="unidad")
    # Precio de venta VIGENTE por presentación (se recalcula en cada compra):
    # { "Caja": x, "Unidad": y, "Blister": z }
    precios_presentacion = Column(JSON, nullable=True, default=dict)

    # ── Presentaciones fijas: Caja / Unidad / Blíster ───────────────────────
    # Cuántas unidades base contiene una Caja / un Blíster de este producto.
    # Null = esa presentación no aplica para este producto.
    unidades_por_caja = Column(Float, nullable=True)
    unidades_por_blister = Column(Float, nullable=True)

    activo = Column(Boolean, default=True)
    eliminado = Column(Boolean, default=False)
    created_at = Column(DateTime, default=now)
    updated_at = Column(DateTime, default=now, onupdate=now)

    categoria = relationship("Categoria")
    movimientos = relationship("MovimientoInventario", back_populates="producto")
    detalles_venta = relationship("VentaDetalle", back_populates="producto")
    lotes = relationship("Lote", back_populates="producto")


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
    lote_id = Column(Integer, ForeignKey("lotes.id"), nullable=True)
    venta_id = Column(Integer, ForeignKey("ventas.id"), nullable=True)
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
    lote_obj = relationship("Lote")


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
    numero = Column(String(50), nullable=True)           # Nro. de comprobante del proveedor
    tipo_comprobante = Column(String(30), nullable=True)  # Factura | Boleta | Guía
    serie = Column(String(10), nullable=True)
    moneda = Column(String(10), nullable=True, default="PEN")  # solo informativo, sin conversión
    proveedor_id = Column(Integer, ForeignKey("proveedores.id"), nullable=True)
    proveedor_nombre = Column(String(200), nullable=True)  # snapshot al momento de la compra
    fecha = Column(DateTime, default=now)
    subtotal = Column(Float, default=0.0)
    igv = Column(Float, default=0.0)
    total = Column(Float, default=0.0)
    estado = Column(String(30), default="RECIBIDA")       # RECIBIDA | PENDIENTE | ANULADA
    observaciones = Column(Text, nullable=True)
    created_at = Column(DateTime, default=now)
    updated_at = Column(DateTime, default=now, onupdate=now)

    proveedor = relationship("Proveedor")
    detalles = relationship("CompraDetalle", back_populates="compra", cascade="all, delete-orphan")


class CompraDetalle(Base):
    """Línea de detalle de compra: presentación fija Caja | Unidad | Blíster."""
    __tablename__ = "compras_detalles"

    id = Column(Integer, primary_key=True, index=True)
    compra_id = Column(Integer, ForeignKey("compras.id"), nullable=False)
    producto_id = Column(Integer, ForeignKey("productos.id"), nullable=False)

    # ── Datos de la presentación comprada ───────────────────────────────────
    presentacion = Column(String(20), nullable=False, default="Unidad")  # Caja | Unidad | Blister
    # Cantidad de empaques/unidades comprados en esa presentación
    cantidad_presentacion = Column(Float, default=1.0)
    # Snapshot del factor de conversión usado (unidades base por presentación; 1 para Unidad)
    unidades_por_presentacion = Column(Float, default=1.0)
    # Precio pagado por UNA unidad de esa presentación
    precio_presentacion = Column(Float, default=0.0)

    # ── Costos y precios calculados (almacenados para auditoría) ────────────
    costo_unitario = Column(Float, default=0.0)          # costo por unidad base
    porcentaje_ganancia = Column(Float, default=20.0)
    precio_venta_presentacion = Column(Float, default=0.0)  # PVP sugerido por esa presentación
    precio_venta_unitario = Column(Float, default=0.0)      # PVP sugerido por unidad base

    # ── Stock ingresado (siempre en unidades base) ──────────────────────────
    stock_ingresado = Column(Float, default=0.0)

    lote = Column(String(100), nullable=True)
    fecha_vencimiento = Column(Date, nullable=True)

    compra = relationship("Compra", back_populates="detalles")
    producto = relationship("Producto")
    lote_obj = relationship("Lote", back_populates="compra_detalle", uselist=False)

    @property
    def lote_id(self):
        return self.lote_obj.id if self.lote_obj else None


# ── Lotes (trazabilidad de stock por costo/vencimiento) ─────────────────────────

class Lote(Base):
    """Un lote es la unidad real de stock: cada compra crea uno nuevo con su
    propio costo y fecha de vencimiento. Las ventas descuentan de los lotes
    disponibles siguiendo FIFO por fecha de vencimiento (ver crud._asignar_fifo).
    `compra_detalle_id` es NULL para lotes sintéticos creados por un ajuste
    positivo de inventario (sin una compra detrás)."""
    __tablename__ = "lotes"
    __table_args__ = (
        Index("ix_lotes_producto_codigo", "producto_id", "codigo_lote"),
    )

    id = Column(Integer, primary_key=True, index=True)
    producto_id = Column(Integer, ForeignKey("productos.id"), nullable=False)
    compra_detalle_id = Column(Integer, ForeignKey("compras_detalles.id"), nullable=True)
    codigo_lote = Column(String(100), nullable=True)
    fecha_vencimiento = Column(Date, nullable=True)
    costo_unitario = Column(Float, default=0.0)
    precio_venta_unitario = Column(Float, default=0.0)
    cantidad_inicial = Column(Float, default=0.0)
    cantidad_disponible = Column(Float, default=0.0)
    created_at = Column(DateTime, default=now)
    updated_at = Column(DateTime, default=now, onupdate=now)

    producto = relationship("Producto", back_populates="lotes")
    compra_detalle = relationship("CompraDetalle", back_populates="lote_obj")


# ── Proveedores ─────────────────────────────────────────────────────────────────

class Proveedor(Base):
    __tablename__ = "proveedores"
    __table_args__ = (
        Index(
            "ux_proveedores_ruc_activo",
            "ruc",
            unique=True,
            postgresql_where=text("eliminado = false AND ruc IS NOT NULL"),
        ),
    )

    id = Column(Integer, primary_key=True, index=True)
    nombre = Column(String(200), nullable=False)
    ruc = Column(String(20), nullable=True)
    telefono = Column(String(30), nullable=True)
    direccion = Column(String(250), nullable=True)
    activo = Column(Boolean, default=True)
    eliminado = Column(Boolean, default=False)
    created_at = Column(DateTime, default=now)
    updated_at = Column(DateTime, default=now, onupdate=now)


# ── Caja: apertura y cierre de turno ────────────────────────────────────────────

class CajaApertura(Base):
    __tablename__ = "caja_aperturas"

    id = Column(Integer, primary_key=True, index=True)
    fecha = Column(DateTime, default=now)
    monto_inicial = Column(Float, default=0.0)
    estado = Column(String(20), default="ABIERTA")  # ABIERTA | CERRADA
    fecha_cierre = Column(DateTime, nullable=True)
    monto_contado = Column(Float, nullable=True)
    total_ventas = Column(Float, nullable=True)
    total_efectivo = Column(Float, nullable=True)
    total_tarjeta = Column(Float, nullable=True)
    total_yape_plin = Column(Float, nullable=True)
    total_gastos = Column(Float, nullable=True)
    diferencia = Column(Float, nullable=True)
    saldo_final = Column(Float, nullable=True)
    created_at = Column(DateTime, default=now)
    updated_at = Column(DateTime, default=now, onupdate=now)
