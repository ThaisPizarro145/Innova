from datetime import datetime, date, timedelta
from sqlalchemy.orm import Session
from sqlalchemy import func, and_
from sqlalchemy.exc import IntegrityError, DataError
from app import models, schemas


def get_producto(db: Session, producto_id: int):
    return db.query(models.Producto).filter(models.Producto.id == producto_id, models.Producto.eliminado == False).first()


def enriquecer_producto(db: Session, producto: "models.Producto") -> "models.Producto":
    """
    Adjunta al objeto (no son columnas) el stock/costo/fechas calculados a
    partir de Lotes y Movimientos — mismo patrón que `total_productos` en
    `listar_categorias`. Se llama explícitamente solo donde se necesita (no
    en cada `get_producto` interno, para no pagar 3 queries de más por línea
    en flujos como registrar_venta/registrar_compra).
    """
    producto.stock_actual = db.query(
        func.coalesce(func.sum(models.Lote.cantidad_disponible), 0.0)
    ).filter(models.Lote.producto_id == producto.id).scalar() or 0.0

    ultima_entrada = (
        db.query(models.MovimientoInventario)
        .filter(models.MovimientoInventario.producto_id == producto.id, models.MovimientoInventario.tipo == "ENTRADA")
        .order_by(models.MovimientoInventario.fecha.desc())
        .first()
    )
    producto.ultimo_costo = ultima_entrada.costo_unitario if ultima_entrada else None
    producto.ultima_compra = ultima_entrada.fecha.date() if ultima_entrada else None

    ultima_salida = (
        db.query(models.MovimientoInventario)
        .filter(models.MovimientoInventario.producto_id == producto.id, models.MovimientoInventario.tipo == "SALIDA")
        .order_by(models.MovimientoInventario.fecha.desc())
        .first()
    )
    producto.ultima_venta = ultima_salida.fecha.date() if ultima_salida else None

    proximo_lote = (
        db.query(models.Lote)
        .filter(
            models.Lote.producto_id == producto.id,
            models.Lote.cantidad_disponible > 0,
            models.Lote.fecha_vencimiento.isnot(None),
        )
        .order_by(models.Lote.fecha_vencimiento.asc())
        .first()
    )
    producto.proximo_vencimiento = proximo_lote.fecha_vencimiento if proximo_lote else None
    return producto


def listar_productos(db: Session, skip: int = 0, limit: int = 100, query: str = None):
    productos = db.query(models.Producto).filter(models.Producto.eliminado == False)
    if query:
        busqueda = f"%{query}%"
        productos = productos.join(models.Categoria, models.Producto.categoria_id == models.Categoria.id, isouter=True).filter(
            models.Producto.nombre.ilike(busqueda)
            | models.Producto.laboratorio.ilike(busqueda)
            | models.Producto.marca.ilike(busqueda)
            | models.Categoria.nombre.ilike(busqueda)
        )
    resultado = productos.offset(skip).limit(limit).all()
    for producto in resultado:
        enriquecer_producto(db, producto)
    return resultado


def crear_producto(db: Session, producto: schemas.ProductoCreate):
    if not get_categoria(db, producto.categoria_id):
        raise ValueError("La categoría indicada no existe")

    db_producto = models.Producto(
        nombre=producto.nombre,
        categoria_id=producto.categoria_id,
        laboratorio=producto.laboratorio,
        marca=producto.marca,
        principio_activo=producto.principio_activo,
        concentracion=producto.concentracion,
        forma_farmaceutica=producto.forma_farmaceutica,
        presentacion_comercial=producto.presentacion_comercial,
        iva=producto.iva,
        stock_minimo=producto.stock_minimo,
        unidad_base=getattr(producto, "unidad_base", "unidad"),
        precios_presentacion=getattr(producto, "precios_presentacion", {}),
        unidades_por_caja=producto.unidades_por_caja,
        unidades_por_blister=producto.unidades_por_blister,
        activo=producto.activo,
    )
    db.add(db_producto)
    db.commit()
    db.refresh(db_producto)
    enriquecer_producto(db, db_producto)
    return db_producto


def actualizar_producto(db: Session, producto_id: int, producto: schemas.ProductoUpdate):
    db_producto = get_producto(db, producto_id)
    if not db_producto:
        return None

    if producto.categoria_id is not None and not get_categoria(db, producto.categoria_id):
        raise ValueError("La categoría indicada no existe")

    datos = producto.dict(exclude_unset=True)
    for field, value in datos.items():
        setattr(db_producto, field, value)

    db_producto.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(db_producto)
    enriquecer_producto(db, db_producto)
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
        enriquecer_producto(db, db_producto)
        return db_producto

    enriquecer_producto(db, db_producto)
    datos = schemas.ProductoResponse.from_orm(db_producto).dict()
    db.delete(db_producto)
    db.commit()
    return datos


