export const BASE_URL = (import.meta.env.VITE_API_URL || "http://127.0.0.1:8000").replace(/\/$/, "");

const STORAGE_KEYS = {
  productos: "farmasys_productos",
  clientes: "farmasys_clientes",
  ventas: "farmasys_ventas",
  movimientos: "farmasys_movimientos",
  categorias: "bodega_categorias",
};

function leerDesdeStorage(key) {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const datos = window.localStorage.getItem(key);
    return datos ? JSON.parse(datos) : [];
  } catch {
    return [];
  }
}

function guardarEnStorage(key, datos) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(key, JSON.stringify(datos));
}

function normalizarProducto(producto) {
  const precioVenta = Number(producto.precio_venta ?? producto.precio ?? 0);
  const costo = Number(producto.costo ?? 0);

  return {
    id: producto.id ?? `producto-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    codigo: producto.codigo ?? "",
    nombre: producto.nombre ?? "",
    categoria: producto.categoria ?? null,
    proveedor: producto.proveedor ?? producto.laboratorio ?? null,
    laboratorio: producto.laboratorio ?? producto.proveedor ?? null,
    lote: producto.lote ?? null,
    fecha_vencimiento: producto.fecha_vencimiento ?? null,
    costo,
    precio_venta: precioVenta,
    iva: Boolean(producto.iva),
    utilidad: Number(producto.utilidad ?? precioVenta - costo),
    stock_actual: Number(producto.stock_actual ?? 0),
    stock_minimo: Number(producto.stock_minimo ?? 0),
    unidad_base: producto.unidad_base ?? "unidad",
    precios_presentacion: producto.precios_presentacion ?? {},
    ...producto,
  };
}

function normalizarCliente(cliente) {
  return {
    id: cliente.id ?? `cliente-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    dni: cliente.dni ?? "",
    ruc: cliente.ruc ?? "",
    nombre: cliente.nombre ?? "",
    apellidos: cliente.apellidos ?? "",
    razon_social: cliente.razon_social ?? "",
    direccion: cliente.direccion ?? "",
    distrito: cliente.distrito ?? "",
    provincia: cliente.provincia ?? "",
    departamento: cliente.departamento ?? "",
    celular: cliente.celular ?? "",
    email: cliente.email ?? "",
    fecha_nacimiento: cliente.fecha_nacimiento ?? "",
    observaciones: cliente.observaciones ?? "",
    ...cliente,
  };
}

function normalizarVenta(venta) {
  const detallesRaw = Array.isArray(venta.detalles) ? venta.detalles : [];
  const detalles = detallesRaw.map((d) => ({
    ...d,
    nombre_producto: d.nombre_producto || d.nombre || null,
    nombre: d.nombre_producto || d.nombre || null,
  }));
  const subtotal = detalles.reduce((acc, item) => acc + Number(item.precio_unitario || 0) * Number(item.cantidad || 0) - Number(item.descuento || 0), 0);
  const descuento = Number(venta.descuento || 0);
  const total = Number((subtotal - descuento + Number((subtotal * 0.18).toFixed(2))).toFixed(2));

  return {
    id: venta.id ?? `venta-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    fecha: venta.fecha ?? new Date().toISOString(),
    cliente_id: venta.cliente_id ?? null,
    forma_pago: venta.forma_pago ?? "Efectivo",
    descuento,
    estado: venta.estado ?? "COMPLETADA",
    total: Number(venta.total ?? total),
    ...venta,
    detalles,
  };
}

function normalizarMovimiento(movimiento) {
  return {
    id: movimiento.id ?? `movimiento-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    producto_id: movimiento.producto_id ?? null,
    tipo: movimiento.tipo ?? "ENTRADA",
    cantidad: Number(movimiento.cantidad ?? 0),
    costo_unitario: Number(movimiento.costo_unitario ?? 0),
    precio_unitario: Number(movimiento.precio_unitario ?? 0),
    nota: movimiento.nota ?? "",
    fecha: movimiento.fecha ?? new Date().toISOString(),
    stock_despues: Number(movimiento.stock_despues ?? 0),
    ...movimiento,
  };
}

