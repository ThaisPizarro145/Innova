from datetime import date, datetime
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field, validator

PRESENTACIONES_VALIDAS = ["kilo", "saco", "bolsa", "caja", "unidad", "maple", "paquete",
                          "medio_saco", "litro", "botella", "docena", "balde", "jaba"]
TIPOS_FLUJO_VALIDOS = ["caja_unidad", "saco_kilo", "saco_unidad", "multinivel"]


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


# ── Configuración de Categorías ────────────────────────────────────────────────

class CategoriaConfigBase(BaseModel):
    nombre: str = Field(..., max_length=150)
    descripcion: Optional[str] = None
    icono: str = "📦"
    color: str = "#0f6df2"
    # Lista de nombres de unidades válidas para compra
    unidades_compra: List[str] = []
    # Lista de nombres de unidades válidas para venta
    unidades_venta: List[str] = []
    # Tabla de conversiones: { "saco": {"tipo": "peso", "kg": 100}, ... }
    conversiones: Dict[str, Any] = {}
    tipo_flujo_default: Optional[str] = None
    empaque_mayor_default: Optional[str] = None
    unidad_menor_default: Optional[str] = None
    nivel2_nombre_default: Optional[str] = None
    margen_ganancia_default: float = 20.0
    activo: bool = True

    @validator("tipo_flujo_default")
    def tipo_flujo_valido(cls, v):
        if v and v not in TIPOS_FLUJO_VALIDOS:
            raise ValueError(f"tipo_flujo_default debe ser uno de: {TIPOS_FLUJO_VALIDOS}")
        return v


class CategoriaConfigCreate(CategoriaConfigBase):
    pass


class CategoriaConfigUpdate(BaseModel):
    nombre: Optional[str] = None
    descripcion: Optional[str] = None
    icono: Optional[str] = None
    color: Optional[str] = None
    unidades_compra: Optional[List[str]] = None
    unidades_venta: Optional[List[str]] = None
    conversiones: Optional[Dict[str, Any]] = None
    tipo_flujo_default: Optional[str] = None
    empaque_mayor_default: Optional[str] = None
    unidad_menor_default: Optional[str] = None
    nivel2_nombre_default: Optional[str] = None
    margen_ganancia_default: Optional[float] = None
    activo: Optional[bool] = None


class CategoriaConfigResponse(CategoriaConfigBase):
    id: int
    eliminado: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        orm_mode = True


# ── Cálculo de precios por categoría ──────────────────────────────────────────

class CalculoPrecioRequest(BaseModel):
    """Solicitud de cálculo de precios sugeridos dado un costo de compra."""
    categoria_nombre: str
    unidad_compra: str             # ej: "saco"
    costo_compra: float            # precio pagado por 1 unidad de compra
    cantidad_comprada: float = 1.0
    margen_ganancia: float = 20.0
    # Factores de conversión opcionales (sobreescriben los de la categoría)
    factor_override: Optional[Dict[str, Any]] = None


class PrecioCalculado(BaseModel):
    unidad: str
    costo: float
    precio_venta: float
    descripcion: Optional[str] = None


class CalculoPrecioResponse(BaseModel):
    categoria: str
    unidad_compra: str
    costo_compra: float
    margen_ganancia: float
    precios: List[PrecioCalculado]
    stock_ingresado: float
    unidad_stock: str


class EquivalenciasProducto(BaseModel):
    """
    Factores de conversión definidos en la ficha del producto.
    Solo los campos relevantes al tipo_flujo deben estar presentes.
    """
    unidades_por_empaque: Optional[float] = None   # caja_unidad / saco_unidad
    kg_por_empaque: Optional[float] = None          # saco_kilo / multinivel
    nivel2_por_empaque: Optional[float] = None      # multinivel: maples/paquete
    unidades_por_nivel2: Optional[float] = None     # multinivel: huevos/maple