def _asignar_fifo(db: Session, producto_id: int, cantidad_base: float, lote_id: int = None):
    """
    Descuenta `cantidad_base` unidades del stock de `producto_id` siguiendo
    FIFO por fecha de vencimiento (los lotes sin vencimiento se consumen al
    final; empate por antigüedad de creación). Si `lote_id` se indica,
    descuenta únicamente de ese lote puntual (usado por ajustes negativos
    dirigidos). Devuelve una lista de (lote, cantidad_tomada) por cada lote
    tocado. Lanza ValueError si no hay stock suficiente.
    """
    query = db.query(models.Lote).filter(
        models.Lote.producto_id == producto_id,
        models.Lote.cantidad_disponible > 0,
    )
    if lote_id:
        query = query.filter(models.Lote.id == lote_id)

    lotes = query.order_by(
        models.Lote.fecha_vencimiento.asc().nullslast(),
        models.Lote.created_at.asc(),
    ).with_for_update().all()

    disponible_total = sum(l.cantidad_disponible for l in lotes)
    if disponible_total < cantidad_base:
        raise ValueError("Stock insuficiente para completar la operación")

    restante = cantidad_base
    asignaciones = []
    for lote in lotes:
        if restante <= 0:
            break
        tomar = min(lote.cantidad_disponible, restante)
        lote.cantidad_disponible = round(lote.cantidad_disponible - tomar, 6)
        lote.updated_at = datetime.utcnow()
        restante = round(restante - tomar, 6)
        asignaciones.append((lote, tomar))

    db.flush()
    return asignaciones


def crear_movimiento_inventario(db: Session, movimiento: schemas.MovimientoInventarioCreate):
    """
    Ajuste manual de inventario. ENTRADA/SALIDA/DEVOLUCION solo los genera el
    sistema (Compras/Ventas) — aquí solo AJUSTE_POSITIVO/AJUSTE_NEGATIVO
    (ya validado también en el schema).
    """
    producto = get_producto(db, movimiento.producto_id)
    if not producto:
        raise ValueError("Producto no encontrado")

    if movimiento.tipo not in schemas.TIPOS_AJUSTE_MANUAL:
        raise ValueError("Solo se permiten ajustes manuales (AJUSTE_POSITIVO / AJUSTE_NEGATIVO)")

    try:
        if movimiento.tipo == "AJUSTE_POSITIVO":
            precio = movimiento.precio_unitario or movimiento.costo_unitario
            nuevo_lote = models.Lote(
                producto_id=producto.id,
                codigo_lote=movimiento.lote or "AJUSTE",
                fecha_vencimiento=movimiento.fecha_vencimiento,
                costo_unitario=movimiento.costo_unitario,
                precio_venta_unitario=precio,
                cantidad_inicial=movimiento.cantidad,
                cantidad_disponible=movimiento.cantidad,
            )
            db.add(nuevo_lote)
            db.flush()

            _recalcular_precios_presentacion(db, producto, movimiento.costo_unitario, precio)
            producto.updated_at = datetime.utcnow()

            db_movimiento = models.MovimientoInventario(
                producto_id=producto.id,
                lote_id=nuevo_lote.id,
                tipo="AJUSTE_POSITIVO",
                cantidad=movimiento.cantidad,
                costo_unitario=movimiento.costo_unitario,
                precio_unitario=precio,
                nota=movimiento.nota,
                lote=nuevo_lote.codigo_lote,
                fecha_vencimiento=nuevo_lote.fecha_vencimiento,
                stock_despues=nuevo_lote.cantidad_disponible,
            )
            db.add(db_movimiento)
        else:
            asignaciones = _asignar_fifo(db, producto.id, movimiento.cantidad, lote_id=movimiento.lote_id)
            db_movimiento = None
            for lote, cantidad_tomada in asignaciones:
                mov = models.MovimientoInventario(
                    producto_id=producto.id,
                    lote_id=lote.id,
                    tipo="AJUSTE_NEGATIVO",
                    cantidad=cantidad_tomada,
                    costo_unitario=lote.costo_unitario,
                    precio_unitario=lote.precio_venta_unitario,
                    nota=movimiento.nota,
                    lote=lote.codigo_lote,
                    fecha_vencimiento=lote.fecha_vencimiento,
                    stock_despues=lote.cantidad_disponible,
                )
                db.add(mov)
                if db_movimiento is None:
                    db_movimiento = mov

        db.commit()
        db.refresh(db_movimiento)
        return db_movimiento
    except Exception:
        db.rollback()
        raise


def listar_movimientos(db: Session, skip: int = 0, limit: int = 100, producto_id: int = None):
    movimientos = db.query(models.MovimientoInventario).order_by(models.MovimientoInventario.fecha.desc())
    if producto_id:
        movimientos = movimientos.filter(models.MovimientoInventario.producto_id == producto_id)
    return movimientos.offset(skip).limit(limit).all()