async function request(path, options = {}) {
  const url = `${BASE_URL}${path}`;
  const response = await fetch(url, {
    headers: {
      "Content-Type": "application/json",
    },
    ...options,
  });

  if (!response.ok) {
    let message = "Error de red";
    try {
      const data = await response.json();
      if (typeof data.detail === "string") {
        message = data.detail;
      } else if (Array.isArray(data.detail)) {
        message = data.detail.map((err) => `${err.loc ? err.loc.join(" -> ") + ": " : ""}${err.msg}`).join("; ");
      } else if (data.message) {
        message = data.message;
      }
    } catch {
      const text = await response.text();
      if (text) message = text;
    }
    throw new Error(message || "Error al procesar la solicitud");
  }

  if (response.status === 204) {
    return null;
  }

  return response.json();
}

export async function getProductos(query = "") {
  try {
    const queryString = query ? `?query=${encodeURIComponent(query)}` : "";
    return await request(`/inventario/productos${queryString}`);
  } catch {
    const productos = leerDesdeStorage(STORAGE_KEYS.productos).map(normalizarProducto);
    if (!query) {
      return productos;
    }

    const termino = query.toLowerCase();
    return productos.filter((producto) => {
      const campos = [producto.codigo, producto.nombre, producto.categoria, producto.laboratorio, producto.lote];
      return campos.some((valor) => String(valor || "").toLowerCase().includes(termino));
    });
  }
}

export async function crearProducto(producto) {
  return await request(`/inventario/productos`, {
    method: "POST",
    body: JSON.stringify(producto),
  });
}

export async function actualizarProducto(id, producto) {
  return await request(`/inventario/productos/${id}`, {
    method: "PATCH",
    body: JSON.stringify(producto),
  });
}

/**
 * Actualiza solo los precios_presentacion de un producto (precios independientes).
 * @param {number} id - ID del producto
 * @param {Object} precios - { presentacion: precio } e.g. { "caja": 150, "unidad": 13.50 }
 */
export async function actualizarPreciosPresentacion(id, precios) {
  return await request(`/inventario/productos/${id}/precios`, {
    method: "PATCH",
    body: JSON.stringify(precios),
  });
}

export async function eliminarProducto(id) {
  return await request(`/inventario/productos/${id}`, {
    method: "DELETE",
  });
}

export async function crearMovimiento(movimiento) {
  return await request(`/inventario/movimientos`, {
    method: "POST",
    body: JSON.stringify(movimiento),
  });
}

export async function getMovimientos(productoId = null) {
  try {
    const params = productoId ? `?producto_id=${productoId}` : "";
    return await request(`/inventario/movimientos${params}`);
  } catch {
    const movimientos = leerDesdeStorage(STORAGE_KEYS.movimientos).map(normalizarMovimiento);
    if (!productoId) {
      return movimientos;
    }
    return movimientos.filter((movimiento) => String(movimiento.producto_id) === String(productoId));
  }
}

export async function actualizarMovimiento(id, datos) {
  return await request(`/inventario/movimientos/${id}`, {
    method: "PATCH",
    body: JSON.stringify(datos),
  });
}

export async function eliminarMovimiento(id) {
  return await request(`/inventario/movimientos/${id}`, { method: "DELETE" });
}

export async function getProductosVencidos() {
  try {
    return await request(`/inventario/reportes/vencidos`);
  } catch {
    const hoy = new Date();
    return leerDesdeStorage(STORAGE_KEYS.productos).map(normalizarProducto).filter((producto) => {
      if (!producto.fecha_vencimiento) {
        return false;
      }
      const fecha = new Date(producto.fecha_vencimiento);
      return fecha < hoy;
    });
  }
}

export async function getStockBajo() {
  try {
    return await request(`/inventario/reportes/stock-bajo`);
  } catch {
    return leerDesdeStorage(STORAGE_KEYS.productos).map(normalizarProducto).filter((producto) => Number(producto.stock_actual || 0) <= Number(producto.stock_minimo || 0));
  }
}

export async function getProximosVencer(dias = 30) {
  try {
    return await request(`/inventario/reportes/proximos-vencer?dias=${dias}`);
  } catch {
    const hoy = new Date();
    const limite = new Date();
    limite.setDate(hoy.getDate() + Number(dias || 30));
    return leerDesdeStorage(STORAGE_KEYS.productos).map(normalizarProducto).filter((producto) => {
      if (!producto.fecha_vencimiento) {
        return false;
      }
      const fecha = new Date(producto.fecha_vencimiento);
      return fecha >= hoy && fecha <= limite;
    });
  }
}

