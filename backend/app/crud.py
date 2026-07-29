from datetime import datetime
from sqlalchemy.orm import Session
from sqlalchemy import func, and_
from sqlalchemy.exc import IntegrityError, DataError
from app import models, schemas


def get_producto(db: Session, producto_id: int):
    return db.query(models.Producto).filter(models.Producto.id == producto_id, models.Producto.eliminado == False).first()


def get_producto_por_codigo(db: Session, codigo: str):
    return db.query(models.Producto).filter(models.Producto.codigo == codigo, models.Producto.eliminado == False).first()


def listar_productos(db: Session, skip: int = 0, limit: int = 100, query: str = None):
    productos = db.query(models.Producto).filter(models.Producto.eliminado == False)
    if query:
        busqueda = f"%{query}%"
        productos = productos.filter(
            models.Producto.nombre.ilike(busqueda)
            | models.Producto.codigo.ilike(busqueda)
            | models.Producto.laboratorio.ilike(busqueda)
            | models.Producto.categoria.ilike(busqueda)
        )
    return productos.offset(skip).limit(limit).all()


def crear_producto(db: Session, producto: schemas.ProductoCreate):
    if producto.codigo and db.query(models.Producto).filter(models.Producto.codigo == producto.codigo, models.Producto.eliminado == False).first():
        raise ValueError("Ya existe un producto con ese código")

    nueva_utilidad = producto.precio_venta - producto.costo

    # Serializar equivalencias a dict si viene como objeto Pydantic
    equiv = producto.equivalencias
    equiv_dict = equiv.dict(exclude_none=True) if equiv else {}

    db_producto = models.Producto(
        codigo=producto.codigo,
        nombre=producto.nombre,
        categoria=producto.categoria,
        laboratorio=producto.laboratorio,
        proveedor=producto.proveedor,
        lote=producto.lote,
        fecha_vencimiento=producto.fecha_vencimiento,
        costo=producto.costo,
        precio_venta=producto.precio_venta,
        iva=producto.iva,
        utilidad=nueva_utilidad,
        stock_actual=producto.stock_actual,
        stock_minimo=producto.stock_minimo,
        unidad_base=getattr(producto, "unidad_base", "unidad"),
        precios_presentacion=getattr(producto, "precios_presentacion", {}),
        tipo_flujo=producto.tipo_flujo,
        nombre_empaque_mayor=producto.nombre_empaque_mayor,
        nombre_unidad_menor=producto.nombre_unidad_menor,
        nombre_nivel2=producto.nombre_nivel2,
        equivalencias=equiv_dict,
        margen_ganancia_default=producto.margen_ganancia_default,
        activo=producto.activo,
    )
    db.add(db_producto)
    db.commit()
    db.refresh(db_producto)

    # El código ya no se digita a mano: se deriva del id autoincremental
    # de la tabla (igual que un identificador serial de Supabase/Postgres).
    if not db_producto.codigo:
        db_producto.codigo = f"P-{db_producto.id:04d}"
        db.commit()
        db.refresh(db_producto)

    # Si el producto se registra con stock inicial, debe quedar visible en
    # el kardex de Inventario (si no, el stock queda "invisible": no hay
    # movimiento que explique de dónde salió).
    if db_producto.stock_actual and db_producto.stock_actual > 0:
        movimiento = models.MovimientoInventario(
            producto_id=db_producto.id,
            tipo="ENTRADA",
            cantidad=db_producto.stock_actual,
            costo_unitario=db_producto.costo,
            precio_unitario=db_producto.precio_venta,
            nota="Stock inicial al registrar producto",
            lote=db_producto.lote,
            fecha_vencimiento=db_producto.fecha_vencimiento,
            stock_despues=db_producto.stock_actual,
        )
        db.add(movimiento)
        db.commit()

    return db_producto


def actualizar_producto(db: Session, producto_id: int, producto: schemas.ProductoUpdate):
    db_producto = get_producto(db, producto_id)
    if not db_producto:
        return None

    if producto.codigo and producto.codigo != db_producto.codigo:
        if db.query(models.Producto).filter(models.Producto.codigo == producto.codigo, models.Producto.eliminado == False, models.Producto.id != producto_id).first():
            raise ValueError("Ya existe un producto con ese código")

    datos = producto.dict(exclude_unset=True)

    # Serializar equivalencias si vienen como objeto Pydantic
    if "equivalencias" in datos and datos["equivalencias"] is not None:
        eq = datos["equivalencias"]
        datos["equivalencias"] = eq.dict(exclude_none=True) if hasattr(eq, "dict") else eq

    for field, value in datos.items():
        setattr(db_producto, field, value)

    if producto.precio_venta is not None or producto.costo is not None:
        db_producto.utilidad = db_producto.precio_venta - db_producto.costo

    db_producto.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(db_producto)
    return db_producto


def eliminar_producto(db: Session, producto_id: int):
    db_producto = get_producto(db, producto_id)
    if not db_producto:
        return None

    # Si el producto nunca se usó en una venta, compra o movimiento de
    # inventario, se puede borrar de verdad (igual que eliminar_cliente).
    # Si tiene historial, se soft-deletea para no romper reportes pasados.
    tiene_historial = (
        db.query(models.VentaDetalle).filter(models.VentaDetalle.producto_id == producto_id).first() is not None
        or db.query(models.CompraDetalle).filter(models.CompraDetalle.producto_id == producto_id).first() is not None
        or db.query(models.MovimientoInventario).filter(models.MovimientoInventario.producto_id == producto_id).first() is not None
    )

    if tiene_historial:
        db_producto.eliminado = True
        db_producto.activo = False
        db_producto.updated_at = datetime.utcnow()
        db.commit()
        db.refresh(db_producto)
        return db_producto

    datos = schemas.ProductoResponse.from_orm(db_producto).dict()
    db.delete(db_producto)
    db.commit()
    return datos


def crear_movimiento_inventario(db: Session, movimiento: schemas.MovimientoInventarioCreate):
    producto = get_producto(db, movimiento.producto_id)
    if not producto:
        raise ValueError("Producto no encontrado")

    if movimiento.tipo in ["SALIDA", "AJUSTE_NEGATIVO"] and movimiento.cantidad > producto.stock_actual:
        raise ValueError("No hay stock suficiente para esta operación")

    cantidad_final = (
        producto.stock_actual + movimiento.cantidad
        if movimiento.tipo in ["ENTRADA", "AJUSTE_POSITIVO"]
        else producto.stock_actual - movimiento.cantidad
    )

    if cantidad_final < 0:
        raise ValueError("El stock final no puede ser negativo")

    # ── Actualizar stock ──
    producto.stock_actual = cantidad_final

    # ── En ENTRADA: actualizar costo, precio, fecha de vencimiento y lote si se informan ──
    if movimiento.tipo in ["ENTRADA", "AJUSTE_POSITIVO"]:
        if movimiento.costo_unitario and movimiento.costo_unitario > 0:
            producto.costo = movimiento.costo_unitario
            producto.utilidad = (producto.precio_venta or 0) - movimiento.costo_unitario

        if movimiento.precio_unitario and movimiento.precio_unitario > 0:
            producto.precio_venta = movimiento.precio_unitario
            producto.utilidad = movimiento.precio_unitario - (producto.costo or 0)

        if getattr(movimiento, "fecha_vencimiento", None):
            producto.fecha_vencimiento = movimiento.fecha_vencimiento

        if getattr(movimiento, "lote", None):
            producto.lote = movimiento.lote

        # Mantener precios_presentacion sincronizado con el nuevo costo/precio,
        # usando el mismo motor que Compras (ver _recalcular_precios_presentacion).
        _recalcular_precios_presentacion(db, producto, producto.costo, producto.precio_venta)

    producto.updated_at = datetime.utcnow()

    db_movimiento = models.MovimientoInventario(
        producto_id=movimiento.producto_id,
        tipo=movimiento.tipo,
        cantidad=movimiento.cantidad,
        costo_unitario=movimiento.costo_unitario,
        precio_unitario=movimiento.precio_unitario,
        nota=movimiento.nota,
        lote=getattr(movimiento, "lote", None),
        fecha_vencimiento=getattr(movimiento, "fecha_vencimiento", None),
        stock_despues=producto.stock_actual,
    )

    db.add(db_movimiento)
    db.commit()
    db.refresh(db_movimiento)
    return db_movimiento


def listar_movimientos(db: Session, skip: int = 0, limit: int = 100, producto_id: int = None):
    movimientos = db.query(models.MovimientoInventario).order_by(models.MovimientoInventario.fecha.desc())
    if producto_id:
        movimientos = movimientos.filter(models.MovimientoInventario.producto_id == producto_id)
    return movimientos.offset(skip).limit(limit).all()