def actualizar_movimiento(db: Session, movimiento_id: int, datos: dict):
    mov = db.query(models.MovimientoInventario).filter(models.MovimientoInventario.id == movimiento_id).first()
    if not mov:
        return None

    if mov.tipo not in schemas.TIPOS_AJUSTE_MANUAL:
        raise ValueError("Solo se pueden editar movimientos de tipo AJUSTE_POSITIVO o AJUSTE_NEGATIVO")

    nuevo_tipo = datos.get("tipo", mov.tipo)
    if nuevo_tipo != mov.tipo:
        raise ValueError("No se puede cambiar el tipo de un ajuste ya registrado")

    producto = get_producto(db, mov.producto_id)
    if not producto:
        raise ValueError("Producto del movimiento no encontrado")

    lote = db.query(models.Lote).filter(models.Lote.id == mov.lote_id).first() if mov.lote_id else None
    if not lote:
        raise ValueError("No se encontró el lote asociado a este movimiento")

    nueva_cantidad = float(datos.get("cantidad", mov.cantidad))
    nuevo_costo = float(datos.get("costo_unitario", mov.costo_unitario))
    nuevo_precio = float(datos.get("precio_unitario", mov.precio_unitario))
    nueva_nota = datos.get("nota", mov.nota)
    nueva_fecha_venc = datos.get("fecha_vencimiento", mov.fecha_vencimiento)
    nuevo_lote_cod = datos.get("lote", mov.lote)

    diferencia = round(nueva_cantidad - mov.cantidad, 6)
    if mov.tipo == "AJUSTE_POSITIVO":
        nueva_disponible = round(lote.cantidad_disponible + diferencia, 6)
        if nueva_disponible < 0:
            raise ValueError("Parte de este ajuste ya fue vendida; no se puede reducir por debajo de lo disponible")
        lote.cantidad_inicial = round(lote.cantidad_inicial + diferencia, 6)
        lote.cantidad_disponible = nueva_disponible
        if nuevo_costo > 0:
            lote.costo_unitario = nuevo_costo
        if nuevo_precio > 0:
            lote.precio_venta_unitario = nuevo_precio
        lote.fecha_vencimiento = nueva_fecha_venc
        lote.codigo_lote = nuevo_lote_cod
        _recalcular_precios_presentacion(db, producto, lote.costo_unitario, lote.precio_venta_unitario)
    else:  # AJUSTE_NEGATIVO: revertir la cantidad anterior y volver a tomar la nueva
        disponible_sin_este_ajuste = round(lote.cantidad_disponible + mov.cantidad, 6)
        if nueva_cantidad > disponible_sin_este_ajuste:
            raise ValueError("Stock insuficiente para el ajuste")
        lote.cantidad_disponible = round(disponible_sin_este_ajuste - nueva_cantidad, 6)

    mov.cantidad = nueva_cantidad
    mov.costo_unitario = nuevo_costo
    mov.precio_unitario = nuevo_precio
    mov.nota = nueva_nota
    mov.fecha_vencimiento = nueva_fecha_venc
    mov.lote = nuevo_lote_cod
    mov.stock_despues = lote.cantidad_disponible
    lote.updated_at = datetime.utcnow()
    producto.updated_at = datetime.utcnow()

    db.commit()
    db.refresh(mov)
    return mov


def eliminar_movimiento(db: Session, movimiento_id: int):
    mov = db.query(models.MovimientoInventario).filter(models.MovimientoInventario.id == movimiento_id).first()
    if not mov:
        return None

    if mov.tipo not in schemas.TIPOS_AJUSTE_MANUAL:
        raise ValueError("Solo se pueden eliminar movimientos de tipo AJUSTE_POSITIVO o AJUSTE_NEGATIVO")

    lote = db.query(models.Lote).filter(models.Lote.id == mov.lote_id).first() if mov.lote_id else None
    if lote:
        if mov.tipo == "AJUSTE_POSITIVO":
            if mov.cantidad > lote.cantidad_disponible:
                raise ValueError("No se puede eliminar: parte de este ajuste ya fue vendida")
            lote.cantidad_disponible = round(lote.cantidad_disponible - mov.cantidad, 6)
            lote.cantidad_inicial = round(lote.cantidad_inicial - mov.cantidad, 6)
        else:
            lote.cantidad_disponible = round(lote.cantidad_disponible + mov.cantidad, 6)
        lote.updated_at = datetime.utcnow()

    db.delete(mov)
    db.commit()
    return mov


def listar_lotes(db: Session, producto_id: int = None, solo_disponibles: bool = False):
    query = db.query(models.Lote)
    if producto_id:
        query = query.filter(models.Lote.producto_id == producto_id)
    if solo_disponibles:
        query = query.filter(models.Lote.cantidad_disponible > 0)
    lotes = query.order_by(models.Lote.fecha_vencimiento.asc().nullslast()).all()
    for lote in lotes:
        lote.producto_nombre = lote.producto.nombre if lote.producto else None
    return lotes


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


def get_or_create_empresa(db: Session) -> "models.EmpresaConfig":
    """Config de empresa: fila única y global (sin multi-tenant en esta app).
    Se crea con valores vacíos la primera vez que se consulta."""
    empresa = db.query(models.EmpresaConfig).first()
    if not empresa:
        empresa = models.EmpresaConfig()
        db.add(empresa)
        db.commit()
        db.refresh(empresa)
    return empresa