export async function getClientes(query = "") {
  try {
    const queryString = query ? `?query=${encodeURIComponent(query)}` : "";
    return await request(`/clientes${queryString}`);
  } catch {
    const clientes = leerDesdeStorage(STORAGE_KEYS.clientes).map(normalizarCliente);
    if (!query) {
      return clientes;
    }

    const termino = query.toLowerCase();
    return clientes.filter((cliente) => {
      const campos = [cliente.dni, cliente.ruc, cliente.nombre, cliente.apellidos, cliente.razon_social, cliente.celular, cliente.email];
      return campos.some((valor) => String(valor || "").toLowerCase().includes(termino));
    });
  }
}

export async function crearCliente(cliente) {
  return await request(`/clientes`, {
    method: "POST",
    body: JSON.stringify(cliente),
  });
}

export async function actualizarCliente(id, cliente) {
  return await request(`/clientes/${id}`, {
    method: "PATCH",
    body: JSON.stringify(cliente),
  });
}

export async function eliminarCliente(id) {
  return await request(`/clientes/${id}`, {
    method: "DELETE",
  });
}

export async function getHistorialCliente(id) {
  try {
    return await request(`/clientes/${id}/historial`);
  } catch {
    return leerDesdeStorage(STORAGE_KEYS.ventas).map(normalizarVenta).filter((venta) => String(venta.cliente_id) === String(id));
  }
}

/**
 * Convierte una cantidad en presentación vendida → unidades base del producto.
 * Replica la lógica de _cantidad_en_unidades_base del backend.
 */
function _cantidadEnUnidadesBaseLocal(producto, presentacion, cantidad) {
  const equiv = producto.equivalencias || {};
  const nombreEmpaque = (producto.nombre_empaque_mayor || "").toLowerCase();
  const nombreUnidad  = (producto.nombre_unidad_menor || "").toLowerCase();
  const nombreNivel2  = (producto.nombre_nivel2 || "").toLowerCase();
  const pres = (presentacion || "").toLowerCase().trim();
  const tipoFlujo = producto.tipo_flujo || "";
  const unidadBase = (producto.unidad_base || "unidad").toLowerCase();

  // Presentación = unidad base → sin conversión
  if (!pres || pres === unidadBase || pres === nombreUnidad || pres === "unidad" || pres === "kilo") {
    return cantidad;
  }

  if (tipoFlujo === "caja_unidad" || tipoFlujo === "saco_unidad") {
    if (pres === nombreEmpaque || pres === "caja" || pres === "saco" || pres === "bolsa") {
      const n = Number(equiv.unidades_por_empaque || 1);
      return +(cantidad * n).toFixed(6);
    }
  }

  if (tipoFlujo === "saco_kilo") {
    if (pres === nombreEmpaque || pres === "saco") {
      const kg = Number(equiv.kg_por_empaque || 1);
      return +(cantidad * kg).toFixed(6);
    }
    if (pres.includes("medio")) {
      const kg = Number(equiv.kg_por_empaque || 1);
      return +(cantidad * kg * 0.5).toFixed(6);
    }
  }

  if (tipoFlujo === "multinivel") {
    if (pres === nombreEmpaque || pres === "paquete") {
      const kg = Number(equiv.kg_por_empaque || 0);
      if (kg > 0) return +(cantidad * kg).toFixed(6);
      const maples = Number(equiv.nivel2_por_empaque || 1);
      const huevos = Number(equiv.unidades_por_nivel2 || 1);
      return +(cantidad * maples * huevos).toFixed(6);
    }
    if (pres === nombreNivel2 || pres === "maple") {
      const kgEmpaque = Number(equiv.kg_por_empaque || 0);
      const nivel2 = Number(equiv.nivel2_por_empaque || 1);
      const kgMaple = kgEmpaque > 0 ? kgEmpaque / nivel2 : 0;
      if (kgMaple > 0) return +(cantidad * kgMaple).toFixed(6);
      const huevos = Number(equiv.unidades_por_nivel2 || 1);
      return +(cantidad * huevos).toFixed(6);
    }
  }

  return cantidad;
}