class ProductoBase(BaseModel):
    codigo: Optional[str] = Field(None, max_length=80)
    nombre: str = Field(..., max_length=200)
    categoria: Optional[str] = None
    proveedor: Optional[str] = None
    laboratorio: Optional[str] = None
    lote: Optional[str] = None
    fecha_vencimiento: Optional[date] = None
    costo: float = 0.0
    precio_venta: float = 0.0
    iva: bool = False
    utilidad: float = 0.0
    stock_actual: float = 0.0
    stock_minimo: float = 0.0
    unidad_base: str = "unidad"
    precios_presentacion: Optional[Dict[str, float]] = None

    # ── Módulo 1: Configuración de empaque ──────────────────────────────────
    tipo_flujo: Optional[str] = None                  # caja_unidad | saco_kilo | saco_unidad | multinivel
    nombre_empaque_mayor: Optional[str] = None        # Caja, Saco, Paquete…
    nombre_unidad_menor: Optional[str] = None         # Unidad, Kilo, Bolsa…
    nombre_nivel2: Optional[str] = None               # Maple (solo multinivel)
    equivalencias: Optional[EquivalenciasProducto] = None
    margen_ganancia_default: float = 20.0

    activo: bool = True

    @validator("stock_actual", "stock_minimo")
    def no_negativo(cls, v):
        if v < 0:
            raise ValueError("El stock no puede ser negativo")
        return v

    @validator("precio_venta", "costo")
    def no_precio_negativo(cls, v):
        if v < 0:
            raise ValueError("El precio/costo no puede ser negativo")
        return v

    @validator("precios_presentacion")
    def validar_presentaciones(cls, v):
        # Aceptar cualquier clave de presentación (validación flexible)
        return v or {}

    @validator("tipo_flujo")
    def validar_tipo_flujo(cls, v):
        if v and v not in TIPOS_FLUJO_VALIDOS:
            raise ValueError(f"tipo_flujo debe ser uno de: {TIPOS_FLUJO_VALIDOS}")
        return v

    @validator("utilidad")
    def utilidad_valida(cls, v, values):
        return v



class ProductoCreate(ProductoBase):
    pass


class ProductoUpdate(BaseModel):
    codigo: Optional[str] = None
    nombre: Optional[str] = None
    categoria: Optional[str] = None
    proveedor: Optional[str] = None
    laboratorio: Optional[str] = None
    lote: Optional[str] = None
    fecha_vencimiento: Optional[date] = None
    costo: Optional[float] = None
    precio_venta: Optional[float] = None
    iva: Optional[bool] = None
    utilidad: Optional[float] = None
    stock_actual: Optional[float] = None
    stock_minimo: Optional[float] = None
    unidad_base: Optional[str] = None
    precios_presentacion: Optional[Dict[str, float]] = None
    # Módulo 1
    tipo_flujo: Optional[str] = None
    nombre_empaque_mayor: Optional[str] = None
    nombre_unidad_menor: Optional[str] = None
    nombre_nivel2: Optional[str] = None
    equivalencias: Optional[EquivalenciasProducto] = None
    margen_ganancia_default: Optional[float] = None
    activo: Optional[bool] = None

    @validator("stock_actual", "stock_minimo")
    def no_negativo(cls, v):
        if v is not None and v < 0:
            raise ValueError("El stock no puede ser negativo")
        return v

    @validator("precio_venta", "costo")
    def no_precio_negativo(cls, v):
        if v is not None and v < 0:
            raise ValueError("El precio/costo no puede ser negativo")
        return v

    @validator("tipo_flujo")
    def validar_tipo_flujo(cls, v):
        if v and v not in TIPOS_FLUJO_VALIDOS:
            raise ValueError(f"tipo_flujo debe ser uno de: {TIPOS_FLUJO_VALIDOS}")
        return v

    @validator("utilidad")
    def utilidad_valida(cls, v, values):
        return v


class ProductoResponse(ProductoBase):
    id: int
    created_at: datetime
    updated_at: datetime
    eliminado: bool

    class Config:
        orm_mode = True

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


class MovimientoInventarioBase(BaseModel):
    producto_id: int
    tipo: str
    cantidad: float
    costo_unitario: float = 0.0
    precio_unitario: float = 0.0
    nota: Optional[str] = None
    fecha_vencimiento: Optional[date] = None
    lote: Optional[str] = None

    @validator("cantidad")
    def cantidad_positiva(cls, v):
        if v <= 0:
            raise ValueError("La cantidad debe ser mayor a cero")
        return v


class MovimientoInventarioCreate(MovimientoInventarioBase):
    pass


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

    class Config:
        orm_mode = True


