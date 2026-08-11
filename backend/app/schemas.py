from datetime import date, datetime
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field, validator

PRESENTACIONES_VALIDAS = ["Caja", "Unidad", "Blíster"]


# ── Categorias ─────────────────────────────────────────────────────────────────

class CategoriaBase(BaseModel):
    nombre: str = Field(..., max_length=150)
    descripcion: Optional[str] = Field(None, max_length=300)
    icono: str = Field("📦", max_length=20)
    color: str = Field("#0f6df2", max_length=20)
    activo: bool = True

class CategoriaCreate(CategoriaBase):
    pass

class CategoriaUpdate(BaseModel):
    nombre: Optional[str] = Field(None, max_length=150)
    descripcion: Optional[str] = Field(None, max_length=300)
    icono: Optional[str] = Field(None, max_length=20)
    color: Optional[str] = Field(None, max_length=20)
    activo: Optional[bool] = None

class CategoriaResponse(CategoriaBase):
    id: int
    total_productos: Optional[int] = 0
    eliminado: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        orm_mode = True
        from_attributes = True


# ── Empresa (config global, fila única) ────────────────────────────────────────

class EmpresaBase(BaseModel):
    nombre: Optional[str] = None
    ruc: Optional[str] = None
    direccion: Optional[str] = None
    distrito: Optional[str] = None
    provincia: Optional[str] = None
    departamento: Optional[str] = None
    telefono: Optional[str] = None
    email: Optional[str] = None
    vendedor: Optional[str] = None


class EmpresaUpdate(EmpresaBase):
    pass


class EmpresaResponse(EmpresaBase):
    id: int
    updated_at: datetime

    class Config:
        orm_mode = True
        from_attributes = True


# ── CajaMovimiento ─────────────────────────────────────────────────────────────

class CajaMovimientoBase(BaseModel):
    tipo: str = "INGRESO"
    categoria: Optional[str] = None
    descripcion: Optional[str] = None
    monto: float = Field(..., gt=0)
    fecha: Optional[str] = None
    es_recurrente: bool = False

    @validator("tipo")
    def tipo_valido(cls, v):
        if v not in ("INGRESO", "EGRESO"):
            raise ValueError("tipo debe ser INGRESO o EGRESO")
        return v

class CajaMovimientoCreate(CajaMovimientoBase):
    pass

class CajaMovimientoResponse(CajaMovimientoBase):
    id: int
    created_at: datetime

    class Config:
        orm_mode = True
        from_attributes = True


# ── Reporte resumen ────────────────────────────────────────────────────────────

class VentaDiaResumen(BaseModel):
    fecha: str
    total: float
    costo: float
    ganancia: float
    numVentas: int

class TopProducto(BaseModel):
    nombre: str
    cantidad: float
    total: float

class ReporteResumen(BaseModel):
    totalVentas: float
    totalCompras: float
    gananciaBruta: float
    margen: float
    numVentas: int
    numCompras: int
    ticketPromedio: float
    ventasPorDia: List[VentaDiaResumen]
    topProductos: List[TopProducto]


class ProductoBase(BaseModel):
    """Datos fijos/maestros del medicamento. Costo, lote, fecha de
    vencimiento y stock viven en Compras/Lotes, no aquí."""
    nombre: str = Field(..., max_length=200)
    laboratorio: Optional[str] = None
    marca: Optional[str] = None
    principio_activo: Optional[str] = None
    concentracion: Optional[str] = None
    forma_farmaceutica: Optional[str] = None
    presentacion_comercial: Optional[str] = None
    iva: bool = False
    stock_minimo: float = 0.0
    unidad_base: str = "unidad"
    precios_presentacion: Optional[Dict[str, float]] = None

    # ── Presentaciones fijas: Caja / Unidad / Blíster ───────────────────────
    unidades_por_caja: Optional[float] = None
    unidades_por_blister: Optional[float] = None

    activo: bool = True

    @validator("stock_minimo")
    def no_negativo(cls, v):
        if v < 0:
            raise ValueError("El stock mínimo no puede ser negativo")
        return v

    @validator("precios_presentacion")
    def validar_presentaciones(cls, v):
        # Aceptar cualquier clave de presentación (validación flexible)
        return v or {}


class ProductoCreate(ProductoBase):
    categoria_id: int