export async function crearVenta(venta) {
  return await request(`/ventas`, {
    method: "POST",
    body: JSON.stringify(venta),
  });
}

export async function getVentas(query = "", fechaDesde = "", fechaHasta = "") {
  const params = new URLSearchParams();
  if (query) params.set("query", query);
  if (fechaDesde) params.set("fecha_desde", fechaDesde);
  if (fechaHasta) params.set("fecha_hasta", fechaHasta);
  const qs = params.toString() ? `?${params.toString()}` : "";
  return await request(`/ventas${qs}`);
}

export async function anularVenta(id) {
  return await request(`/ventas/${id}/anular`, { method: "POST" });
}

export async function eliminarVenta(id) {
  return await request(`/ventas/${id}`, { method: "DELETE" });
}

export async function getReporteVentasDiarias() {
  return request(`/ventas/reportes/diarias`);
}

export async function getReporteVentasMensuales() {
  return request(`/ventas/reportes/mensuales`);
}

export async function getReporteMasVendidos(limit = 10) {
  return request(`/ventas/reportes/mas-vendidos?limit=${limit}`);
}

export async function getReporteMenosVendidos(limit = 10) {
  return request(`/ventas/reportes/menos-vendidos?limit=${limit}`);
}

export async function getReporteStock() {
  return request(`/ventas/reportes/stock`);
}

export async function getReporteVencidos() {
  return request(`/ventas/reportes/vencidos`);
}

// ─── Categorías ───────────────────────────────────────────────

const CATEGORIAS_DEFAULT = [
  { id: "cat-1", nombre: "Menestras", descripcion: "Lentejas, frijoles, arvejas, pallares", icono: "🫘", color: "#f59e0b" },
  { id: "cat-2", nombre: "Arroz y granos", descripcion: "Arroz, quinua, kiwicha, cañihua", icono: "🌾", color: "#10b981" },
  { id: "cat-3", nombre: "Limpieza", descripcion: "Detergentes, desinfectantes, escobas", icono: "🧹", color: "#0f6df2" },
  { id: "cat-4", nombre: "Jabones y aseo", descripcion: "Jabones, shampoo, pasta dental", icono: "🧼", color: "#8b5cf6" },
  { id: "cat-5", nombre: "Huevos", descripcion: "Huevos por unidad, baldes o jabas", icono: "🥚", color: "#f97316" },
  { id: "cat-6", nombre: "Aceites y grasas", descripcion: "Aceite vegetal, manteca, margarina", icono: "🧈", color: "#eab308" },
  { id: "cat-7", nombre: "Azúcar y sal", descripcion: "Azúcar blanca, rubia, sal yodada", icono: "🧂", color: "#06b6d4" },
  { id: "cat-8", nombre: "Conservas", descripcion: "Atún, sardina, leche evaporada", icono: "🥫", color: "#ef4444" },
  { id: "cat-9", nombre: "Bebidas", descripcion: "Gaseosas, jugos, agua, chicha", icono: "🧃", color: "#6366f1" },
  { id: "cat-10", nombre: "Abarrotes varios", descripcion: "Otros productos de bodega", icono: "📦", color: "#64748b" },
];