def actualizar_movimiento(db: Session, movimiento_id: int, datos: dict):
    mov = db.query(models.MovimientoInventario).filter(models.MovimientoInventario.id == movimiento_id).first()
    if not mov:
        return None

    producto = get_producto(db, mov.producto_id)
    if not producto:
        raise ValueError("Producto del movimiento no encontrado")

    # Revertir efecto anterior en stock
    if mov.tipo in ["ENTRADA", "AJUSTE_POSITIVO"]:
        producto.stock_actual -= mov.cantidad
    else:
        producto.stock_actual += mov.cantidad

    # Aplicar nuevos valores
    nueva_cantidad = float(datos.get("cantidad", mov.cantidad))
    nuevo_costo = float(datos.get("costo_unitario", mov.costo_unitario))
    nuevo_precio = float(datos.get("precio_unitario", mov.precio_unitario))
    nuevo_tipo = datos.get("tipo", mov.tipo)
    nueva_nota = datos.get("nota", mov.nota)
    nueva_fecha_venc = datos.get("fecha_vencimiento", mov.fecha_vencimiento)
    nuevo_lote = datos.get("lote", mov.lote)

    if nuevo_tipo in ["ENTRADA", "AJUSTE_POSITIVO"]:
        producto.stock_actual += nueva_cantidad
    else:
        if nueva_cantidad > producto.stock_actual:
            raise ValueError("Stock insuficiente para el ajuste")
        producto.stock_actual -= nueva_cantidad

    if nuevo_tipo in ["ENTRADA", "AJUSTE_POSITIVO"]:
        if nuevo_costo > 0:
            producto.costo = nuevo_costo
            producto.utilidad = (producto.precio_venta or 0) - nuevo_costo
        if nuevo_precio > 0:
            producto.precio_venta = nuevo_precio
            producto.utilidad = nuevo_precio - (producto.costo or 0)
        if nueva_fecha_venc:
            producto.fecha_vencimiento = nueva_fecha_venc
        if nuevo_lote:
            producto.lote = nuevo_lote

        # Mismo motor que Compras: evita que precios_presentacion quede
        # desactualizado tras editar un movimiento manual de Inventario.
        _recalcular_precios_presentacion(db, producto, producto.costo, producto.precio_venta)

    mov.cantidad = nueva_cantidad
    mov.tipo = nuevo_tipo
    mov.costo_unitario = nuevo_costo
    mov.precio_unitario = nuevo_precio
    mov.nota = nueva_nota
    mov.fecha_vencimiento = nueva_fecha_venc
    mov.lote = nuevo_lote
    mov.stock_despues = producto.stock_actual
    producto.updated_at = datetime.utcnow()

    db.commit()
    db.refresh(mov)
    return mov


def eliminar_movimiento(db: Session, movimiento_id: int):
    mov = db.query(models.MovimientoInventario).filter(models.MovimientoInventario.id == movimiento_id).first()
    if not mov:
        return None

    producto = get_producto(db, mov.producto_id)
    if producto:
        # Revertir efecto en stock
        if mov.tipo in ["ENTRADA", "AJUSTE_POSITIVO"]:
            producto.stock_actual = max(0, producto.stock_actual - mov.cantidad)
        else:
            producto.stock_actual += mov.cantidad
        producto.updated_at = datetime.utcnow()

    db.delete(mov)
    db.commit()
    return mov


def get_cliente(db: Session, cliente_id: int):
    return db.query(models.Cliente).filter(models.Cliente.id == cliente_id, models.Cliente.eliminado == False).first()


def get_cliente_por_dni(db: Session, dni: str):
    return db.query(models.Cliente).filter(models.Cliente.dni == dni, models.Cliente.eliminado == False).first()


def get_cliente_por_ruc(db: Session, ruc: str):
    return db.query(models.Cliente).filter(models.Cliente.ruc == ruc, models.Cliente.eliminado == False).first()


def listar_clientes(db: Session, skip: int = 0, limit: int = 100, query: str = None):
    clientes = db.query(models.Cliente).filter(models.Cliente.eliminado == False)
    if query:
        busqueda = f"%{query}%"
        clientes = clientes.filter(
            models.Cliente.nombre.ilike(busqueda)
            | models.Cliente.apellidos.ilike(busqueda)
            | models.Cliente.dni.ilike(busqueda)
            | models.Cliente.ruc.ilike(busqueda)
            | models.Cliente.razon_social.ilike(busqueda)
        )
    return clientes.offset(skip).limit(limit).all()


def crear_cliente(db: Session, cliente: schemas.ClienteCreate):
    if cliente.dni and get_cliente_por_dni(db, cliente.dni):
        raise ValueError("Ya existe un cliente con ese DNI")
    if cliente.ruc and get_cliente_por_ruc(db, cliente.ruc):
        raise ValueError("Ya existe un cliente con ese RUC")

    db_cliente = models.Cliente(**cliente.dict())
    db.add(db_cliente)
    db.commit()
    db.refresh(db_cliente)
    return db_cliente


def actualizar_cliente(db: Session, cliente_id: int, cliente: schemas.ClienteUpdate):
    db_cliente = get_cliente(db, cliente_id)
    if not db_cliente:
        return None

    if cliente.dni and cliente.dni != db_cliente.dni and get_cliente_por_dni(db, cliente.dni):
        raise ValueError("Ya existe un cliente con ese DNI")
    if cliente.ruc and cliente.ruc != db_cliente.ruc and get_cliente_por_ruc(db, cliente.ruc):
        raise ValueError("Ya existe un cliente con ese RUC")

    for field, value in cliente.dict(exclude_unset=True).items():
        setattr(db_cliente, field, value)

    db_cliente.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(db_cliente)
    return db_cliente


def eliminar_cliente(db: Session, cliente_id: int):
    db_cliente = get_cliente(db, cliente_id)
    if not db_cliente:
        return None, None

    tiene_ventas = db.query(models.Venta).filter(models.Venta.cliente_id == cliente_id).first() is not None
    if tiene_ventas:
        db_cliente.eliminado = True
        db_cliente.activo = False
        db_cliente.updated_at = datetime.utcnow()
        db.commit()
        db.refresh(db_cliente)
        return db_cliente, False

    datos = schemas.ClienteResponse.from_orm(db_cliente).dict()
    db.delete(db_cliente)
    db.commit()
    return datos, True