class ProductoUpdate(BaseModel):
    nombre: Optional[str] = None
    categoria_id: Optional[int] = None
    laboratorio: Optional[str] = None
    marca: Optional[str] = None
    principio_activo: Optional[str] = None
    concentracion: Optional[str] = None
    forma_farmaceutica: Optional[str] = None
    presentacion_comercial: Optional[str] = None
    iva: Optional[bool] = None
    stock_minimo: Optional[float] = None
    unidad_base: Optional[str] = None
    precios_presentacion: Optional[Dict[str, float]] = None
    unidades_por_caja: Optional[float] = None
    unidades_por_blister: Optional[float] = None
    activo: Optional[bool] = None

    @validator("stock_minimo")
    def no_negativo(cls, v):
        if v is not None and v < 0:
            raise ValueError("El stock mínimo no puede ser negativo")
        return v


class ProductoResponse(ProductoBase):
    id: int
    categoria_id: int
    categoria: Optional[CategoriaResponse] = None
    created_at: datetime
    updated_at: datetime
    eliminado: bool

    # ── Calculados a partir de Lotes/Movimientos (ver crud.py), no columnas ──
    stock_actual: float = 0.0
    ultimo_costo: Optional[float] = None
    ultima_compra: Optional[date] = None
    ultima_venta: Optional[date] = None
    proximo_vencimiento: Optional[date] = None

    class Config:
        orm_mode = True
        from_attributes = True

class ClienteBase(BaseModel):
    dni: Optional[str] = None
    ruc: Optional[str] = None
    nombre: Optional[str] = None
    apellidos: Optional[str] = None
    razon_social: Optional[str] = None
    direccion: Optional[str] = None
    distrito: Optional[str] = None
    provincia: Optional[str] = None
    departamento: Optional[str] = None
    celular: Optional[str] = None
    email: Optional[str] = None          # str simple, no EmailStr, para evitar errores con vacío
    fecha_nacimiento: Optional[date] = None   # siempre opcional
    observaciones: Optional[str] = None
    activo: bool = True

    @validator("dni")
    def dni_valido(cls, v):
        v = v.strip() if v else v
        if v and len(v) != 8:
            raise ValueError("DNI debe tener 8 caracteres")
        return v or None

    @validator("ruc")
    def ruc_valido(cls, v):
        v = v.strip() if v else v
        if v and len(v) != 11:
            raise ValueError("RUC debe tener 11 caracteres")
        return v or None

    @validator("email")
    def email_vacio_a_none(cls, v):
        if not v or not v.strip():
            return None
        return v.strip()

    @validator("fecha_nacimiento", pre=True)
    def fecha_nacimiento_vacia_a_none(cls, v):
        if not v or v == "":
            return None
        return v


class ClienteCreate(ClienteBase):
    pass


class ClienteUpdate(ClienteBase):
    pass


class ClienteResponse(ClienteBase):
    id: int
    created_at: datetime
    updated_at: datetime
    eliminado: bool

    class Config:
        orm_mode = True
        from_attributes = True


TIPOS_AJUSTE_MANUAL = ["AJUSTE_POSITIVO", "AJUSTE_NEGATIVO"]


class MovimientoInventarioBase(BaseModel):
    producto_id: int
    tipo: str
    cantidad: float
    costo_unitario: float = 0.0
    precio_unitario: float = 0.0
    nota: Optional[str] = None
    fecha_vencimiento: Optional[date] = None
    lote: Optional[str] = None
    # Solo para AJUSTE_NEGATIVO: si se informa, descuenta de ese lote puntual
    # en vez de seguir FIFO automático.
    lote_id: Optional[int] = None

    @validator("cantidad")
    def cantidad_positiva(cls, v):
        if v <= 0:
            raise ValueError("La cantidad debe ser mayor a cero")
        return v


class MovimientoInventarioCreate(MovimientoInventarioBase):
    """Los movimientos ENTRADA/SALIDA/DEVOLUCION solo los genera el sistema
    (Compras/Ventas). Aquí solo se permiten ajustes manuales de inventario."""

    @validator("tipo")
    def tipo_ajuste_valido(cls, v):
        if v not in TIPOS_AJUSTE_MANUAL:
            raise ValueError(f"tipo debe ser uno de: {TIPOS_AJUSTE_MANUAL}")
        return v

    @validator("costo_unitario")
    def costo_requerido_en_positivo(cls, v, values):
        if values.get("tipo") == "AJUSTE_POSITIVO" and (not v or v <= 0):
            raise ValueError("Un ajuste positivo requiere un costo unitario mayor a cero")
        return v