function normalizarCategoria(cat) {
  return {
    id: cat.id ?? `cat-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    nombre: cat.nombre ?? "",
    descripcion: cat.descripcion ?? "",
    icono: cat.icono ?? "📦",
    color: cat.color ?? "#0f6df2",
    total_productos: cat.total_productos ?? 0,
    ...cat,
  };
}

export async function getCategorias() {
  try {
    return await request("/categorias");
  } catch {
    const stored = leerDesdeStorage(STORAGE_KEYS.categorias);
    if (stored.length === 0) {
      // Primera vez: cargar defaults
      guardarEnStorage(STORAGE_KEYS.categorias, CATEGORIAS_DEFAULT);
      return CATEGORIAS_DEFAULT.map(normalizarCategoria);
    }
    // Enriquecer con conteo de productos
    const productos = leerDesdeStorage(STORAGE_KEYS.productos).map(normalizarProducto);
    return stored.map((cat) => normalizarCategoria({
      ...cat,
      total_productos: productos.filter((p) => p.categoria === cat.nombre).length,
    }));
  }
}

export async function crearCategoria(categoria) {
  return await request("/categorias", { method: "POST", body: JSON.stringify(categoria) });
}

export async function actualizarCategoria(id, categoria) {
  return await request(`/categorias/${id}`, { method: "PATCH", body: JSON.stringify(categoria) });
}

export async function eliminarCategoria(id) {
  return await request(`/categorias/${id}`, { method: "DELETE" });
}

export async function getEmpresaRemota() {
  return await request("/empresa");
}

export async function actualizarEmpresaRemota(datos) {
  return await request("/empresa", { method: "PUT", body: JSON.stringify(datos) });
}

// ─── Reportes ─────────────────────────────────────────────────

export async function getReporteResumen({ periodo = "mes", fechaDesde = "", fechaHasta = "" } = {}) {
  try {
    const params = new URLSearchParams({ periodo, fecha_desde: fechaDesde, fecha_hasta: fechaHasta });
    return await request(`/reportes/resumen?${params}`);
  } catch {
    // Calcular desde localStorage
    const ventas = leerDesdeStorage(STORAGE_KEYS.ventas).map(normalizarVenta);
    const movimientos = leerDesdeStorage(STORAGE_KEYS.movimientos).map(normalizarMovimiento);

    const ahora = new Date();
    const filtrarFecha = (fecha) => {
      const d = new Date(fecha);
      if (fechaDesde && periodo === "custom") return d >= new Date(fechaDesde);
      if (fechaHasta && periodo === "custom") return d <= new Date(fechaHasta + "T23:59:59");
      if (periodo === "dia") return d.toDateString() === ahora.toDateString();
      if (periodo === "semana") {
        const lunes = new Date(ahora); lunes.setDate(ahora.getDate() - ahora.getDay() + 1); lunes.setHours(0,0,0,0);
        return d >= lunes;
      }
      if (periodo === "mes") return d.getMonth() === ahora.getMonth() && d.getFullYear() === ahora.getFullYear();
      if (periodo === "año") return d.getFullYear() === ahora.getFullYear();
      return true;
    };

    const ventasFiltradas = ventas.filter((v) => v.estado !== "ANULADA" && filtrarFecha(v.fecha));
    const movsFiltrados = movimientos.filter((m) => m.tipo === "ENTRADA" && filtrarFecha(m.fecha));

    const totalVentas = ventasFiltradas.reduce((a, v) => a + Number(v.total || 0), 0);
    const totalCompras = movsFiltrados.reduce((a, m) => a + Number(m.costo_unitario || 0) * Number(m.cantidad || 0), 0);
    const gananciaBruta = totalVentas - totalCompras;
    const margen = totalVentas > 0 ? (gananciaBruta / totalVentas) * 100 : 0;
    const numVentas = ventasFiltradas.length;
    const ticketPromedio = numVentas > 0 ? totalVentas / numVentas : 0;

    // Agrupar ventas por día
    const porDia = {};
    ventasFiltradas.forEach((v) => {
      const fecha = new Date(v.fecha).toLocaleDateString("es-PE");
      if (!porDia[fecha]) porDia[fecha] = { fecha, total: 0, costo: 0, numVentas: 0 };
      porDia[fecha].total += Number(v.total || 0);
      porDia[fecha].numVentas += 1;
    });
    movsFiltrados.forEach((m) => {
      const fecha = new Date(m.fecha).toLocaleDateString("es-PE");
      if (porDia[fecha]) porDia[fecha].costo += Number(m.costo_unitario || 0) * Number(m.cantidad || 0);
    });
    const ventasPorDia = Object.values(porDia).map((r) => ({ ...r, ganancia: r.total - r.costo }))
      .sort((a, b) => new Date(a.fecha) - new Date(b.fecha));

    // Top productos
    const conteoProductos = {};
    ventasFiltradas.forEach((v) => {
      (v.detalles || []).forEach((d) => {
        const id = d.producto_id;
        if (!conteoProductos[id]) conteoProductos[id] = { nombre: `Producto #${id}`, cantidad: 0, total: 0 };
        conteoProductos[id].cantidad += Number(d.cantidad || 0);
        conteoProductos[id].total += Number(d.precio_unitario || 0) * Number(d.cantidad || 0);
      });
    });
    const productos = leerDesdeStorage(STORAGE_KEYS.productos).map(normalizarProducto);
    const topProductos = Object.entries(conteoProductos)
      .map(([id, data]) => {
        const prod = productos.find((p) => String(p.id) === String(id));
        return { ...data, nombre: prod?.nombre || data.nombre };
      })
      .sort((a, b) => b.total - a.total)
      .slice(0, 10);

    return { totalVentas, totalCompras, gananciaBruta, margen, numVentas, numCompras: movsFiltrados.length, ticketPromedio, ventasPorDia, topProductos };
  }
}