def actualizar_empresa(db: Session, datos: schemas.EmpresaUpdate) -> "models.EmpresaConfig":
    empresa = get_or_create_empresa(db)
    for field, value in datos.dict(exclude_unset=True).items():
        setattr(empresa, field, value)
    empresa.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(empresa)
    return empresa


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
    Convierte una cantidad expresada en una presentación de venta (Caja,
    Unidad, Blíster) a unidades base (la misma unidad en que se agrega el
    stock de los lotes).
    """
    pres = (presentacion or "Unidad").strip()

    if pres == "Caja" and producto.unidades_por_caja:
        return round(cantidad * float(producto.unidades_por_caja), 6)
    if pres == "Blíster" and producto.unidades_por_blister:
        return round(cantidad * float(producto.unidades_por_blister), 6)

    # Unidad, o presentación sin factor de conversión configurado → sin conversión
    return round(cantidad, 6)


def registrar_venta(db: Session, venta_data: schemas.VentaCreate):
    """
    Registra una venta, calcula costos/precios, descuenta stock siguiendo
    FIFO por lote (fecha de vencimiento) y genera movimientos de inventario
    tipo SALIDA. Toda la operación se realiza en una única transacción: si
    algo falla en cualquier punto, se revierte por completo (rollback).
    """
    if not venta_data.detalles:
        raise ValueError("La venta debe contener al menos un producto")

    try:
        # El precio_unitario ingresado es siempre el precio FINAL que paga el
        # cliente (ya incluye IGV si corresponde). Nunca se suma IGV encima
        # del precio: se desglosa hacia atrás solo para SUNAT/comprobantes.
        bruto = 0.0
        detalles = []
        cantidad_base_por_producto: dict = {}
        for item in venta_data.detalles:
            producto = get_producto(db, item.producto_id)
            if not producto:
                raise ValueError(f"Producto no encontrado: {item.producto_id}")
            if item.cantidad <= 0:
                raise ValueError("Cantidad debe ser mayor a cero")

            presentacion = getattr(item, "presentacion", None) or "Unidad"
            cantidad_base = _cantidad_en_unidades_base(producto, presentacion, item.cantidad)
            cantidad_base_por_producto[producto.id] = round(
                cantidad_base_por_producto.get(producto.id, 0.0) + cantidad_base, 6
            )

            subtotal_item = item.precio_unitario * item.cantidad
            bruto += subtotal_item - item.descuento
            detalles.append({
                "producto": producto,
                "item": item,
                "subtotal_item": subtotal_item,
                "presentacion": presentacion,
            })

        # Validar stock disponible ANTES de tocar nada, sumando en unidades
        # base todas las líneas que compartan el mismo producto (evita el
        # oversell si una venta tiene dos líneas del mismo producto).
        for producto_id, cantidad_requerida in cantidad_base_por_producto.items():
            disponible = db.query(
                func.coalesce(func.sum(models.Lote.cantidad_disponible), 0.0)
            ).filter(models.Lote.producto_id == producto_id).scalar() or 0.0
            if cantidad_requerida > disponible:
                nombre = next(d["producto"].nombre for d in detalles if d["producto"].id == producto_id)
                raise ValueError(
                    f"Stock insuficiente para '{nombre}'. Disponible: {disponible}."
                )

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
                presentacion=presentacion,
                nombre_producto=producto.nombre,
            )
            db.add(detalle)

        # Descontar stock vía FIFO una sola vez por producto (agrupando todas
        # sus líneas), registrando un movimiento SALIDA por cada lote tocado.
        for producto_id, cantidad_requerida in cantidad_base_por_producto.items():
            asignaciones = _asignar_fifo(db, producto_id, cantidad_requerida)
            for lote, cantidad_tomada in asignaciones:
                db.add(models.MovimientoInventario(
                    producto_id=producto_id,
                    lote_id=lote.id,
                    venta_id=venta.id,
                    tipo="SALIDA",
                    cantidad=cantidad_tomada,
                    costo_unitario=lote.costo_unitario,
                    precio_unitario=lote.precio_venta_unitario,
                    nota=f"Venta #{venta.id} — {tipo_doc}",
                    lote=lote.codigo_lote,
                    fecha_vencimiento=lote.fecha_vencimiento,
                    stock_despues=lote.cantidad_disponible,
                ))

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


def _revertir_salidas_venta(db: Session, venta: "models.Venta", nota_prefix: str):
    """
    Restaura en sus lotes originales todo lo descontado por una venta,
    usando los MovimientoInventario tipo SALIDA ligados a `venta.id` (que ya
    guardan la cantidad en unidades base y el lote exacto tocado) — evita el
    bug de restaurar por `VentaDetalle.cantidad` (que está en la presentación
    vendida, no en unidades base).
    """
    movimientos_salida = db.query(models.MovimientoInventario).filter(
        models.MovimientoInventario.venta_id == venta.id,
        models.MovimientoInventario.tipo == "SALIDA",
    ).all()

    for mov in movimientos_salida:
        lote = db.query(models.Lote).filter(models.Lote.id == mov.lote_id).with_for_update().first() if mov.lote_id else None
        saldo = None
        if lote:
            lote.cantidad_disponible = round(lote.cantidad_disponible + mov.cantidad, 6)
            lote.updated_at = datetime.utcnow()
            saldo = lote.cantidad_disponible
        db.add(models.MovimientoInventario(
            producto_id=mov.producto_id,
            lote_id=mov.lote_id,
            venta_id=venta.id,
            tipo="DEVOLUCION",
            cantidad=mov.cantidad,
            costo_unitario=mov.costo_unitario,
            precio_unitario=mov.precio_unitario,
            nota=f"{nota_prefix} venta #{venta.id}",
            lote=mov.lote,
            fecha_vencimiento=mov.fecha_vencimiento,
            stock_despues=saldo,
        ))


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
        _revertir_salidas_venta(db, venta, "Anulación")

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
        if venta.estado != "ANULADA":
            _revertir_salidas_venta(db, venta, "Eliminación")

        # _revertir_salidas_venta agrega movimientos DEVOLUCION nuevos (con
        # venta_id apuntando a esta venta) que todavía no están en la BD —
        # hay que sincronizarlos (flush) antes del UPDATE masivo de abajo,
        # si no, ese UPDATE no los alcanza y el DELETE de la venta choca
        # contra la restricción de integridad referencial.
        db.flush()

        # Los movimientos ya generados quedan como historial; se desvincula
        # su venta_id (FK) antes de borrar la venta para no violar la
        # restricción de integridad referencial.
        db.query(models.MovimientoInventario).filter(
            models.MovimientoInventario.venta_id == venta.id
        ).update({"venta_id": None})

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
    return listar_productos(db, limit=100000)


def reporte_stock_bajo(db: Session):
    productos = listar_productos(db, limit=100000)
    return [p for p in productos if p.stock_actual <= p.stock_minimo]


def reporte_sin_stock(db: Session):
    productos = listar_productos(db, limit=100000)
    return [p for p in productos if p.stock_actual <= 0]


def reporte_productos_vencidos(db: Session):
    lotes = db.query(models.Lote).filter(
        models.Lote.cantidad_disponible > 0,
        models.Lote.fecha_vencimiento != None,
        models.Lote.fecha_vencimiento <= date.today(),
    ).order_by(models.Lote.fecha_vencimiento.asc()).all()
    for lote in lotes:
        lote.producto_nombre = lote.producto.nombre if lote.producto else None
    return lotes


def reporte_proximos_vencer(db: Session, dias: int = 30):
    hoy = date.today()
    limite = hoy + timedelta(days=dias)
    lotes = db.query(models.Lote).filter(
        models.Lote.cantidad_disponible > 0,
        models.Lote.fecha_vencimiento != None,
        models.Lote.fecha_vencimiento >= hoy,
        models.Lote.fecha_vencimiento <= limite,
    ).order_by(models.Lote.fecha_vencimiento.asc()).all()
    for lote in lotes:
        lote.producto_nombre = lote.producto.nombre if lote.producto else None
    return lotes


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


def reporte_ganancia_producto(db: Session, fecha_desde: str = None, fecha_hasta: str = None):
    """Ganancia por producto: ingresos de VentaDetalle menos el costo real de
    los lotes FIFO consumidos (MovimientoInventario.costo_unitario ya refleja
    el costo exacto del lote que se tocó en cada salida)."""
    # Excluir salidas de ventas anuladas: la venta anulada ya se revierte con
    # un movimiento DEVOLUCION, pero el SALIDA original queda como historial
    # y no debe seguir contando como costo de venta.
    query_salidas = (
        db.query(models.MovimientoInventario)
        .outerjoin(models.Venta, models.MovimientoInventario.venta_id == models.Venta.id)
        .filter(
            models.MovimientoInventario.tipo == "SALIDA",
            (models.MovimientoInventario.venta_id.is_(None)) | (models.Venta.estado != "ANULADA"),
        )
    )
    query_ventas = db.query(models.VentaDetalle).join(models.Venta).filter(models.Venta.estado != "ANULADA")

    if fecha_desde:
        desde_dt = datetime.strptime(fecha_desde, "%Y-%m-%d")
        query_salidas = query_salidas.filter(models.MovimientoInventario.fecha >= desde_dt)
        query_ventas = query_ventas.filter(models.Venta.fecha >= desde_dt)
    if fecha_hasta:
        hasta_dt = datetime.strptime(fecha_hasta, "%Y-%m-%d").replace(hour=23, minute=59, second=59)
        query_salidas = query_salidas.filter(models.MovimientoInventario.fecha <= hasta_dt)
        query_ventas = query_ventas.filter(models.Venta.fecha <= hasta_dt)

    costo_por_producto: dict = {}
    for mov in query_salidas.all():
        costo_por_producto[mov.producto_id] = costo_por_producto.get(mov.producto_id, 0.0) + mov.costo_unitario * mov.cantidad

    ingreso_por_producto: dict = {}
    nombre_por_producto: dict = {}
    for d in query_ventas.all():
        ingreso_por_producto[d.producto_id] = ingreso_por_producto.get(d.producto_id, 0.0) + d.total
        nombre_por_producto[d.producto_id] = d.nombre_producto or (d.producto.nombre if d.producto else f"#{d.producto_id}")

    resultado = []
    for producto_id, ingreso in ingreso_por_producto.items():
        costo = costo_por_producto.get(producto_id, 0.0)
        resultado.append({
            "producto_id": producto_id,
            "nombre": nombre_por_producto.get(producto_id, f"#{producto_id}"),
            "ingreso": round(ingreso, 2),
            "costo": round(costo, 2),
            "ganancia": round(ingreso - costo, 2),
        })
    return sorted(resultado, key=lambda x: x["ganancia"], reverse=True)


def reporte_compras_por_proveedor(db: Session):
    resultados = (
        db.query(
            models.Proveedor.nombre,
            func.count(models.Compra.id).label("num_compras"),
            func.sum(models.Compra.total).label("total"),
        )
        .join(models.Compra, models.Compra.proveedor_id == models.Proveedor.id)
        .filter(models.Compra.estado != "ANULADA")
        .group_by(models.Proveedor.nombre)
        .order_by(func.sum(models.Compra.total).desc())
        .all()
    )
    return [{"proveedor": r[0], "num_compras": r[1], "total": round(r[2] or 0, 2)} for r in resultados]


def reporte_compras_por_fecha(db: Session):
    resultados = (
        db.query(
            func.date(models.Compra.fecha).label("fecha"),
            func.sum(models.Compra.total).label("total"),
        )
        .filter(models.Compra.estado != "ANULADA")
        .group_by(func.date(models.Compra.fecha))
        .order_by(func.date(models.Compra.fecha).desc())
        .all()
    )
    return [{"fecha": str(r[0]), "total": round(r[1] or 0, 2)} for r in resultados]


# ── Compras ────────────────────────────────────────────────────────────────────

def _calcular_detalle_compra(item: "schemas.CompraDetalleCreate", producto: "models.Producto | None" = None) -> dict:
    """
    Calcula costo/precio por unidad base y stock a ingresar para una línea
    de compra en presentación Caja, Unidad o Blíster.
    """
    pct = item.porcentaje_ganancia / 100
    precio_presentacion = round(item.precio_presentacion, 4)

    unidades_por_presentacion = item.unidades_por_presentacion
    if not unidades_por_presentacion:
        if item.presentacion == "Unidad":
            unidades_por_presentacion = 1
        elif item.presentacion == "Caja":
            unidades_por_presentacion = producto.unidades_por_caja if producto else None
        elif item.presentacion == "Blíster":
            unidades_por_presentacion = producto.unidades_por_blister if producto else None

    if not unidades_por_presentacion or unidades_por_presentacion <= 0:
        raise ValueError(f"El producto no tiene configurado 'unidades por {item.presentacion}'")
    unidades_por_presentacion = float(unidades_por_presentacion)

    costo_unitario = round(precio_presentacion / unidades_por_presentacion, 4)
    return dict(
        unidades_por_presentacion=unidades_por_presentacion,
        costo_unitario=costo_unitario,
        precio_venta_presentacion=round(precio_presentacion * (1 + pct), 2),
        precio_venta_unitario=round(costo_unitario * (1 + pct), 2),
        stock_ingresado=round(item.cantidad_presentacion * unidades_por_presentacion, 4),
    )


def _precios_por_presentacion_producto(producto: "models.Producto", costo_unitario: float, pct: float) -> dict:
    """
    Calcula el precio de venta sugerido para cada presentación fija que el
    producto tenga habilitada (Unidad siempre; Caja/Blíster solo si el
    producto define unidades_por_caja/unidades_por_blister).
    """
    mult = 1 + pct
    precios = {"Unidad": round(costo_unitario * mult, 2)}
    if producto.unidades_por_caja:
        precios["Caja"] = round(costo_unitario * float(producto.unidades_por_caja) * mult, 2)
    if producto.unidades_por_blister:
        precios["Blíster"] = round(costo_unitario * float(producto.unidades_por_blister) * mult, 2)
    return precios


def get_proveedor(db: Session, proveedor_id: int):
    return db.query(models.Proveedor).filter(models.Proveedor.id == proveedor_id, models.Proveedor.eliminado == False).first()


def _find_or_create_proveedor(db: Session, proveedor_id: int = None, proveedor_nombre: str = None):
    """Mismo patrón de find-or-create ya usado para Cliente en registrar_venta."""
    if proveedor_id:
        proveedor_db = get_proveedor(db, proveedor_id)
        if not proveedor_db:
            raise ValueError("Proveedor no encontrado")
        return proveedor_db

    if proveedor_nombre:
        nombre = proveedor_nombre.strip()
        proveedor_db = db.query(models.Proveedor).filter(
            models.Proveedor.nombre == nombre,
            models.Proveedor.eliminado == False,
        ).first()
        if not proveedor_db:
            proveedor_db = models.Proveedor(nombre=nombre)
            db.add(proveedor_db)
            db.flush()
        return proveedor_db

    return None


def registrar_compra(db: Session, compra_data: "schemas.CompraCreate"):
    """
    Registra una compra: crea un Lote nuevo por línea (costo/lote/vencimiento
    propios de esa compra), aumenta el stock disponible de ese lote y
    recalcula el precio de venta vigente del producto. Cada compra del mismo
    producto puede tener un costo/lote distinto sin pisar compras anteriores.
    """
    if not compra_data.detalles:
        raise ValueError("La compra debe tener al menos un producto")

    try:
        proveedor_db = _find_or_create_proveedor(db, compra_data.proveedor_id, compra_data.proveedor_nombre)

        # 1. Cabecera
        db_compra = models.Compra(
            numero=compra_data.numero,
            tipo_comprobante=compra_data.tipo_comprobante,
            serie=compra_data.serie,
            moneda=compra_data.moneda or "PEN",
            proveedor_id=proveedor_db.id if proveedor_db else None,
            proveedor_nombre=proveedor_db.nombre if proveedor_db else compra_data.proveedor_nombre,
            observaciones=compra_data.observaciones,
            estado="RECIBIDA",
        )
        db.add(db_compra)
        db.flush()  # obtener id sin commit

        # El precio_presentacion que paga el usuario al proveedor ya incluye IGV;
        # nunca se le suma IGV encima. El desglose se hace hacia atrás al final.
        total_pagado = 0.0

        for item in compra_data.detalles:
            producto = get_producto(db, item.producto_id)
            if not producto:
                raise ValueError(f"Producto no encontrado: {item.producto_id}")

            calculo = _calcular_detalle_compra(item, producto)
            linea_total = item.precio_presentacion * item.cantidad_presentacion
            total_pagado += linea_total

            # 2. Línea de detalle
            detalle = models.CompraDetalle(
                compra_id=db_compra.id,
                producto_id=item.producto_id,
                presentacion=item.presentacion,
                cantidad_presentacion=item.cantidad_presentacion,
                precio_presentacion=item.precio_presentacion,
                porcentaje_ganancia=item.porcentaje_ganancia,
                lote=item.lote,
                fecha_vencimiento=item.fecha_vencimiento,
                **calculo,
            )
            db.add(detalle)
            db.flush()  # obtener detalle.id para crear el lote

            # 3. Lote nuevo (la unidad real de stock de esta compra)
            nuevo_lote = models.Lote(
                producto_id=producto.id,
                compra_detalle_id=detalle.id,
                codigo_lote=item.lote,
                fecha_vencimiento=item.fecha_vencimiento,
                costo_unitario=calculo["costo_unitario"],
                precio_venta_unitario=calculo["precio_venta_unitario"],
                cantidad_inicial=calculo["stock_ingresado"],
                cantidad_disponible=calculo["stock_ingresado"],
            )
            db.add(nuevo_lote)
            db.flush()

            # 4. Producto: solo se actualiza el precio de venta VIGENTE (no
            # costo/lote/stock, que ya no viven aquí).
            pct = item.porcentaje_ganancia / 100
            producto.precios_presentacion = _precios_por_presentacion_producto(producto, calculo["costo_unitario"], pct)
            producto.updated_at = datetime.utcnow()

            # 5. Movimiento de inventario
            movimiento = models.MovimientoInventario(
                producto_id=producto.id,
                lote_id=nuevo_lote.id,
                tipo="ENTRADA",
                cantidad=calculo["stock_ingresado"],
                costo_unitario=calculo["costo_unitario"],
                precio_unitario=calculo["precio_venta_unitario"],
                nota=f"Compra #{db_compra.id} — {item.presentacion}",
                lote=item.lote,
                fecha_vencimiento=item.fecha_vencimiento,
                stock_despues=nuevo_lote.cantidad_disponible,
            )
            db.add(movimiento)

        # 6. Totales de cabecera: el total es lo que realmente se pagó al
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
    except Exception:
        db.rollback()
        raise


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
        lote = db.query(models.Lote).filter(models.Lote.compra_detalle_id == detalle.id).first()
        if lote:
            lote.cantidad_disponible = max(0.0, round(lote.cantidad_disponible - detalle.stock_ingresado, 4))
            lote.updated_at = datetime.utcnow()
            db.add(models.MovimientoInventario(
                producto_id=detalle.producto_id,
                lote_id=lote.id,
                tipo="AJUSTE_NEGATIVO",
                cantidad=detalle.stock_ingresado,
                costo_unitario=detalle.costo_unitario,
                precio_unitario=detalle.precio_venta_unitario,
                nota=f"Anulación compra #{compra_id}",
                lote=lote.codigo_lote,
                fecha_vencimiento=lote.fecha_vencimiento,
                stock_despues=lote.cantidad_disponible,
            ))

    compra.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(compra)
    return compra


def _recalcular_precios_presentacion(db: Session, producto: "models.Producto", costo_unitario: float, precio_unitario: float) -> None:
    """
    Recalcula producto.precios_presentacion para las 3 presentaciones fijas
    a partir de un nuevo costo/precio unitario. Se llama también desde
    Inventario (ajustes manuales) para que un cambio de costo/precio fuera
    del flujo de Compras no deje los precios por presentación desactualizados.
    """
    if not costo_unitario or costo_unitario <= 0:
        return
    precio_unitario = precio_unitario or costo_unitario
    pct = max((precio_unitario / costo_unitario) - 1, 0)
    producto.precios_presentacion = _precios_por_presentacion_producto(producto, costo_unitario, pct)


def calcular_preview_compra(item: "schemas.CompraDetalleCreate", db: "Session | None" = None) -> dict:
    """
    Endpoint de preview: calcula sin persistir. Devuelve los campos base del
    cálculo más una lista 'presentaciones' con costo y precio_venta sugerido
    para cada presentación que el producto tenga habilitada.
    """
    producto = None
    if db is not None and item.producto_id:
        producto = get_producto(db, item.producto_id)

    resultado = _calcular_detalle_compra(item, producto)
    pct = item.porcentaje_ganancia / 100

    if producto:
        precios_dict = _precios_por_presentacion_producto(producto, resultado["costo_unitario"], pct)
    else:
        precios_dict = {item.presentacion: resultado["precio_venta_presentacion"]}

    presentaciones = [
        {
            "unidad": unidad,
            "costo": round(precio / (1 + pct), 4),
            "precio_venta": precio,
            "descripcion": None,
        }
        for unidad, precio in precios_dict.items()
    ]

    resultado["presentaciones"] = presentaciones
    return resultado


def sembrar_categorias_default(db: Session):
    """
    No-op: las categorías de la farmacia las crea el usuario desde el
    módulo Categorías. Se mantiene la función (llamada en el startup) por
    si en el futuro se agregan categorías predeterminadas reales.
    """
    return


# ── Categorias (tabla simple) ──────────────────────────────────────────────────

def listar_categorias(db: Session):
    cats = db.query(models.Categoria).filter(
        models.Categoria.eliminado == False,
        models.Categoria.activo == True,
    ).order_by(models.Categoria.nombre).all()
    # Enriquecer con conteo de productos
    for cat in cats:
        cat.total_productos = db.query(func.count(models.Producto.id)).filter(
            models.Producto.categoria_id == cat.id,
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
        models.Producto.categoria_id == obj.id,
        models.Producto.eliminado == False,
    ).scalar() or 0
    return obj


def eliminar_categoria(db: Session, categoria_id: int):
    obj = get_categoria(db, categoria_id)
    if not obj:
        return None

    # productos.categoria_id es FK NOT NULL: si aún hay productos (incluso
    # soft-deleteados) referenciando esta categoría, no se puede borrar de
    # verdad sin romper esa referencia — se hace soft delete.
    tiene_productos = db.query(models.Producto).filter(models.Producto.categoria_id == categoria_id).first() is not None

    if tiene_productos:
        obj.eliminado = True
        obj.activo = False
        obj.updated_at = datetime.utcnow()
        db.commit()
        return obj

    db.delete(obj)
    db.commit()
    return {"id": categoria_id}


# ── Proveedores ─────────────────────────────────────────────────────────────────

def listar_proveedores(db: Session, skip: int = 0, limit: int = 100, query: str = None):
    proveedores = db.query(models.Proveedor).filter(models.Proveedor.eliminado == False)
    if query:
        busqueda = f"%{query}%"
        proveedores = proveedores.filter(
            models.Proveedor.nombre.ilike(busqueda)
            | models.Proveedor.ruc.ilike(busqueda)
        )
    return proveedores.order_by(models.Proveedor.nombre).offset(skip).limit(limit).all()


def crear_proveedor(db: Session, data: "schemas.ProveedorCreate"):
    if data.ruc and db.query(models.Proveedor).filter(models.Proveedor.ruc == data.ruc, models.Proveedor.eliminado == False).first():
        raise ValueError("Ya existe un proveedor con ese RUC")

    db_obj = models.Proveedor(**data.dict())
    db.add(db_obj)
    db.commit()
    db.refresh(db_obj)
    return db_obj


def actualizar_proveedor(db: Session, proveedor_id: int, data: "schemas.ProveedorUpdate"):
    db_obj = get_proveedor(db, proveedor_id)
    if not db_obj:
        return None

    if data.ruc and data.ruc != db_obj.ruc:
        if db.query(models.Proveedor).filter(models.Proveedor.ruc == data.ruc, models.Proveedor.eliminado == False, models.Proveedor.id != proveedor_id).first():
            raise ValueError("Ya existe un proveedor con ese RUC")

    for field, value in data.dict(exclude_unset=True).items():
        setattr(db_obj, field, value)

    db_obj.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(db_obj)
    return db_obj


def eliminar_proveedor(db: Session, proveedor_id: int):
    db_obj = get_proveedor(db, proveedor_id)
    if not db_obj:
        return None, None

    tiene_compras = db.query(models.Compra).filter(models.Compra.proveedor_id == proveedor_id).first() is not None
    if tiene_compras:
        db_obj.eliminado = True
        db_obj.activo = False
        db_obj.updated_at = datetime.utcnow()
        db.commit()
        db.refresh(db_obj)
        return db_obj, False

    datos = schemas.ProveedorResponse.from_orm(db_obj).dict()
    db.delete(db_obj)
    db.commit()
    return datos, True


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


# ── Caja: apertura y cierre de turno ────────────────────────────────────────────

def get_apertura_activa(db: Session):
    return db.query(models.CajaApertura).filter(models.CajaApertura.estado == "ABIERTA").order_by(models.CajaApertura.fecha.desc()).first()


def abrir_caja(db: Session, data: "schemas.CajaAperturaCreate"):
    if get_apertura_activa(db):
        raise ValueError("Ya hay una caja abierta")
    apertura = models.CajaApertura(monto_inicial=data.monto_inicial, estado="ABIERTA")
    db.add(apertura)
    db.commit()
    db.refresh(apertura)
    return apertura


def cerrar_caja(db: Session, data: "schemas.CajaAperturaCierre"):
    apertura = get_apertura_activa(db)
    if not apertura:
        raise ValueError("No hay una caja abierta para cerrar")

    ventas = db.query(models.Venta).filter(
        models.Venta.estado != "ANULADA",
        models.Venta.fecha >= apertura.fecha,
    ).all()

    total_ventas = sum(v.total for v in ventas)
    total_efectivo = sum(v.total for v in ventas if v.forma_pago == "Efectivo")
    total_tarjeta = sum(v.total for v in ventas if v.forma_pago == "Tarjeta")
    total_yape_plin = sum(v.total for v in ventas if v.forma_pago in ("Yape", "Plin"))

    gastos = db.query(models.CajaMovimiento).filter(
        models.CajaMovimiento.tipo == "EGRESO",
        models.CajaMovimiento.created_at >= apertura.fecha,
    ).all()
    total_gastos = sum(g.monto for g in gastos)

    saldo_esperado = round(apertura.monto_inicial + total_efectivo - total_gastos, 2)
    diferencia = round(data.monto_contado - saldo_esperado, 2)

    apertura.estado = "CERRADA"
    apertura.fecha_cierre = datetime.utcnow()
    apertura.monto_contado = data.monto_contado
    apertura.total_ventas = round(total_ventas, 2)
    apertura.total_efectivo = round(total_efectivo, 2)
    apertura.total_tarjeta = round(total_tarjeta, 2)
    apertura.total_yape_plin = round(total_yape_plin, 2)
    apertura.total_gastos = round(total_gastos, 2)
    apertura.diferencia = diferencia
    apertura.saldo_final = saldo_esperado
    apertura.updated_at = datetime.utcnow()

    db.commit()
    db.refresh(apertura)
    return apertura


def listar_caja_aperturas(db: Session, skip: int = 0, limit: int = 100):
    return db.query(models.CajaApertura).order_by(models.CajaApertura.fecha.desc()).offset(skip).limit(limit).all()


# ── Reporte resumen integral ───────────────────────────────────────────────────

def reporte_resumen(db: Session, periodo: str = "mes", fecha_desde: str = "", fecha_hasta: str = "") -> dict:
    """
    Calcula el resumen de ventas y compras para el período indicado
    directamente desde la BD (nunca desde localStorage).
    """
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
