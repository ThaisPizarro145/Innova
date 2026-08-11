export const BASE_URL = (import.meta.env.VITE_API_URL || "http://127.0.0.1:8000").replace(/\/$/, "");

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
  const queryString = query ? `?query=${encodeURIComponent(query)}` : "";
  return await request(`/inventario/productos${queryString}`);
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
 * @param {Object} precios - { presentacion: precio } e.g. { "Caja": 150, "Unidad": 13.50, "Blíster": 25 }
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
  const params = productoId ? `?producto_id=${productoId}` : "";
  return await request(`/inventario/movimientos${params}`);
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
  return await request(`/inventario/reportes/vencidos`);
}

export async function getStockBajo() {
  return await request(`/inventario/reportes/stock-bajo`);
}

export async function getProximosVencer(dias = 30) {
  return await request(`/inventario/reportes/proximos-vencer?dias=${dias}`);
}

export async function getClientes(query = "") {
  const queryString = query ? `?query=${encodeURIComponent(query)}` : "";
  return await request(`/clientes${queryString}`);
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
  return await request(`/clientes/${id}/historial`);
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

// ─── Categorías ───────────────────────────────────────────────

export async function getCategorias() {
  return await request("/categorias");
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
  const params = new URLSearchParams({ periodo, fecha_desde: fechaDesde, fecha_hasta: fechaHasta });
  return await request(`/reportes/resumen?${params}`);
}

// ─── Caja ──────────────────────────────────────────────────────

export async function getCajaMovimientos() {
  return await request("/caja/movimientos");
}

export async function crearCajaMovimiento(movimiento) {
  return await request("/caja/movimientos", { method: "POST", body: JSON.stringify(movimiento) });
}

export async function eliminarCajaMovimiento(id) {
  return await request(`/caja/movimientos/${id}`, { method: "DELETE" });
}

// ─── Compras ───────────────────────────────────────────────────

/**
 * Calcula costos y precios sugeridos. Única fuente de verdad: el backend
 * (_calcular_detalle_compra / _precios_por_presentacion_producto en
 * app/crud.py). No existe cálculo local en el frontend — si el backend no
 * responde, se propaga el error en vez de mostrar un precio adivinado que
 * podría no coincidir con lo que Compras terminaría persistiendo.
 * @param {object} item - Objeto CompraDetalleCreate (producto_id, presentacion, cantidad_presentacion, precio_presentacion, porcentaje_ganancia)
 */
export async function previewCalculoCompra(item) {
  return await request("/compras/preview", {
    method: "POST",
    body: JSON.stringify(item),
  });
}

export async function getCompras() {
  return await request("/compras");
}

export async function registrarCompra(compra) {
  return await request("/compras", { method: "POST", body: JSON.stringify(compra) });
}

export async function anularCompra(id) {
  return await request(`/compras/${id}/anular`, { method: "POST" });
}

export async function getComprasPorProveedor() {
  return await request(`/compras/reportes/por-proveedor`);
}

export async function getComprasPorFecha() {
  return await request(`/compras/reportes/por-fecha`);
}

// ─── Lotes ─────────────────────────────────────────────────────

export async function getLotes({ productoId = null, soloDisponibles = false } = {}) {
  const params = new URLSearchParams();
  if (productoId) params.set("producto_id", productoId);
  if (soloDisponibles) params.set("solo_disponibles", "true");
  const qs = params.toString() ? `?${params}` : "";
  return await request(`/inventario/lotes${qs}`);
}

export async function getStockSinExistencia() {
  return await request(`/inventario/reportes/sin-stock`);
}

// ─── Proveedores ───────────────────────────────────────────────

export async function getProveedores(query = "") {
  const queryString = query ? `?query=${encodeURIComponent(query)}` : "";
  return await request(`/proveedores${queryString}`);
}

export async function crearProveedor(proveedor) {
  return await request(`/proveedores`, { method: "POST", body: JSON.stringify(proveedor) });
}

export async function actualizarProveedor(id, proveedor) {
  return await request(`/proveedores/${id}`, { method: "PATCH", body: JSON.stringify(proveedor) });
}

export async function eliminarProveedor(id) {
  return await request(`/proveedores/${id}`, { method: "DELETE" });
}

// ─── Caja: apertura y cierre ───────────────────────────────────

export async function getAperturaActiva() {
  try {
    return await request(`/caja/apertura-activa`);
  } catch {
    return null;
  }
}

export async function abrirCaja(datos) {
  return await request(`/caja/apertura`, { method: "POST", body: JSON.stringify(datos) });
}

export async function cerrarCaja(datos) {
  return await request(`/caja/cierre`, { method: "POST", body: JSON.stringify(datos) });
}

export async function getCajaAperturas() {
  return await request(`/caja/aperturas`);
}

// ─── Reportes: ganancia ────────────────────────────────────────

export async function getGananciaPorProducto({ fechaDesde = "", fechaHasta = "" } = {}) {
  const params = new URLSearchParams();
  if (fechaDesde) params.set("fecha_desde", fechaDesde);
  if (fechaHasta) params.set("fecha_hasta", fechaHasta);
  const qs = params.toString() ? `?${params}` : "";
  return await request(`/reportes/ganancia-producto${qs}`);
}