class MovimientoInventarioUpdate(BaseModel):
    cantidad: Optional[float] = None
    costo_unitario: Optional[float] = None
    precio_unitario: Optional[float] = None
    nota: Optional[str] = None
    fecha_vencimiento: Optional[date] = None
    lote: Optional[str] = None


class MovimientoInventarioResponse(MovimientoInventarioBase):
    id: int
    fecha: datetime
    stock_despues: float
    lote: Optional[str] = None
    fecha_vencimiento: Optional[date] = None
    venta_id: Optional[int] = None

    class Config:
        orm_mode = True
        from_attributes = True


class VentaDetalleBase(BaseModel):
    producto_id: int
    cantidad: float
    precio_unitario: float
    descuento: float = 0.0
    presentacion: Optional[str] = "Unidad"   # Caja | Unidad | Blíster

    @validator("cantidad")
    def cantidad_positiva(cls, v):
        if v <= 0:
            raise ValueError("La cantidad debe ser mayor a cero")
        return v

    @validator("precio_unitario")
    def precio_positivo(cls, v):
        if v < 0:
            raise ValueError("El precio unitario no puede ser negativo")
        return v

    @validator("presentacion")
    def presentacion_valida(cls, v):
        if v and v not in PRESENTACIONES_VALIDAS:
            raise ValueError(f"presentacion debe ser una de: {PRESENTACIONES_VALIDAS}")
        return v


class VentaCreate(BaseModel):
    cliente_id: Optional[int] = None
    cliente_nombre: Optional[str] = None   # nombre libre si no hay cliente registrado
    cliente_dni: Optional[str] = None      # DNI del cliente cuando no está registrado (ej. consulta RENIEC directa)
    cliente_ruc: Optional[str] = None      # RUC del cliente cuando no está registrado (ej. consulta SUNAT directa)
    forma_pago: str = Field(...)
    detalles: List[VentaDetalleBase]
    descuento: float = 0.0
    incluye_igv: bool = True               # si True, el IGV ya está incluido en los precios
    venta_rapida: bool = False
    tipo_documento: str = "NOTA_VENTA"  # NOTA_VENTA | BOLETA | FACTURA

    @validator("descuento")
    def descuento_no_negativo(cls, v):
        if v < 0:
            raise ValueError("El descuento no puede ser negativo")
        return v

    @validator("tipo_documento")
    def tipo_doc_valido(cls, v):
        if v not in ("NOTA_VENTA", "BOLETA", "FACTURA"):
            raise ValueError("tipo_documento debe ser NOTA_VENTA, BOLETA o FACTURA")
        return v


class VentaDetalleResponse(VentaDetalleBase):
    id: int
    subtotal: float
    total: float
    nombre_producto: Optional[str] = None

    class Config:
        from_attributes = True
        orm_mode = True


class VentaResponse(BaseModel):
    id: int
    cliente_id: Optional[int]
    cliente_nombre: Optional[str] = None
    cliente_dni: Optional[str] = None
    cliente_ruc: Optional[str] = None
    fecha: datetime
    subtotal: float
    descuento: float
    igv: float
    total: float
    forma_pago: str
    estado: str
    venta_rapida: bool
    tipo_documento: str
    serie: Optional[str]
    numero_documento: Optional[str]
    detalles: List[VentaDetalleResponse]

    class Config:
        orm_mode = True
        from_attributes = True


class CajaResponse(BaseModel):
    id: int
    fecha: datetime
    descripcion: Optional[str]
    ingreso: float
    egreso: float
    venta_id: Optional[int]

    class Config:
        orm_mode = True
        from_attributes = True


# ── Compras ────────────────────────────────────────────────────────────────────