// ─── Caja ──────────────────────────────────────────────────────

const STORAGE_KEY_CAJA = "bodega_caja";

function normalizarCajaMov(m) {
  return {
    id: m.id ?? `caja-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    tipo: m.tipo ?? "INGRESO",
    categoria: m.categoria ?? "",
    descripcion: m.descripcion ?? "",
    monto: Number(m.monto ?? 0),
    fecha: m.fecha ?? new Date().toISOString().slice(0, 10),
    es_recurrente: Boolean(m.es_recurrente),
    ...m,
  };
}

export async function getCajaMovimientos() {
  try {
    return await request("/caja/movimientos");
  } catch {
    return leerDesdeStorage(STORAGE_KEY_CAJA).map(normalizarCajaMov);
  }
}

export async function crearCajaMovimiento(movimiento) {
  return await request("/caja/movimientos", { method: "POST", body: JSON.stringify(movimiento) });
}

export async function eliminarCajaMovimiento(id) {
  return await request(`/caja/movimientos/${id}`, { method: "DELETE" });
}

// ─── Compras ───────────────────────────────────────────────────

const STORAGE_KEY_COMPRAS = "bodega_compras";

function normalizarCompra(c) {
  return {
    id: c.id ?? `compra-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    numero: c.numero ?? "",
    proveedor: c.proveedor ?? "",
    fecha: c.fecha ?? new Date().toISOString(),
    subtotal: Number(c.subtotal ?? 0),
    igv: Number(c.igv ?? 0),
    total: Number(c.total ?? 0),
    estado: c.estado ?? "RECIBIDA",
    observaciones: c.observaciones ?? "",
    detalles: Array.isArray(c.detalles) ? c.detalles : [],
    ...c,
  };
}

/**
 * Calcula costos y precios sugeridos. Única fuente de verdad: el backend
 * (_calcular_detalle_compra / _precios_por_presentacion_categoria en
 * app/crud.py). No existe cálculo local en el frontend — si el backend no
 * responde, se propaga el error en vez de mostrar un precio adivinado que
 * podría no coincidir con lo que Compras terminaría persistiendo.
 * @param {object} item - Objeto CompraDetalleCreate
 */
export async function previewCalculoCompra(item) {
  return await request("/compras/preview", {
    method: "POST",
    body: JSON.stringify(item),
  });
}

export async function getCompras() {
  try {
    return await request("/compras");
  } catch {
    return leerDesdeStorage(STORAGE_KEY_COMPRAS).map(normalizarCompra);
  }
}

export async function registrarCompra(compra) {
  return await request("/compras", { method: "POST", body: JSON.stringify(compra) });
}

export async function anularCompra(id) {
  return await request(`/compras/${id}/anular`, { method: "POST" });
}

// ─── Categorías Config (unidades y conversiones por categoría) ────────────────

const STORAGE_KEY_CAT_CONFIG = "bodega_categorias_config";