class VentaDetalleBase(BaseModel):
    producto_id: int
    cantidad: float           # float para kilos/fracciones
    precio_unitario: float
    descuento: float = 0.0
    presentacion: Optional[str] = "unidad"   # kilo, saco, bolsa, caja, unidad
    lote: Optional[str] = None
    fecha_vencimiento: Optional[date] = None

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
        # Aceptar cualquier presentación definida por la categoría
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


class CajaResponse(BaseModel):
    id: int
    fecha: datetime
    descripcion: Optional[str]
    ingreso: float
    egreso: float
    venta_id: Optional[int]

    class Config:
        orm_mode = True


# ── Compras ────────────────────────────────────────────────────────────────────

TIPOS_PRESENTACION = ["caja_unidad", "saco_kilo", "saco_unidad", "multinivel"]


class CompraDetalleBase(BaseModel):
    producto_id: int
    tipo_presentacion: str = Field("caja_unidad", description="caja_unidad | saco_kilo | saco_unidad | multinivel")
    cantidad_empaque: float = Field(1.0, gt=0, description="Cantidad de empaques comprados")
    nombre_empaque: str = Field("Caja", max_length=50)
    precio_empaque: float = Field(..., gt=0, description="Precio por empaque mayor")

    # Contenido del empaque
    unidades_por_empaque: Optional[float] = None   # Casos A, C y D (maples/paq)
    kg_por_empaque: Optional[float] = None          # Casos B y D

    # Nivel 2 para multinivel (Huevos)
    nivel2_cantidad: Optional[float] = None         # maples por paquete
    nivel2_nombre: Optional[str] = None             # "Maple"
    unidades_por_nivel2: Optional[float] = None     # huevos por maple

    porcentaje_ganancia: float = Field(20.0, ge=0)
    lote: Optional[str] = None
    fecha_vencimiento: Optional[date] = None

    @validator("tipo_presentacion")
    def tipo_valido(cls, v):
        if v not in TIPOS_PRESENTACION:
            raise ValueError(f"tipo_presentacion debe ser uno de: {TIPOS_PRESENTACION}")
        return v

    @validator("unidades_por_empaque", always=True)
    def validar_unidades(cls, v, values):
        tipo = values.get("tipo_presentacion", "")
        if tipo in ("caja_unidad", "saco_unidad") and (v is None or v <= 0):
            raise ValueError("unidades_por_empaque es requerido y debe ser > 0 para este tipo")
        return v

    @validator("kg_por_empaque", always=True)
    def validar_kg(cls, v, values):
        tipo = values.get("tipo_presentacion", "")
        if tipo == "saco_kilo" and (v is None or v <= 0):
            raise ValueError("kg_por_empaque es requerido y debe ser > 0 para tipo saco_kilo")
        return v

    @validator("nivel2_cantidad", always=True)
    def validar_multinivel(cls, v, values):
        tipo = values.get("tipo_presentacion", "")
        if tipo == "multinivel" and (v is None or v <= 0):
            raise ValueError("nivel2_cantidad es requerido para tipo multinivel")
        return v


class CompraDetalleCreate(CompraDetalleBase):
    pass


class CompraDetalleResponse(BaseModel):
    id: int
    producto_id: int
    tipo_presentacion: str
    cantidad_empaque: float
    nombre_empaque: str
    precio_empaque: float
    unidades_por_empaque: Optional[float]
    kg_por_empaque: Optional[float]
    nivel2_cantidad: Optional[float]
    nivel2_nombre: Optional[str]
    unidades_por_nivel2: Optional[float]
    costo_empaque: float
    costo_unitario: float
    costo_nivel2: Optional[float]
    porcentaje_ganancia: float
    precio_venta_empaque: float
    precio_venta_unitario: float
    precio_venta_nivel2: Optional[float]
    stock_ingresado: float
    unidad_stock: str
    lote: Optional[str]
    fecha_vencimiento: Optional[date]

    class Config:
        orm_mode = True


class CompraCreate(BaseModel):
    numero: Optional[str] = None
    proveedor: Optional[str] = None
    observaciones: Optional[str] = None
    detalles: List[CompraDetalleCreate] = Field(..., min_items=1)


class CompraResponse(BaseModel):
    id: int
    numero: Optional[str]
    proveedor: Optional[str]
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