class CompraDetalleBase(BaseModel):
    producto_id: int
    presentacion: str = Field("Unidad", description="Caja | Unidad | Blíster")
    cantidad_presentacion: float = Field(1.0, gt=0, description="Cantidad comprada en esa presentación")
    precio_presentacion: float = Field(..., gt=0, description="Precio pagado por una unidad de esa presentación")
    # Factor de conversión a unidades base; si no se envía, se toma de la ficha del producto
    unidades_por_presentacion: Optional[float] = None

    porcentaje_ganancia: float = Field(20.0, ge=0)
    lote: Optional[str] = None
    fecha_vencimiento: Optional[date] = None

    @validator("presentacion")
    def presentacion_valida(cls, v):
        if v not in PRESENTACIONES_VALIDAS:
            raise ValueError(f"presentacion debe ser una de: {PRESENTACIONES_VALIDAS}")
        return v


class CompraDetalleCreate(CompraDetalleBase):
    pass


class CompraDetalleResponse(BaseModel):
    id: int
    producto_id: int
    presentacion: str
    cantidad_presentacion: float
    precio_presentacion: float
    unidades_por_presentacion: float
    costo_unitario: float
    porcentaje_ganancia: float
    precio_venta_presentacion: float
    precio_venta_unitario: float
    stock_ingresado: float
    lote: Optional[str]
    fecha_vencimiento: Optional[date]
    lote_id: Optional[int] = None

    class Config:
        orm_mode = True
        from_attributes = True


class CompraCreate(BaseModel):
    numero: Optional[str] = None
    tipo_comprobante: Optional[str] = None
    serie: Optional[str] = None
    moneda: str = "PEN"
    proveedor_id: Optional[int] = None
    proveedor_nombre: Optional[str] = None
    observaciones: Optional[str] = None
    detalles: List[CompraDetalleCreate] = Field(..., min_items=1)


class CompraResponse(BaseModel):
    id: int
    numero: Optional[str]
    tipo_comprobante: Optional[str] = None
    serie: Optional[str] = None
    moneda: Optional[str] = None
    proveedor_id: Optional[int] = None
    proveedor_nombre: Optional[str] = None
    fecha: datetime
    subtotal: float
    igv: float
    total: float
    estado: str
    observaciones: Optional[str]
    detalles: List[CompraDetalleResponse]
    created_at: datetime

    class Config:
        orm_mode = True
        from_attributes = True


# ── Lotes ──────────────────────────────────────────────────────────────────────

class LoteResponse(BaseModel):
    id: int
    producto_id: int
    producto_nombre: Optional[str] = None
    compra_detalle_id: Optional[int] = None
    codigo_lote: Optional[str] = None
    fecha_vencimiento: Optional[date] = None
    costo_unitario: float
    precio_venta_unitario: float
    cantidad_inicial: float
    cantidad_disponible: float
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# ── Proveedores ─────────────────────────────────────────────────────────────────

class ProveedorBase(BaseModel):
    nombre: str = Field(..., max_length=200)
    ruc: Optional[str] = None
    telefono: Optional[str] = None
    direccion: Optional[str] = None
    activo: bool = True

    @validator("ruc")
    def ruc_valido(cls, v):
        v = v.strip() if v else v
        if v and len(v) != 11:
            raise ValueError("RUC debe tener 11 caracteres")
        return v or None


class ProveedorCreate(ProveedorBase):
    pass


class ProveedorUpdate(BaseModel):
    nombre: Optional[str] = None
    ruc: Optional[str] = None
    telefono: Optional[str] = None
    direccion: Optional[str] = None
    activo: Optional[bool] = None


class ProveedorResponse(ProveedorBase):
    id: int
    eliminado: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# ── Caja: apertura y cierre ──────────────────────────────────────────────────────

class CajaAperturaCreate(BaseModel):
    monto_inicial: float = Field(0.0, ge=0)


class CajaAperturaCierre(BaseModel):
    monto_contado: float = Field(..., ge=0)


class CajaAperturaResponse(BaseModel):
    id: int
    fecha: datetime
    monto_inicial: float
    estado: str
    fecha_cierre: Optional[datetime] = None
    monto_contado: Optional[float] = None
    total_ventas: Optional[float] = None
    total_efectivo: Optional[float] = None
    total_tarjeta: Optional[float] = None
    total_yape_plin: Optional[float] = None
    total_gastos: Optional[float] = None
    diferencia: Optional[float] = None
    saldo_final: Optional[float] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