// Configuraciones predeterminadas para fallback offline
const CATEGORIAS_CONFIG_DEFAULT = [
  {
    id: "cc-1", nombre: "Aceites", icono: "🧈", color: "#eab308",
    unidades_compra: ["caja", "unidad"],
    unidades_venta:  ["caja", "unidad"],
    conversiones: {
      caja:   { tipo: "conteo",      unidades: 12, descripcion: "1 Caja = 12 Unidades" },
      unidad: { tipo: "base_conteo", descripcion: "Unidad individual" },
    },
    tipo_flujo_default: "caja_unidad",
    empaque_mayor_default: "Caja", unidad_menor_default: "Unidad",
    margen_ganancia_default: 20,
  },
  {
    id: "cc-2", nombre: "Menestras", icono: "🫘", color: "#f59e0b",
    unidades_compra: ["saco"],
    unidades_venta:  ["kilo", "medio_saco", "saco"],
    conversiones: {
      saco:       { tipo: "peso",     kg: 100,  descripcion: "1 Saco = 100 kg" },
      medio_saco: { tipo: "fraccion", base: "saco", factor: 0.5, descripcion: "½ Saco = 50 kg" },
      kilo:       { tipo: "base_peso", descripcion: "Por kilogramo" },
    },
    tipo_flujo_default: "saco_kilo",
    empaque_mayor_default: "Saco", unidad_menor_default: "Kilo",
    margen_ganancia_default: 20,
  },
  {
    id: "cc-3", nombre: "Sal", icono: "🧂", color: "#06b6d4",
    unidades_compra: ["saco"],
    unidades_venta:  ["kilo", "medio_saco", "saco"],
    conversiones: {
      saco:       { tipo: "peso",     kg: 50,   descripcion: "1 Saco = 50 kg" },
      medio_saco: { tipo: "fraccion", base: "saco", factor: 0.5, descripcion: "½ Saco = 25 kg" },
      kilo:       { tipo: "base_peso", descripcion: "Por kilogramo" },
    },
    tipo_flujo_default: "saco_kilo",
    empaque_mayor_default: "Saco", unidad_menor_default: "Kilo",
    margen_ganancia_default: 20,
  },
  {
    id: "cc-4", nombre: "Huevos", icono: "🥚", color: "#f97316",
    unidades_compra: ["paquete"],
    unidades_venta:  ["paquete", "maple", "kilo"],
    conversiones: {
      paquete: { tipo: "multinivel", nivel2: "maple", nivel2_cantidad: 8, kg_por_empaque: 19.2, descripcion: "1 Paquete = 8 Maples" },
      maple:   { tipo: "conteo",    unidades: 30, kg: 2.4, descripcion: "1 Maple = 30 huevos = 2.4 kg" },
      kilo:    { tipo: "base_peso", descripcion: "Por kilogramo" },
    },
    tipo_flujo_default: "multinivel",
    empaque_mayor_default: "Paquete", unidad_menor_default: "Kilo", nivel2_nombre_default: "Maple",
    margen_ganancia_default: 20,
  },
  {
    id: "cc-5", nombre: "Arroz y granos", icono: "🌾", color: "#10b981",
    unidades_compra: ["saco"],
    unidades_venta:  ["kilo", "medio_saco", "saco"],
    conversiones: {
      saco:       { tipo: "peso",     kg: 50,   descripcion: "1 Saco = 50 kg" },
      medio_saco: { tipo: "fraccion", base: "saco", factor: 0.5, descripcion: "½ Saco = 25 kg" },
      kilo:       { tipo: "base_peso", descripcion: "Por kilogramo" },
    },
    tipo_flujo_default: "saco_kilo",
    empaque_mayor_default: "Saco", unidad_menor_default: "Kilo",
    margen_ganancia_default: 20,
  },
  {
    id: "cc-6", nombre: "Limpieza", icono: "🧹", color: "#0f6df2",
    unidades_compra: ["caja", "unidad"],
    unidades_venta:  ["caja", "unidad"],
    conversiones: {
      caja:   { tipo: "conteo",      unidades: 12, descripcion: "1 Caja = 12 Unidades" },
      unidad: { tipo: "base_conteo", descripcion: "Unidad individual" },
    },
    tipo_flujo_default: "caja_unidad",
    empaque_mayor_default: "Caja", unidad_menor_default: "Unidad",
    margen_ganancia_default: 20,
  },
  {
    id: "cc-7", nombre: "Shampoo y aseo", icono: "🧴", color: "#8b5cf6",
    unidades_compra: ["caja", "unidad"],
    unidades_venta:  ["caja", "unidad"],
    conversiones: {
      caja:   { tipo: "conteo",      unidades: 12, descripcion: "1 Caja = 12 Unidades" },
      unidad: { tipo: "base_conteo", descripcion: "Unidad individual" },
    },
    tipo_flujo_default: "caja_unidad",
    empaque_mayor_default: "Caja", unidad_menor_default: "Unidad",
    margen_ganancia_default: 20,
  },
  {
    id: "cc-8", nombre: "Conservas", icono: "🥫", color: "#ef4444",
    unidades_compra: ["caja", "unidad"],
    unidades_venta:  ["caja", "unidad"],
    conversiones: {
      caja:   { tipo: "conteo",      unidades: 48, descripcion: "1 Caja = 48 Unidades" },
      unidad: { tipo: "base_conteo", descripcion: "Unidad individual" },
    },
    tipo_flujo_default: "caja_unidad",
    empaque_mayor_default: "Caja", unidad_menor_default: "Unidad",
    margen_ganancia_default: 20,
  },
  {
    id: "cc-9", nombre: "Azúcar", icono: "🍬", color: "#f43f5e",
    unidades_compra: ["saco"],
    unidades_venta:  ["kilo", "medio_saco", "saco"],
    conversiones: {
      saco:       { tipo: "peso",     kg: 50,   descripcion: "1 Saco = 50 kg" },
      medio_saco: { tipo: "fraccion", base: "saco", factor: 0.5, descripcion: "½ Saco = 25 kg" },
      kilo:       { tipo: "base_peso", descripcion: "Por kilogramo" },
    },
    tipo_flujo_default: "saco_kilo",
    empaque_mayor_default: "Saco", unidad_menor_default: "Kilo",
    margen_ganancia_default: 20,
  },
  {
    id: "cc-10", nombre: "Bebidas", icono: "🧃", color: "#6366f1",
    unidades_compra: ["caja", "unidad"],
    unidades_venta:  ["caja", "unidad"],
    conversiones: {
      caja:   { tipo: "conteo",      unidades: 12, descripcion: "1 Caja = 12 Unidades" },
      unidad: { tipo: "base_conteo", descripcion: "Unidad individual" },
    },
    tipo_flujo_default: "caja_unidad",
    empaque_mayor_default: "Caja", unidad_menor_default: "Unidad",
    margen_ganancia_default: 20,
  },
];