def listar_ventas_por_cliente(db: Session, cliente_id: int, skip: int = 0, limit: int = 100):
    return (
        db.query(models.Venta)
        .filter(models.Venta.cliente_id == cliente_id)
        .order_by(models.Venta.fecha.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )


def _siguiente_numero_documento(db: Session, serie: str) -> str:
    """
    Obtiene y reserva el siguiente número correlativo para una serie.
    Thread-safe por row-level lock (with_for_update).
    """
    contador = db.query(models.ContadorDocumento).filter(
        models.ContadorDocumento.serie == serie
    ).with_for_update().first()

    if not contador:
        contador = models.ContadorDocumento(serie=serie, ultimo_numero=0)
        db.add(contador)
        db.flush()

    contador.ultimo_numero += 1
    db.flush()
    return str(contador.ultimo_numero).zfill(8)


SERIES_DOC = {
    "NOTA_VENTA": "NV01",
    "BOLETA": "B001",
    "FACTURA": "F001",
}


def _cantidad_en_unidades_base(producto: "models.Producto", presentacion: str, cantidad: float) -> float:
    """
    Convierte una cantidad expresada en una presentación de venta a unidades base
    (la misma unidad en que está expresado producto.stock_actual).

    Ejemplos:
      - Aceite, presentacion="caja", cantidad=2  →  2 * 12 = 24 unidades
      - Lentejas, presentacion="saco", cantidad=1 → 1 * 100 = 100 kg
      - Lentejas, presentacion="medio_saco"       → 1 * 50  = 50 kg
      - Lentejas, presentacion="kilo"             → 1 kg
      - Huevos, presentacion="maple"              → 1 * 2.4 = 2.4 kg (si stock es en kg)
    """
    equiv = dict(producto.equivalencias or {})
    nombre_empaque = (producto.nombre_empaque_mayor or "").lower()
    nombre_unidad  = (producto.nombre_unidad_menor or "").lower()
    nombre_nivel2  = (producto.nombre_nivel2 or "").lower()
    pres = presentacion.lower().strip()
    tipo_flujo = producto.tipo_flujo or ""

    # ── Presentación = unidad base → sin conversión ──────────────────────
    if pres in (nombre_unidad, "unidad", "kilo", producto.unidad_base or ""):
        return round(cantidad, 6)

    # ── caja_unidad / saco_unidad ──────────────────────────────────────────
    if tipo_flujo in ("caja_unidad", "saco_unidad") and pres == nombre_empaque:
        n = equiv.get("unidades_por_empaque", 1)
        return round(cantidad * float(n), 6)

    # ── saco_kilo ─────────────────────────────────────────────────────────
    if tipo_flujo == "saco_kilo":
        if pres == nombre_empaque:
            kg = equiv.get("kg_por_empaque", 1)
            return round(cantidad * float(kg), 6)
        # medio saco: factor 0.5 del saco
        if "medio" in pres:
            kg = equiv.get("kg_por_empaque", 1)
            return round(cantidad * float(kg) * 0.5, 6)

    # ── multinivel (paquete → maple → kilo/unidad) ────────────────────────
    if tipo_flujo == "multinivel":
        if pres == nombre_empaque:
            # Paquete completo
            kg = equiv.get("kg_por_empaque", 0)
            if kg:
                return round(cantidad * float(kg), 6)
            maples = equiv.get("nivel2_por_empaque", 1)
            huevos = equiv.get("unidades_por_nivel2", 1)
            return round(cantidad * float(maples) * float(huevos), 6)
        if pres == nombre_nivel2:
            # Un maple
            kg_maple = float(equiv.get("kg_por_empaque", 0)) / float(equiv.get("nivel2_por_empaque", 1)) if equiv.get("nivel2_por_empaque") else 0
            if kg_maple:
                return round(cantidad * kg_maple, 6)
            huevos = equiv.get("unidades_por_nivel2", 1)
            return round(cantidad * float(huevos), 6)

    # Fallback: sin conversión (ya es unidad base o presentación desconocida)
    return round(cantidad, 6)


def registrar_venta(db: Session, venta_data: schemas.VentaCreate):
    """
    Registra una venta, calcula costos/precios, actualiza stock y genera
    movimientos de inventario tipo SALIDA.

    Toda la operación se realiza en una única transacción: si algo falla
    en cualquier punto, se revierte por completo (rollback) y no queda
    stock descontado ni documentos a medio crear.
    """
    if not venta_data.detalles:
        raise ValueError("La venta debe contener al menos un producto")

    try:
        # El precio_unitario ingresado es siempre el precio FINAL que paga el
        # cliente (ya incluye IGV si corresponde). Nunca se suma IGV encima
        # del precio: se desglosa hacia atrás solo para SUNAT/comprobantes.
        bruto = 0.0
        detalles = []
        for item in venta_data.detalles:
            producto = get_producto(db, item.producto_id)
            if not producto:
                raise ValueError(f"Producto no encontrado: {item.producto_id}")
            if item.cantidad <= 0:
                raise ValueError("Cantidad debe ser mayor a cero")

            # Convertir cantidad de presentación → unidades base para validar stock
            presentacion = getattr(item, "presentacion", None) or producto.unidad_base or "unidad"
            cantidad_base = _cantidad_en_unidades_base(producto, presentacion, item.cantidad)

            if cantidad_base > producto.stock_actual:
                raise ValueError(
                    f"Stock insuficiente para '{producto.nombre}' "
                    f"({presentacion}). Disponible: {producto.stock_actual} {producto.unidad_base}."
                )

            subtotal_item = item.precio_unitario * item.cantidad
            bruto += subtotal_item - item.descuento
            detalles.append({
                "producto": producto,
                "item": item,
                "subtotal_item": subtotal_item,
                "cantidad_base": cantidad_base,
                "presentacion": presentacion,
            })

        # El total es el monto final que paga el cliente: precios ya
        # cargados con IGV, menos el descuento global. La base imponible y
        # el IGV se desglosan a partir de ese total (total = base * 1.18).
        total = round(bruto - venta_data.descuento, 2)
        incluye_igv = getattr(venta_data, "incluye_igv", True)
        if incluye_igv:
            subtotal = round(total / 1.18, 2)
            igv = round(total - subtotal, 2)
        else:
            subtotal = total
            igv = 0.0

        tipo_doc = getattr(venta_data, "tipo_documento", "NOTA_VENTA") or "NOTA_VENTA"

        # Resolver el cliente vinculado a la venta. Si viene un cliente_id, es
        # la fuente de verdad para el DNI/RUC. Si no viene (por ejemplo, se usó
        # el buscador SUNAT/RENIEC sin haber registrado antes al cliente), se
        # busca por DNI/RUC y, si tampoco existe, se registra automáticamente
        # para que la venta quede vinculada por cliente_id en vez de perder el
        # dato de documento del cliente.
        cliente_id = venta_data.cliente_id
        cliente_nombre = getattr(venta_data, "cliente_nombre", None)
        cliente_dni = None
        cliente_ruc = None

        if cliente_id:
            cliente_db = get_cliente(db, cliente_id)
            if not cliente_db:
                raise ValueError("Cliente no encontrado")
            cliente_dni = cliente_db.dni
            cliente_ruc = cliente_db.ruc
        else:
            dni_in = (getattr(venta_data, "cliente_dni", None) or "").strip() or None
            ruc_in = (getattr(venta_data, "cliente_ruc", None) or "").strip() or None
            if dni_in or ruc_in:
                cliente_db = get_cliente_por_dni(db, dni_in) if dni_in else None
                if not cliente_db and ruc_in:
                    cliente_db = get_cliente_por_ruc(db, ruc_in)
                if not cliente_db:
                    cliente_db = models.Cliente(
                        dni=dni_in,
                        ruc=ruc_in,
                        nombre=None if ruc_in else cliente_nombre,
                        razon_social=cliente_nombre if ruc_in else None,
                    )
                    db.add(cliente_db)
                    db.flush()
                cliente_id = cliente_db.id
                cliente_dni = cliente_db.dni
                cliente_ruc = cliente_db.ruc

        if tipo_doc == "FACTURA" and (not cliente_ruc or len(cliente_ruc) != 11):
            raise ValueError("Factura requiere RUC del cliente (11 dígitos)")

        # Obtener serie y número correlativo (usa with_for_update + flush, no commit)
        serie = SERIES_DOC.get(tipo_doc, "NV01")
        numero = _siguiente_numero_documento(db, serie)

        venta = models.Venta(
            cliente_id=cliente_id,
            cliente_nombre=cliente_nombre,
            cliente_dni=cliente_dni,
            cliente_ruc=cliente_ruc,
            subtotal=round(subtotal, 2),
            descuento=venta_data.descuento,
            igv=igv,
            total=total,
            forma_pago=venta_data.forma_pago,
            estado="COMPLETADA",
            venta_rapida=venta_data.venta_rapida,
            tipo_documento=tipo_doc,
            serie=serie,
            numero_documento=numero,
        )
        db.add(venta)
        db.flush()  # asigna venta.id sin confirmar la transacción

        for detalle_data in detalles:
            producto = detalle_data["producto"]
            item = detalle_data["item"]
            subtotal_item = detalle_data["subtotal_item"]
            cantidad_base = detalle_data["cantidad_base"]
            presentacion = detalle_data["presentacion"]
            total_item = round(subtotal_item - item.descuento, 2)

            detalle = models.VentaDetalle(
                venta_id=venta.id,
                producto_id=producto.id,
                cantidad=item.cantidad,
                precio_unitario=item.precio_unitario,
                descuento=item.descuento,
                subtotal=subtotal_item,
                total=total_item,
                lote=producto.lote,
                fecha_vencimiento=producto.fecha_vencimiento,
                presentacion=presentacion,
                nombre_producto=producto.nombre,
            )
            db.add(detalle)

            # Descontar en unidades base (no en presentación vendida)
            producto.stock_actual = round(producto.stock_actual - cantidad_base, 6)
            producto.updated_at = datetime.utcnow()

            movimiento = models.MovimientoInventario(
                producto_id=producto.id,
                tipo="SALIDA",
                cantidad=cantidad_base,
                costo_unitario=producto.costo,
                precio_unitario=item.precio_unitario,
                nota=f"Venta #{venta.id} — {tipo_doc} — {presentacion}",
                stock_despues=producto.stock_actual,
            )
            db.add(movimiento)

        caja = models.Caja(
            descripcion=f"Ingreso por venta #{venta.id} ({serie}-{numero})",
            ingreso=venta.total,
            egreso=0.0,
            venta_id=venta.id,
        )
        db.add(caja)

        db.commit()
        db.refresh(venta)
        return venta
    except Exception:
        db.rollback()
        raise


def listar_ventas(db: Session, skip: int = 0, limit: int = 500, query: str = None, fecha_desde: str = None, fecha_hasta: str = None):
    from datetime import datetime as dt
    ventas = db.query(models.Venta).order_by(models.Venta.fecha.desc())
    if query:
        busqueda = f"%{query}%"
        ventas = ventas.join(models.Cliente, isouter=True).filter(
            models.Venta.forma_pago.ilike(busqueda)
            | models.Venta.estado.ilike(busqueda)
            | models.Cliente.nombre.ilike(busqueda)
            | models.Cliente.apellidos.ilike(busqueda)
        )
    if fecha_desde:
        try:
            ventas = ventas.filter(models.Venta.fecha >= dt.strptime(fecha_desde, "%Y-%m-%d"))
        except ValueError:
            pass
    if fecha_hasta:
        try:
            fecha_hasta_dt = dt.strptime(fecha_hasta, "%Y-%m-%d").replace(hour=23, minute=59, second=59)
            ventas = ventas.filter(models.Venta.fecha <= fecha_hasta_dt)
        except ValueError:
            pass
    return ventas.offset(skip).limit(limit).all()


def get_venta(db: Session, venta_id: int):
    return db.query(models.Venta).filter(models.Venta.id == venta_id).first()


def anular_venta(db: Session, venta_id: int):
    """
    Anula una venta y revierte el stock de sus detalles en una única
    transacción (un solo commit). Si algo falla, se hace rollback completo
    para que la venta no quede marcada como ANULADA sin haber devuelto el stock.
    """
    venta = get_venta(db, venta_id)
    if not venta:
        return None
    if venta.estado == "ANULADA":
        return venta

    try:
        venta.estado = "ANULADA"
        venta.updated_at = datetime.utcnow()

        for detalle in venta.detalles:
            producto = get_producto(db, detalle.producto_id)
            if producto:
                producto.stock_actual += detalle.cantidad
                producto.updated_at = datetime.utcnow()

                movimiento = models.MovimientoInventario(
                    producto_id=producto.id,
                    tipo="DEVOLUCION",
                    cantidad=detalle.cantidad,
                    costo_unitario=producto.costo,
                    precio_unitario=detalle.precio_unitario,
                    nota=f"Anulación venta #{venta.id}",
                    stock_despues=producto.stock_actual,
                )
                db.add(movimiento)

        db.commit()
        db.refresh(venta)
        return venta
    except Exception:
        db.rollback()
        raise


def eliminar_venta(db: Session, venta_id: int):
    venta = get_venta(db, venta_id)
    if not venta:
        return None

    try:
        # Revertir stock de cada detalle
        for detalle in venta.detalles:
            producto = get_producto(db, detalle.producto_id)
            if producto and venta.estado != "ANULADA":
                producto.stock_actual += detalle.cantidad
                producto.updated_at = datetime.utcnow()
                db.add(models.MovimientoInventario(
                    producto_id=producto.id,
                    tipo="DEVOLUCION",
                    cantidad=detalle.cantidad,
                    costo_unitario=producto.costo,
                    precio_unitario=detalle.precio_unitario,
                    nota=f"Eliminación venta #{venta.id}",
                    stock_despues=producto.stock_actual,
                ))

        db.delete(venta)
        db.commit()
        return {"id": venta_id}
    except Exception:
        db.rollback()
        raise


def reporte_ventas_diarias(db: Session):
    return (
        db.query(
            func.date(models.Venta.fecha).label("fecha"),
            func.sum(models.Venta.total).label("total")
        )
        .group_by(func.date(models.Venta.fecha))
        .order_by(func.date(models.Venta.fecha).desc())
        .all()
    )


def reporte_ventas_mensuales(db: Session):
    return (
        db.query(
            func.date_trunc("month", models.Venta.fecha).label("mes"),
            func.sum(models.Venta.total).label("total")
        )
        .group_by(func.date_trunc("month", models.Venta.fecha))
        .order_by(func.date_trunc("month", models.Venta.fecha).desc())
        .all()
    )


def reporte_productos_mas_vendidos(db: Session, limit: int = 10):
    return (
        db.query(
            models.Producto.nombre,
            func.sum(models.VentaDetalle.cantidad).label("cantidad_vendida")
        )
        .join(models.VentaDetalle, models.Producto.id == models.VentaDetalle.producto_id)
        .group_by(models.Producto.nombre)
        .order_by(func.sum(models.VentaDetalle.cantidad).desc())
        .limit(limit)
        .all()
    )


def reporte_productos_menos_vendidos(db: Session, limit: int = 10):
    return (
        db.query(
            models.Producto.nombre,
            func.sum(models.VentaDetalle.cantidad).label("cantidad_vendida")
        )
        .join(models.VentaDetalle, models.Producto.id == models.VentaDetalle.producto_id)
        .group_by(models.Producto.nombre)
        .order_by(func.sum(models.VentaDetalle.cantidad).asc())
        .limit(limit)
        .all()
    )


def reporte_stock_actual(db: Session):
    return db.query(models.Producto).filter(models.Producto.eliminado == False).all()


def reporte_productos_vencidos(db: Session):
    return db.query(models.Producto).filter(
        models.Producto.eliminado == False,
        models.Producto.fecha_vencimiento <= func.current_date()
    ).all()


def reporte_clientes_frecuentes(db: Session, limit: int = 10):
    return (
        db.query(
            models.Cliente,
            func.count(models.Venta.id).label("compras"),
            func.sum(models.Venta.total).label("total_comprado")
        )
        .join(models.Venta, models.Cliente.id == models.Venta.cliente_id)
        .group_by(models.Cliente.id)
        .order_by(func.count(models.Venta.id).desc())
        .limit(limit)
        .all()
    )


def reporte_clientes_nuevos(db: Session, limit: int = 10):
    return (
        db.query(models.Cliente)
        .order_by(models.Cliente.created_at.desc())
        .limit(limit)
        .all()
    )


# ── Compras ────────────────────────────────────────────────────────────────────

def _calcular_detalle_compra(item: "schemas.CompraDetalleCreate", producto: "models.Producto | None" = None) -> dict:
    """
    Aplica las fórmulas de desglose según tipo_presentacion y devuelve
    todos los campos calculados listos para persistir.

    Si un factor de conversión no viene en `item`, se intenta leer de
    producto.equivalencias (configurado en la ficha del catálogo).
    """
    pct = item.porcentaje_ganancia / 100
    costo_empaque = round(item.precio_empaque, 4)

    # Helper: leer equivalencia del item o del catálogo del producto
    def _equiv(campo_item: float | None, campo_equiv: str) -> float | None:
        if campo_item and campo_item > 0:
            return campo_item
        if producto and isinstance(producto.equivalencias, dict):
            v = producto.equivalencias.get(campo_equiv)
            return float(v) if v else None
        return None

    tipo = item.tipo_presentacion

    if tipo == "caja_unidad":
        n = _equiv(item.unidades_por_empaque, "unidades_por_empaque")
        if not n:
            raise ValueError("Se requiere unidades_por_empaque para tipo caja_unidad")
        costo_unitario = round(costo_empaque / n, 4)
        return dict(
            costo_empaque=costo_empaque,
            costo_unitario=costo_unitario,
            costo_nivel2=None,
            precio_venta_empaque=round(costo_empaque * (1 + pct), 2),
            precio_venta_unitario=round(costo_unitario * (1 + pct), 2),
            precio_venta_nivel2=None,
            stock_ingresado=item.cantidad_empaque * n,
            unidad_stock="unidad",
        )

    elif tipo == "saco_kilo":
        kg = _equiv(item.kg_por_empaque, "kg_por_empaque")
        if not kg:
            raise ValueError("Se requiere kg_por_empaque para tipo saco_kilo")
        costo_unitario = round(costo_empaque / kg, 4)
        return dict(
            costo_empaque=costo_empaque,
            costo_unitario=costo_unitario,
            costo_nivel2=None,
            precio_venta_empaque=round(costo_empaque * (1 + pct), 2),
            precio_venta_unitario=round(costo_unitario * (1 + pct), 2),
            precio_venta_nivel2=None,
            stock_ingresado=item.cantidad_empaque * kg,
            unidad_stock="kilo",
        )

    elif tipo == "saco_unidad":
        n = _equiv(item.unidades_por_empaque, "unidades_por_empaque")
        if not n:
            raise ValueError("Se requiere unidades_por_empaque para tipo saco_unidad")
        costo_unitario = round(costo_empaque / n, 4)
        return dict(
            costo_empaque=costo_empaque,
            costo_unitario=costo_unitario,
            costo_nivel2=None,
            precio_venta_empaque=round(costo_empaque * (1 + pct), 2),
            precio_venta_unitario=round(costo_unitario * (1 + pct), 2),
            precio_venta_nivel2=None,
            stock_ingresado=item.cantidad_empaque * n,
            unidad_stock="unidad",
        )

    elif tipo == "multinivel":
        maples_por_paq = _equiv(item.nivel2_cantidad, "nivel2_por_empaque")
        if not maples_por_paq:
            raise ValueError("Se requiere nivel2_cantidad para tipo multinivel")
        huevos_por_maple = _equiv(item.unidades_por_nivel2, "unidades_por_nivel2") or 1
        kg_por_paq = _equiv(item.kg_por_empaque, "kg_por_empaque") or 0

        costo_nivel2 = round(costo_empaque / maples_por_paq, 4)
        precio_venta_empaque = round(costo_empaque * (1 + pct), 2)
        precio_venta_nivel2 = round(costo_nivel2 * (1 + pct), 2)

        if kg_por_paq > 0:
            costo_unitario = round(costo_empaque / kg_por_paq, 4)
            precio_venta_unitario = round(costo_unitario * (1 + pct), 2)
            stock_ingresado = item.cantidad_empaque * kg_por_paq
            unidad_stock = "kilo"
        else:
            total_huevos = maples_por_paq * huevos_por_maple
            costo_unitario = round(costo_empaque / total_huevos, 4)
            precio_venta_unitario = round(costo_unitario * (1 + pct), 2)
            stock_ingresado = item.cantidad_empaque * total_huevos
            unidad_stock = "unidad"

        return dict(
            costo_empaque=costo_empaque,
            costo_unitario=costo_unitario,
            costo_nivel2=costo_nivel2,
            precio_venta_empaque=precio_venta_empaque,
            precio_venta_unitario=precio_venta_unitario,
            precio_venta_nivel2=precio_venta_nivel2,
            stock_ingresado=stock_ingresado,
            unidad_stock=unidad_stock,
        )

    raise ValueError(f"tipo_presentacion desconocido: {tipo}")


def registrar_compra(db: Session, compra_data: "schemas.CompraCreate"):
    """
    Registra una compra, calcula costos/precios, actualiza stock y genera
    movimientos de inventario tipo ENTRADA.
    """
    if not compra_data.detalles:
        raise ValueError("La compra debe tener al menos un producto")

    # 1. Cabecera
    db_compra = models.Compra(
        numero=compra_data.numero,
        proveedor=compra_data.proveedor,
        observaciones=compra_data.observaciones,
        estado="RECIBIDA",
    )
    db.add(db_compra)
    db.flush()  # obtener id sin commit

    # El precio_empaque que paga el usuario al proveedor ya incluye IGV;
    # nunca se le suma IGV encima. El desglose se hace hacia atrás al final.
    total_pagado = 0.0

    for item in compra_data.detalles:
        producto = get_producto(db, item.producto_id)
        if not producto:
            raise ValueError(f"Producto no encontrado: {item.producto_id}")

        calculo = _calcular_detalle_compra(item, producto)
        linea_total = item.precio_empaque * item.cantidad_empaque
        total_pagado += linea_total

        # 2. Línea de detalle
        detalle = models.CompraDetalle(
            compra_id=db_compra.id,
            producto_id=item.producto_id,
            tipo_presentacion=item.tipo_presentacion,
            cantidad_empaque=item.cantidad_empaque,
            nombre_empaque=item.nombre_empaque,
            precio_empaque=item.precio_empaque,
            unidades_por_empaque=item.unidades_por_empaque,
            kg_por_empaque=item.kg_por_empaque,
            nivel2_cantidad=item.nivel2_cantidad,
            nivel2_nombre=item.nivel2_nombre,
            unidades_por_nivel2=item.unidades_por_nivel2,
            porcentaje_ganancia=item.porcentaje_ganancia,
            lote=item.lote,
            fecha_vencimiento=item.fecha_vencimiento,
            **calculo,
        )
        db.add(detalle)

        # 3. Actualizar producto: costo, precio venta, precios por presentacion
        producto.costo = calculo["costo_unitario"]
        producto.precio_venta = calculo["precio_venta_unitario"]
        producto.stock_actual = round(producto.stock_actual + calculo["stock_ingresado"], 4)
        producto.unidad_base = calculo["unidad_stock"]

        # Obtener la configuración de categoría para calcular TODOS los precios de venta
        pct = item.porcentaje_ganancia / 100
        cat = get_categoria_config_por_nombre(db, producto.categoria) if producto.categoria else None
        nuevos_precios = _precios_por_presentacion_categoria(
            calculo=calculo,
            tipo_presentacion=item.tipo_presentacion,
            producto=producto,
            cat=cat,
            pct=pct,
            nombre_empaque=item.nombre_empaque or producto.nombre_empaque_mayor or "Empaque",
            nivel2_nombre=item.nivel2_nombre or producto.nombre_nivel2,
        )
        producto.precios_presentacion = nuevos_precios
        producto.utilidad = calculo["precio_venta_unitario"] - calculo["costo_unitario"]

        if item.lote:
            producto.lote = item.lote
        if item.fecha_vencimiento:
            producto.fecha_vencimiento = item.fecha_vencimiento
        producto.updated_at = datetime.utcnow()

        # 4. Movimiento de inventario
        movimiento = models.MovimientoInventario(
            producto_id=producto.id,
            tipo="ENTRADA",
            cantidad=calculo["stock_ingresado"],
            costo_unitario=calculo["costo_unitario"],
            precio_unitario=calculo["precio_venta_unitario"],
            nota=f"Compra #{db_compra.id} — {item.nombre_empaque}",
            lote=item.lote,
            fecha_vencimiento=item.fecha_vencimiento,
            stock_despues=producto.stock_actual,
        )
        db.add(movimiento)

    # 5. Totales de cabecera: el total es lo que realmente se pagó al
    # proveedor (ya con IGV incluido); el subtotal y el IGV se desglosan
    # hacia atrás a partir de ese total, solo para el registro contable.
    total = round(total_pagado, 2)
    subtotal = round(total / 1.18, 2)
    igv = round(total - subtotal, 2)
    db_compra.subtotal = subtotal
    db_compra.igv = igv
    db_compra.total = total

    db.commit()
    db.refresh(db_compra)
    return db_compra


def listar_compras(db: Session, skip: int = 0, limit: int = 100):
    return (
        db.query(models.Compra)
        .order_by(models.Compra.fecha.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )


def get_compra(db: Session, compra_id: int):
    return db.query(models.Compra).filter(models.Compra.id == compra_id).first()


def anular_compra(db: Session, compra_id: int):
    compra = get_compra(db, compra_id)
    if not compra:
        return None
    if compra.estado == "ANULADA":
        return compra

    compra.estado = "ANULADA"
    for detalle in compra.detalles:
        producto = get_producto(db, detalle.producto_id)
        if producto:
            producto.stock_actual = max(0, round(producto.stock_actual - detalle.stock_ingresado, 4))
            db.add(models.MovimientoInventario(
                producto_id=producto.id,
                tipo="AJUSTE_NEGATIVO",
                cantidad=detalle.stock_ingresado,
                costo_unitario=detalle.costo_unitario,
                precio_unitario=detalle.precio_venta_unitario,
                nota=f"Anulación compra #{compra_id}",
                stock_despues=producto.stock_actual,
            ))
            producto.updated_at = datetime.utcnow()

    compra.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(compra)
    return compra


def _precios_por_presentacion_categoria(
    calculo: dict,
    tipo_presentacion: str,
    producto: "models.Producto",
    cat: "models.CategoriaConfig | None",
    pct: float,
    nombre_empaque: str,
    nivel2_nombre: str | None,
) -> dict:
    """
    Dado el resultado base de _calcular_detalle_compra, genera un dict
    { nombre_presentacion: precio_venta } para TODAS las unidades de venta
    configuradas en la categoría del producto.

    Se usa tanto en calcular_preview_compra como en registrar_compra para
    asegurar que precios_presentacion contenga todas las opciones de venta,
    independientemente de la unidad usada al comprar.
    """
    mult = 1 + pct
    nuevos_precios: dict = {}

    if cat and cat.conversiones and cat.unidades_venta:
        conversiones = dict(cat.conversiones)
        tipo = tipo_presentacion

        # Costo base por kg o por unidad — derivado del cálculo
        if tipo == "saco_kilo":
            costo_base_kilo = calculo["costo_unitario"]
            costo_base_unidad = None
        elif tipo == "multinivel":
            if calculo["unidad_stock"] == "kilo":
                costo_base_kilo = calculo["costo_unitario"]
                costo_base_unidad = None
            else:
                costo_base_kilo = None
                costo_base_unidad = calculo["costo_unitario"]
        else:
            # caja_unidad / saco_unidad
            costo_base_kilo = None
            costo_base_unidad = calculo["costo_unitario"]

        for unidad in cat.unidades_venta:
            conv = conversiones.get(unidad, {})
            tipo_conv = conv.get("tipo", "base_conteo")
            costo = None

            if tipo_conv == "base_peso" and costo_base_kilo is not None:
                costo = costo_base_kilo
            elif tipo_conv == "base_conteo" and costo_base_unidad is not None:
                costo = costo_base_unidad
            elif tipo_conv == "peso" and costo_base_kilo is not None:
                costo = costo_base_kilo * float(conv.get("kg", 1))
            elif tipo_conv == "conteo" and costo_base_unidad is not None:
                costo = costo_base_unidad * float(conv.get("unidades", 1))
            elif tipo_conv == "conteo" and costo_base_kilo is not None:
                kg_u = float(conv.get("kg", 0))
                if kg_u > 0:
                    costo = costo_base_kilo * kg_u
            elif tipo_conv == "fraccion" and costo_base_kilo is not None:
                base_nombre = conv.get("base", "saco")
                factor = float(conv.get("factor", 1))
                base_conv = conversiones.get(base_nombre, {})
                kg_base = float(base_conv.get("kg", 1))
                costo = costo_base_kilo * kg_base * factor
            elif tipo_conv == "multinivel":
                kg_total = float(conv.get("kg_por_empaque", 0))
                if costo_base_kilo is not None and kg_total > 0:
                    costo = costo_base_kilo * kg_total
                elif costo_base_unidad is not None:
                    n2c = float(conv.get("nivel2_cantidad", 1))
                    n2_nombre = conv.get("nivel2", "")
                    n2_conv = conversiones.get(n2_nombre, {})
                    upm = float(n2_conv.get("unidades", 1))
                    costo = costo_base_unidad * n2c * upm

            if costo is not None:
                nuevos_precios[unidad] = round(costo * mult, 2)

    # Fallback: si no hay categoría configurada, guardar los valores base del cálculo
    if not nuevos_precios:
        nuevos_precios[nombre_empaque.lower()] = calculo["precio_venta_empaque"]
        nuevos_precios[calculo["unidad_stock"]] = calculo["precio_venta_unitario"]
        if calculo.get("precio_venta_nivel2") and nivel2_nombre:
            nuevos_precios[nivel2_nombre.lower()] = calculo["precio_venta_nivel2"]

    return nuevos_precios


def _recalcular_precios_presentacion(db: Session, producto: "models.Producto", costo_unitario: float, precio_unitario: float) -> None:
    """
    Recalcula producto.precios_presentacion usando el MISMO motor de
    conversiones por categoría (_precios_por_presentacion_categoria) que usa
    Compras al registrar una compra.

    Se llama también desde Inventario (entradas/ajustes manuales) para que
    un cambio de costo/precio unitario fuera del flujo de Compras no deje
    los precios por presentación (caja, saco, maple, etc.) desactualizados
    respecto al nuevo precio unitario — la causa de la desunificación
    detectada entre ambos módulos.
    """
    if not costo_unitario or costo_unitario <= 0 or not producto.categoria:
        return

    cat = get_categoria_config_por_nombre(db, producto.categoria)
    if not cat or not cat.conversiones or not cat.unidades_venta:
        return  # sin configuración de categoría no hay forma confiable de recalcular por presentación

    precio_unitario = precio_unitario or costo_unitario
    pct = max((precio_unitario / costo_unitario) - 1, 0)

    calculo = {
        "costo_unitario": costo_unitario,
        "unidad_stock": producto.unidad_base or "unidad",
        # Fallback seguro si el motor no encuentra conversión para ninguna
        # unidad de venta configurada (evita KeyError en _precios_por_presentacion_categoria)
        "precio_venta_unitario": round(precio_unitario, 2),
        "precio_venta_empaque": round(precio_unitario, 2),
    }

    nuevos_precios = _precios_por_presentacion_categoria(
        calculo=calculo,
        tipo_presentacion=producto.tipo_flujo or "caja_unidad",
        producto=producto,
        cat=cat,
        pct=pct,
        nombre_empaque=producto.nombre_empaque_mayor or "Empaque",
        nivel2_nombre=producto.nombre_nivel2,
    )
    if nuevos_precios:
        producto.precios_presentacion = nuevos_precios


def calcular_preview_compra(item: "schemas.CompraDetalleCreate", db: "Session | None" = None) -> dict:
    """
    Endpoint de preview: calcula sin persistir.
    Devuelve los campos base del cálculo MÁS una lista 'presentaciones' con
    costo y precio_venta para cada unidad de la categoría del producto.
    """
    producto = None
    if db is not None and item.producto_id:
        producto = get_producto(db, item.producto_id)

    resultado = _calcular_detalle_compra(item, producto)
    pct = item.porcentaje_ganancia / 100
    mult = 1 + pct

    cat = None
    if db is not None and producto and producto.categoria:
        cat = get_categoria_config_por_nombre(db, producto.categoria)

    precios_dict = _precios_por_presentacion_categoria(
        calculo=resultado,
        tipo_presentacion=item.tipo_presentacion,
        producto=producto or type("P", (), {
            "costo_unitario": resultado["costo_unitario"],
            "unidad_stock": resultado["unidad_stock"],
            "tipo_flujo": item.tipo_presentacion,
            "equivalencias": {},
            "nombre_empaque_mayor": item.nombre_empaque,
            "nombre_unidad_menor": None,
            "nombre_nivel2": item.nivel2_nombre,
        })(),
        cat=cat,
        pct=pct,
        nombre_empaque=item.nombre_empaque or "Empaque",
        nivel2_nombre=item.nivel2_nombre,
    )

    # Convertir dict a lista con descripción para el frontend
    conversiones = dict(cat.conversiones) if cat and cat.conversiones else {}
    presentaciones = [
        {
            "unidad": unidad,
            "costo": round(precio / mult, 4),
            "precio_venta": precio,
            "descripcion": conversiones.get(unidad, {}).get("descripcion"),
        }
        for unidad, precio in precios_dict.items()
    ]

    resultado["presentaciones"] = presentaciones
    return resultado


# ── CategoriaConfig ────────────────────────────────────────────────────────────

# Configuraciones predeterminadas para categorías comunes de distribuidora
CATEGORIAS_DEFAULT = [
    {
        "nombre": "Aceites",
        "descripcion": "Aceite vegetal, manteca, margarina",
        "icono": "🧈",
        "color": "#eab308",
        "unidades_compra": ["caja", "unidad"],
        "unidades_venta": ["caja", "unidad"],
        "conversiones": {
            "caja":   {"tipo": "conteo", "unidades": 12, "descripcion": "1 Caja = 12 Unidades"},
            "unidad": {"tipo": "base_conteo", "descripcion": "Unidad individual"},
        },
        "tipo_flujo_default": "caja_unidad",
        "empaque_mayor_default": "Caja",
        "unidad_menor_default": "Unidad",
        "margen_ganancia_default": 20.0,
    },
    {
        "nombre": "Menestras",
        "descripcion": "Lentejas, frijoles, arvejas, pallares",
        "icono": "🫘",
        "color": "#f59e0b",
        "unidades_compra": ["saco"],
        "unidades_venta": ["kilo", "medio_saco", "saco"],
        "conversiones": {
            "saco":       {"tipo": "peso",     "kg": 100, "descripcion": "1 Saco = 100 kg"},
            "medio_saco": {"tipo": "fraccion", "base": "saco", "factor": 0.5, "descripcion": "1/2 Saco = 50 kg"},
            "kilo":       {"tipo": "base_peso", "descripcion": "Por kilogramo"},
        },
        "tipo_flujo_default": "saco_kilo",
        "empaque_mayor_default": "Saco",
        "unidad_menor_default": "Kilo",
        "margen_ganancia_default": 20.0,
    },
    {
        "nombre": "Sal",
        "descripcion": "Sal yodada, sal de mesa",
        "icono": "🧂",
        "color": "#06b6d4",
        "unidades_compra": ["saco"],
        "unidades_venta": ["kilo", "medio_saco", "saco"],
        "conversiones": {
            "saco":       {"tipo": "peso",     "kg": 50, "descripcion": "1 Saco = 50 kg"},
            "medio_saco": {"tipo": "fraccion", "base": "saco", "factor": 0.5, "descripcion": "1/2 Saco = 25 kg"},
            "kilo":       {"tipo": "base_peso", "descripcion": "Por kilogramo"},
        },
        "tipo_flujo_default": "saco_kilo",
        "empaque_mayor_default": "Saco",
        "unidad_menor_default": "Kilo",
        "margen_ganancia_default": 20.0,
    },
    {
        "nombre": "Huevos",
        "descripcion": "Huevos por paquete, maple o kilo",
        "icono": "🥚",
        "color": "#f97316",
        "unidades_compra": ["paquete"],
        "unidades_venta": ["paquete", "maple", "kilo"],
        "conversiones": {
            "paquete": {"tipo": "multinivel", "nivel2": "maple", "nivel2_cantidad": 8, "kg_por_empaque": 19.2, "descripcion": "1 Paquete = 8 Maples"},
            "maple":   {"tipo": "conteo",    "unidades": 30, "kg": 2.4, "descripcion": "1 Maple = 30 huevos = 2.4 kg"},
            "kilo":    {"tipo": "base_peso",  "descripcion": "Por kilogramo"},
        },
        "tipo_flujo_default": "multinivel",
        "empaque_mayor_default": "Paquete",
        "unidad_menor_default": "Kilo",
        "nivel2_nombre_default": "Maple",
        "margen_ganancia_default": 20.0,
    },
    {
        "nombre": "Arroz y granos",
        "descripcion": "Arroz, quinua, kiwicha",
        "icono": "🌾",
        "color": "#10b981",
        "unidades_compra": ["saco"],
        "unidades_venta": ["kilo", "medio_saco", "saco"],
        "conversiones": {
            "saco":       {"tipo": "peso",     "kg": 50, "descripcion": "1 Saco = 50 kg"},
            "medio_saco": {"tipo": "fraccion", "base": "saco", "factor": 0.5, "descripcion": "1/2 Saco = 25 kg"},
            "kilo":       {"tipo": "base_peso", "descripcion": "Por kilogramo"},
        },
        "tipo_flujo_default": "saco_kilo",
        "empaque_mayor_default": "Saco",
        "unidad_menor_default": "Kilo",
        "margen_ganancia_default": 20.0,
    },
    {
        "nombre": "Limpieza",
        "descripcion": "Detergentes, desinfectantes",
        "icono": "🧹",
        "color": "#0f6df2",
        "unidades_compra": ["caja", "unidad"],
        "unidades_venta": ["caja", "unidad"],
        "conversiones": {
            "caja":   {"tipo": "conteo", "unidades": 12, "descripcion": "1 Caja = 12 Unidades"},
            "unidad": {"tipo": "base_conteo", "descripcion": "Unidad individual"},
        },
        "tipo_flujo_default": "caja_unidad",
        "empaque_mayor_default": "Caja",
        "unidad_menor_default": "Unidad",
        "margen_ganancia_default": 20.0,
    },
    {
        "nombre": "Shampoo y aseo",
        "descripcion": "Shampoo, acondicionador, pasta dental",
        "icono": "🧴",
        "color": "#8b5cf6",
        "unidades_compra": ["caja", "unidad"],
        "unidades_venta": ["caja", "unidad"],
        "conversiones": {
            "caja":   {"tipo": "conteo", "unidades": 12, "descripcion": "1 Caja = 12 Unidades"},
            "unidad": {"tipo": "base_conteo", "descripcion": "Unidad individual"},
        },
        "tipo_flujo_default": "caja_unidad",
        "empaque_mayor_default": "Caja",
        "unidad_menor_default": "Unidad",
        "margen_ganancia_default": 20.0,
    },
    {
        "nombre": "Conservas",
        "descripcion": "Atún, sardina, leche evaporada",
        "icono": "🥫",
        "color": "#ef4444",
        "unidades_compra": ["caja", "unidad"],
        "unidades_venta": ["caja", "unidad"],
        "conversiones": {
            "caja":   {"tipo": "conteo", "unidades": 48, "descripcion": "1 Caja = 48 Unidades"},
            "unidad": {"tipo": "base_conteo", "descripcion": "Unidad individual"},
        },
        "tipo_flujo_default": "caja_unidad",
        "empaque_mayor_default": "Caja",
        "unidad_menor_default": "Unidad",
        "margen_ganancia_default": 20.0,
    },
    {
        "nombre": "Azúcar",
        "descripcion": "Azúcar blanca, rubia",
        "icono": "🍬",
        "color": "#f43f5e",
        "unidades_compra": ["saco"],
        "unidades_venta": ["kilo", "medio_saco", "saco"],
        "conversiones": {
            "saco":       {"tipo": "peso",     "kg": 50, "descripcion": "1 Saco = 50 kg"},
            "medio_saco": {"tipo": "fraccion", "base": "saco", "factor": 0.5, "descripcion": "1/2 Saco = 25 kg"},
            "kilo":       {"tipo": "base_peso", "descripcion": "Por kilogramo"},
        },
        "tipo_flujo_default": "saco_kilo",
        "empaque_mayor_default": "Saco",
        "unidad_menor_default": "Kilo",
        "margen_ganancia_default": 20.0,
    },
    {
        "nombre": "Bebidas",
        "descripcion": "Gaseosas, jugos, agua",
        "icono": "🧃",
        "color": "#6366f1",
        "unidades_compra": ["caja", "unidad"],
        "unidades_venta": ["caja", "unidad"],
        "conversiones": {
            "caja":   {"tipo": "conteo", "unidades": 12, "descripcion": "1 Caja = 12 Unidades"},
            "unidad": {"tipo": "base_conteo", "descripcion": "Unidad individual"},
        },
        "tipo_flujo_default": "caja_unidad",
        "empaque_mayor_default": "Caja",
        "unidad_menor_default": "Unidad",
        "margen_ganancia_default": 20.0,
    },
]


def get_categoria_config(db: Session, categoria_id: int):
    return db.query(models.CategoriaConfig).filter(
        models.CategoriaConfig.id == categoria_id,
        models.CategoriaConfig.eliminado == False
    ).first()


def get_categoria_config_por_nombre(db: Session, nombre: str):
    return db.query(models.CategoriaConfig).filter(
        models.CategoriaConfig.nombre == nombre,
        models.CategoriaConfig.eliminado == False
    ).first()


def listar_categorias_config(db: Session):
    return db.query(models.CategoriaConfig).filter(
        models.CategoriaConfig.eliminado == False,
        models.CategoriaConfig.activo == True,
    ).order_by(models.CategoriaConfig.nombre).all()


def crear_categoria_config(db: Session, data: "schemas.CategoriaConfigCreate"):
    # Mismo caso que crear_categoria: "nombre" es UNIQUE a nivel de BD sin
    # importar "eliminado", así que una config borrada sigue ocupando el
    # nombre. Se busca cualquier fila con ese nombre y, si está eliminada,
    # se reactiva en vez de intentar un INSERT duplicado.
    existente = db.query(models.CategoriaConfig).filter(models.CategoriaConfig.nombre == data.nombre).first()
    if existente:
        if not existente.eliminado:
            raise ValueError(f"Ya existe una configuración para la categoría '{data.nombre}'")
        for field, value in data.dict().items():
            setattr(existente, field, value)
        existente.eliminado = False
        existente.updated_at = datetime.utcnow()
        db.commit()
        db.refresh(existente)
        return existente

    obj = models.CategoriaConfig(**data.dict())
    db.add(obj)
    try:
        db.commit()
    except (IntegrityError, DataError) as e:
        db.rollback()
        raise ValueError(f"No se pudo crear la configuración: {e.orig}")
    db.refresh(obj)
    return obj


def actualizar_categoria_config(db: Session, categoria_id: int, data: "schemas.CategoriaConfigUpdate"):
    obj = get_categoria_config(db, categoria_id)
    if not obj:
        return None
    for field, value in data.dict(exclude_unset=True).items():
        setattr(obj, field, value)
    obj.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(obj)
    return obj


def eliminar_categoria_config(db: Session, categoria_id: int):
    obj = get_categoria_config(db, categoria_id)
    if not obj:
        return None

    tiene_productos = db.query(models.Producto).filter(models.Producto.categoria == obj.nombre).first() is not None

    if tiene_productos:
        obj.eliminado = True
        obj.activo = False
        obj.updated_at = datetime.utcnow()
        db.commit()
        return obj

    db.delete(obj)
    db.commit()
    return {"id": categoria_id}


def sembrar_categorias_default(db: Session):
    """Inserta las categorías predeterminadas si no existen todavía (tanto en CategoriaConfig como en Categoria simple).

    Se hace commit e intercepta IntegrityError por cada categoría (en vez de un
    único commit al final) porque en Render el arranque puede correr más de una
    vez o en más de un worker: si dos procesos comprueban "no existe" casi a la
    vez, el segundo INSERT choca con el unique constraint del nombre. Sin este
    try/except esa IntegrityError tumbaba el despliegue del servidor.
    """
    for cat_data in CATEGORIAS_DEFAULT:
        # Sembrar CategoriaConfig (con unidades y conversiones)
        # El nombre es único a nivel de BD sin importar "eliminado", así que
        # se busca cualquier fila con ese nombre (evita IntegrityError si
        # quedó una fila eliminada lógicamente con el mismo nombre).
        if not db.query(models.CategoriaConfig).filter(models.CategoriaConfig.nombre == cat_data["nombre"]).first():
            campos_config = {k: v for k, v in cat_data.items()}
            obj = models.CategoriaConfig(**campos_config)
            db.add(obj)
            try:
                db.commit()
            except IntegrityError:
                db.rollback()
        # Sembrar Categoria simple (para el selector de productos y la página Categorías)
        if not db.query(models.Categoria).filter(models.Categoria.nombre == cat_data["nombre"]).first():
            simple = models.Categoria(
                nombre=cat_data["nombre"],
                descripcion=cat_data.get("descripcion", ""),
                icono=cat_data.get("icono", "📦"),
                color=cat_data.get("color", "#64748b"),
            )
            db.add(simple)
            try:
                db.commit()
            except IntegrityError:
                db.rollback()


# ── Motor de cálculo de precios por categoría ─────────────────────────────────

def calcular_precios_por_categoria(
    db: Session,
    categoria_nombre: str,
    unidad_compra: str,
    costo_compra: float,
    cantidad_comprada: float = 1.0,
    margen_ganancia: float = 20.0,
    factor_override: dict = None,
) -> "schemas.CalculoPrecioResponse":
    """
    Motor principal de cálculo de precios.
    Dado el costo de compra en una unidad específica, calcula el precio
    de venta sugerido para TODAS las unidades de venta de la categoría.

    Algoritmo:
    1. Obtener la configuración de la categoría
    2. Determinar el costo base por kg (si es peso) o por unidad (si es conteo)
    3. Para cada unidad de venta, calcular su precio usando las conversiones
    """
    cat = get_categoria_config_por_nombre(db, categoria_nombre)
    if not cat:
        raise ValueError(f"No hay configuración para la categoría '{categoria_nombre}'")

    conversiones = dict(cat.conversiones or {})
    if factor_override:
        # Permitir que el usuario sobreescriba factores en el momento de compra
        for k, v in factor_override.items():
            if k in conversiones:
                conversiones[k] = {**conversiones[k], **v}
            else:
                conversiones[k] = v

    pct = margen_ganancia / 100
    mult = 1 + pct

    # Paso 1: calcular el costo base (kilo o unidad base)
    conv_compra = conversiones.get(unidad_compra, {})
    tipo_compra = conv_compra.get("tipo", "base_conteo")
    costo_base_kilo = None    # S/ por kg
    costo_base_unidad = None  # S/ por unidad

    if tipo_compra == "peso":
        kg = float(conv_compra.get("kg", 1))
        costo_base_kilo = costo_compra / kg

    elif tipo_compra == "base_peso":
        costo_base_kilo = costo_compra  # ya es por kilo

    elif tipo_compra == "conteo":
        n = float(conv_compra.get("unidades", 1))
        costo_base_unidad = costo_compra / n

    elif tipo_compra == "base_conteo":
        costo_base_unidad = costo_compra  # ya es por unidad

    elif tipo_compra == "multinivel":
        # Ejemplo: paquete → maples → kg
        kg_por_empaque = float(conv_compra.get("kg_por_empaque", 0))
        nivel2_cant = float(conv_compra.get("nivel2_cantidad", 1))
        if kg_por_empaque > 0:
            costo_base_kilo = costo_compra / kg_por_empaque
        else:
            # Calcular por unidades totales
            nivel2_conv = conversiones.get(conv_compra.get("nivel2", ""), {})
            unidades_por_nivel2 = float(nivel2_conv.get("unidades", 1))
            total_unidades = nivel2_cant * unidades_por_nivel2
            costo_base_unidad = costo_compra / total_unidades

    elif tipo_compra == "fraccion":
        base = conv_compra.get("base", "saco")
        factor = float(conv_compra.get("factor", 1))
        base_conv = conversiones.get(base, {})
        if base_conv.get("tipo") == "peso":
            kg_base = float(base_conv.get("kg", 1))
            costo_base_kilo = costo_compra / (kg_base * factor)

    # Paso 2: calcular precio para cada unidad de venta.
    # ÚNICA fuente de verdad: se delega en _precios_por_presentacion_categoria,
    # el mismo motor que usan Compras (registrar_compra) e Inventario
    # (_recalcular_precios_presentacion). Ya no existe una copia paralela
    # de las reglas de conversión aquí.
    costo_base = costo_base_kilo if costo_base_kilo is not None else costo_base_unidad
    if costo_base is None:
        raise ValueError(f"No se pudo determinar el costo base para la unidad de compra '{unidad_compra}'")

    calculo = {
        "costo_unitario": costo_base,
        "unidad_stock": "kilo" if costo_base_kilo is not None else "unidad",
        # Fallback seguro si ninguna unidad de venta calza con las conversiones
        # (ver _precios_por_presentacion_categoria) — evita un KeyError.
        "precio_venta_unitario": round(costo_base * mult, 2),
        "precio_venta_empaque": round(costo_base * mult, 2),
    }
    # "saco_kilo"/"caja_unidad" solo indican al motor si el costo base está
    # en kg o en unidades — no se usa ningún dato real de Compras aquí.
    tipo_bridge = "saco_kilo" if costo_base_kilo is not None else "caja_unidad"

    precios_dict = _precios_por_presentacion_categoria(
        calculo=calculo,
        tipo_presentacion=tipo_bridge,
        producto=None,
        cat=cat,
        pct=pct,
        nombre_empaque=unidad_compra,
        nivel2_nombre=None,
    )

    precios = [
        schemas.PrecioCalculado(
            unidad=unidad,
            costo=round(precio_venta / mult, 4),
            precio_venta=precio_venta,
            descripcion=conversiones.get(unidad, {}).get("descripcion"),
        )
        for unidad, precio_venta in precios_dict.items()
    ]

    # Stock ingresado
    if costo_base_kilo is not None:
        if tipo_compra == "peso":
            kg = float(conv_compra.get("kg", 1))
            stock_ingresado = cantidad_comprada * kg
        elif tipo_compra == "multinivel":
            kg_por_emp = float(conv_compra.get("kg_por_empaque", 0))
            stock_ingresado = cantidad_comprada * kg_por_emp if kg_por_emp > 0 else cantidad_comprada
        else:
            stock_ingresado = cantidad_comprada
        unidad_stock = "kilo"
    else:
        if tipo_compra == "conteo":
            n = float(conv_compra.get("unidades", 1))
            stock_ingresado = cantidad_comprada * n
        elif tipo_compra == "multinivel":
            nivel2_cant = float(conv_compra.get("nivel2_cantidad", 1))
            nivel2_conv = conversiones.get(conv_compra.get("nivel2", ""), {})
            unidades_por_nivel2 = float(nivel2_conv.get("unidades", 1))
            stock_ingresado = cantidad_comprada * nivel2_cant * unidades_por_nivel2
        else:
            stock_ingresado = cantidad_comprada
        unidad_stock = "unidad"

    return schemas.CalculoPrecioResponse(
        categoria=categoria_nombre,
        unidad_compra=unidad_compra,
        costo_compra=costo_compra,
        margen_ganancia=margen_ganancia,
        precios=precios,
        stock_ingresado=round(stock_ingresado, 4),
        unidad_stock=unidad_stock,
    )

# ── Categorias (tabla simple) ──────────────────────────────────────────────────

def listar_categorias(db: Session):
    cats = db.query(models.Categoria).filter(
        models.Categoria.eliminado == False,
        models.Categoria.activo == True,
    ).order_by(models.Categoria.nombre).all()
    # Enriquecer con conteo de productos
    for cat in cats:
        cat.total_productos = db.query(func.count(models.Producto.id)).filter(
            models.Producto.categoria == cat.nombre,
            models.Producto.eliminado == False,
        ).scalar() or 0
    return cats


def get_categoria(db: Session, categoria_id: int):
    return db.query(models.Categoria).filter(
        models.Categoria.id == categoria_id,
        models.Categoria.eliminado == False,
    ).first()


def crear_categoria(db: Session, data: "schemas.CategoriaCreate"):
    # "nombre" tiene UNIQUE a nivel de BD sin importar "eliminado": una
    # categoría borrada (soft delete) sigue ocupando el nombre. Por eso hay
    # que buscar CUALQUIER fila con ese nombre (no solo las activas): si es
    # una eliminada, se reactiva en vez de intentar un INSERT duplicado que
    # chocaría contra el UNIQUE y devolvería el error crudo de Postgres.
    existente = db.query(models.Categoria).filter(models.Categoria.nombre == data.nombre).first()
    if existente:
        if not existente.eliminado:
            raise ValueError(f"Ya existe una categoría con el nombre '{data.nombre}'")
        for field, value in data.dict().items():
            setattr(existente, field, value)
        existente.eliminado = False
        existente.updated_at = datetime.utcnow()
        db.commit()
        db.refresh(existente)
        existente.total_productos = 0
        return existente

    obj = models.Categoria(**data.dict())
    db.add(obj)
    try:
        db.commit()
    except (IntegrityError, DataError) as e:
        db.rollback()
        raise ValueError(f"No se pudo crear la categoría: {e.orig}")
    db.refresh(obj)
    obj.total_productos = 0
    return obj


def actualizar_categoria(db: Session, categoria_id: int, data: "schemas.CategoriaUpdate"):
    obj = get_categoria(db, categoria_id)
    if not obj:
        return None
    for field, value in data.dict(exclude_unset=True).items():
        setattr(obj, field, value)
    obj.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(obj)
    obj.total_productos = db.query(func.count(models.Producto.id)).filter(
        models.Producto.categoria == obj.nombre,
        models.Producto.eliminado == False,
    ).scalar() or 0
    return obj


def eliminar_categoria(db: Session, categoria_id: int):
    obj = get_categoria(db, categoria_id)
    if not obj:
        return None

    # Categoria y CategoriaConfig son tablas independientes vinculadas solo
    # por nombre: si no se elimina también la config, la categoría borrada
    # sigue apareciendo en "Configuración de Unidades".
    config = get_categoria_config_por_nombre(db, obj.nombre)

    # Ningún producto tiene FK hacia categorias.id (Producto.categoria es
    # solo un string), así que si ya no queda ningún producto con este
    # nombre de categoría (ni siquiera soft-deleteado) se puede borrar de
    # verdad. Si aún hay productos referenciándola, se mantiene el soft
    # delete para no perder el ícono/color al mostrarlos.
    tiene_productos = db.query(models.Producto).filter(models.Producto.categoria == obj.nombre).first() is not None

    if tiene_productos:
        obj.eliminado = True
        obj.activo = False
        obj.updated_at = datetime.utcnow()
        if config:
            config.eliminado = True
            config.activo = False
            config.updated_at = datetime.utcnow()
        db.commit()
        return obj

    if config:
        db.delete(config)
    db.delete(obj)
    db.commit()
    return {"id": categoria_id}


# ── CajaMovimiento ─────────────────────────────────────────────────────────────

def listar_caja_movimientos(db: Session, skip: int = 0, limit: int = 500):
    return db.query(models.CajaMovimiento).order_by(
        models.CajaMovimiento.fecha.desc(),
        models.CajaMovimiento.created_at.desc(),
    ).offset(skip).limit(limit).all()


def crear_caja_movimiento(db: Session, data: "schemas.CajaMovimientoCreate"):
    obj = models.CajaMovimiento(**data.dict())
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return obj


def eliminar_caja_movimiento(db: Session, movimiento_id: int):
    obj = db.query(models.CajaMovimiento).filter(models.CajaMovimiento.id == movimiento_id).first()
    if not obj:
        return None
    db.delete(obj)
    db.commit()
    return obj


# ── Reporte resumen integral ───────────────────────────────────────────────────

def reporte_resumen(db: Session, periodo: str = "mes", fecha_desde: str = "", fecha_hasta: str = "") -> dict:
    """
    Calcula el resumen de ventas y compras para el período indicado
    directamente desde la BD (nunca desde localStorage).
    """
    from datetime import date, timedelta
    import calendar

    ahora = datetime.utcnow()

    # Calcular rango de fechas
    if periodo == "dia":
        inicio = ahora.replace(hour=0, minute=0, second=0, microsecond=0)
        fin = ahora
    elif periodo == "semana":
        lunes = ahora - timedelta(days=ahora.weekday())
        inicio = lunes.replace(hour=0, minute=0, second=0, microsecond=0)
        fin = ahora
    elif periodo == "mes":
        inicio = ahora.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        fin = ahora
    elif periodo == "año":
        inicio = ahora.replace(month=1, day=1, hour=0, minute=0, second=0, microsecond=0)
        fin = ahora
    elif periodo == "custom" and fecha_desde:
        inicio = datetime.strptime(fecha_desde, "%Y-%m-%d")
        fin = datetime.strptime(fecha_hasta, "%Y-%m-%d").replace(hour=23, minute=59, second=59) if fecha_hasta else ahora
    else:
        inicio = ahora.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        fin = ahora

    # Ventas del período
    ventas = db.query(models.Venta).filter(
        models.Venta.estado != "ANULADA",
        models.Venta.fecha >= inicio,
        models.Venta.fecha <= fin,
    ).all()

    total_ventas = sum(v.total for v in ventas)
    num_ventas = len(ventas)
    ticket_promedio = total_ventas / num_ventas if num_ventas > 0 else 0

    # Compras del período (movimientos ENTRADA ligados a compras)
    movimientos_entrada = db.query(models.MovimientoInventario).filter(
        models.MovimientoInventario.tipo == "ENTRADA",
        models.MovimientoInventario.fecha >= inicio,
        models.MovimientoInventario.fecha <= fin,
    ).all()
    total_compras = sum(m.costo_unitario * m.cantidad for m in movimientos_entrada)
    num_compras = len(movimientos_entrada)

    ganancia_bruta = total_ventas - total_compras
    margen = (ganancia_bruta / total_ventas * 100) if total_ventas > 0 else 0

    # Ventas por día
    por_dia: dict = {}
    for v in ventas:
        key = v.fecha.strftime("%d/%m/%Y")
        if key not in por_dia:
            por_dia[key] = {"fecha": key, "total": 0.0, "costo": 0.0, "numVentas": 0}
        por_dia[key]["total"] += v.total
        por_dia[key]["numVentas"] += 1
    for m in movimientos_entrada:
        key = m.fecha.strftime("%d/%m/%Y")
        if key in por_dia:
            por_dia[key]["costo"] += m.costo_unitario * m.cantidad
    ventas_por_dia = sorted(
        [{"fecha": k, **v, "ganancia": v["total"] - v["costo"]} for k, v in por_dia.items()],
        key=lambda x: x["fecha"],
    )

    # Top productos
    conteo: dict = {}
    for venta in ventas:
        for detalle in venta.detalles:
            pid = detalle.producto_id
            if pid not in conteo:
                nombre = detalle.producto.nombre if detalle.producto else f"#{pid}"
                conteo[pid] = {"nombre": nombre, "cantidad": 0.0, "total": 0.0}
            conteo[pid]["cantidad"] += detalle.cantidad
            conteo[pid]["total"] += detalle.total
    top_productos = sorted(conteo.values(), key=lambda x: x["total"], reverse=True)[:10]

    return {
        "totalVentas": round(total_ventas, 2),
        "totalCompras": round(total_compras, 2),
        "gananciaBruta": round(ganancia_bruta, 2),
        "margen": round(margen, 2),
        "numVentas": num_ventas,
        "numCompras": num_compras,
        "ticketPromedio": round(ticket_promedio, 2),
        "ventasPorDia": ventas_por_dia,
        "topProductos": top_productos,
    }