export async function getCategoriasConfig() {
  try {
    return await request("/categorias-config");
  } catch {
    const stored = leerDesdeStorage(STORAGE_KEY_CAT_CONFIG);
    if (stored.length === 0) {
      guardarEnStorage(STORAGE_KEY_CAT_CONFIG, CATEGORIAS_CONFIG_DEFAULT);
      return CATEGORIAS_CONFIG_DEFAULT;
    }
    return stored;
  }
}

export async function getCategoriaConfigPorNombre(nombre) {
  try {
    return await request(`/categorias-config/por-nombre/${encodeURIComponent(nombre)}`);
  } catch {
    const lista = leerDesdeStorage(STORAGE_KEY_CAT_CONFIG);
    return lista.find((c) => c.nombre === nombre) || null;
  }
}

export async function crearCategoriaConfig(data) {
  return await request("/categorias-config", { method: "POST", body: JSON.stringify(data) });
}

export async function actualizarCategoriaConfig(id, data) {
  return await request(`/categorias-config/${id}`, { method: "PATCH", body: JSON.stringify(data) });
}

export async function eliminarCategoriaConfig(id) {
  return await request(`/categorias-config/${id}`, { method: "DELETE" });
}

/**
 * Motor de cálculo de precios. Única fuente de verdad: el backend
 * (crud.calcular_precios_por_categoria, que a su vez delega en
 * _precios_por_presentacion_categoria — el mismo motor que usan Compras
 * e Inventario). No hay cálculo local: si falla la llamada, se propaga
 * el error para que la UI lo muestre en vez de sugerir un precio que
 * podría no coincidir con el que calcularía el backend.
 */
export async function calcularPreciosPorCategoria({ categoria_nombre, unidad_compra, costo_compra, cantidad_comprada = 1, margen_ganancia = 20, factor_override = null }) {
  return await request("/categorias-config/calcular-precios", {
    method: "POST",
    body: JSON.stringify({ categoria_nombre, unidad_compra, costo_compra, cantidad_comprada, margen_ganancia, factor_override }),
  });
}
