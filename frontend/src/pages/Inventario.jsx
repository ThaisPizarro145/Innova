import { useEffect, useState } from "react";
import {
  crearMovimiento, getMovimientos, getProductos,
  getProductosVencidos, getProximosVencer, getStockBajo,
  actualizarMovimiento, eliminarMovimiento, getCategoriasConfig,
} from "../services/api";
import { stockAmigable } from "../utils/stock";
import { exportarExcel } from "../utils/exportExcel";
import { normalizarFechaUTC } from "../components/NotaVenta";

const tiposMovimiento = [
  { value: "ENTRADA", label: "Entrada" },
  { value: "SALIDA", label: "Salida" },
  { value: "AJUSTE_POSITIVO", label: "Ajuste Positivo" },
  { value: "AJUSTE_NEGATIVO", label: "Ajuste Negativo" },
];

const TIPO_COLOR = {
  ENTRADA: { bg: "#dcfce7", color: "#16a34a" },
  SALIDA: { bg: "#fee2e2", color: "#dc2626" },
  AJUSTE_POSITIVO: { bg: "#dbeafe", color: "#1d4ed8" },
  AJUSTE_NEGATIVO: { bg: "#fef9c3", color: "#854d0e" },
  DEVOLUCION: { bg: "#f3e8ff", color: "#7e22ce" },
};

const fmt = (v) => `S/ ${Number(v || 0).toFixed(2)}`;

function Inventario() {
  const [productos, setProductos] = useState([]);
  const [movimientos, setMovimientos] = useState([]);
  const [categoriasConfig, setCategoriasConfig] = useState([]);
  const [productoId, setProductoId] = useState("");
  const [tipo, setTipo] = useState("ENTRADA");
  const [cantidad, setCantidad] = useState("");
  const [nota, setNota] = useState("");
  const [costo, setCosto] = useState("");
  const [precio, setPrecio] = useState("");
  const [fechaIngreso, setFechaIngreso] = useState("");
  const [fechaVenc, setFechaVenc] = useState("");
  const [fechaSalida, setFechaSalida] = useState("");
  const [lote, setLote] = useState("");
  const [vencidos, setVencidos] = useState([]);
  const [stockBajo, setStockBajo] = useState([]);
  const [proxVencer, setProxVencer] = useState([]);
  const [mensaje, setMensaje] = useState("");
  const [mostrarForm, setMostrarForm] = useState(false);
  const [movEdit, setMovEdit] = useState(null);

  // Filtros
  const [filtroFechaDesde, setFiltroFechaDesde] = useState("");
  const [filtroFechaHasta, setFiltroFechaHasta] = useState("");
  const [filtroCantMin, setFiltroCantMin] = useState("");
  const [filtroPrecioMin, setFiltroPrecioMin] = useState("");
  const [filtroPrecioMax, setFiltroPrecioMax] = useState("");
  const [ordenPrecio, setOrdenPrecio] = useState("");

  const productoSeleccionado = productos.find((p) => String(p.id) === String(productoId));

  useEffect(() => { cargarDatos(); }, []);

  useEffect(() => {
    if (productoSeleccionado) {
      setCosto(productoSeleccionado.costo || "");
      setPrecio(productoSeleccionado.precio_venta || "");
      setFechaVenc(productoSeleccionado.fecha_vencimiento || "");
      setLote(productoSeleccionado.lote || "");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productoId]);

  const cargarDatos = async () => {
    try {
      const [prods, movs, venc, bajo, prox, catCfg] = await Promise.all([
        getProductos(), getMovimientos(),
        getProductosVencidos(), getStockBajo(), getProximosVencer(30),
        getCategoriasConfig(),
      ]);
      setProductos(prods);
      setMovimientos(movs);
      setVencidos(venc);
      setStockBajo(bajo);
      setProxVencer(prox);
      setCategoriasConfig(catCfg);
    } catch (e) { setMensaje(e.message); }
  };

  const nombreProducto = (id) => {
    const p = productos.find((p) => String(p.id) === String(id));
    return p ? `${p.codigo} - ${p.nombre}` : `ID ${id}`;
  };

  // Enriquecer producto con equivalencias de su categoría si no las tiene guardadas
  const productoConEquiv = (prod) => {
    if (!prod) return prod;
    if (prod.equivalencias && Object.values(prod.equivalencias).some(Boolean)) return prod;
    const cat = categoriasConfig.find((c) => c.nombre === prod.categoria);
    if (!cat) return prod;
    const nombreEmp = (prod.nombre_empaque_mayor || cat.empaque_mayor_default || "").toLowerCase();
    const conv = cat.conversiones?.[nombreEmp] || {};
    return {
      ...prod,
      tipo_flujo: prod.tipo_flujo || cat.tipo_flujo_default,
      nombre_empaque_mayor: prod.nombre_empaque_mayor || cat.empaque_mayor_default,
      nombre_unidad_menor: prod.nombre_unidad_menor || cat.unidad_menor_default,
      equivalencias: {
        unidades_por_empaque: conv.unidades || null,
        kg_por_empaque: conv.kg || null,
        nivel2_por_empaque: conv.nivel2_cantidad || null,
        unidades_por_nivel2: null,
      },
    };
  };

  const resetForm = () => {
    setProductoId(""); setTipo("ENTRADA"); setCantidad("");
    setCosto(""); setPrecio(""); setNota(""); setLote("");
    setFechaIngreso(""); setFechaVenc(""); setFechaSalida("");
    setMostrarForm(false);
  };

  const crearNuevoMovimiento = async () => {
    if (!productoId || !cantidad || Number(cantidad) <= 0) {
      setMensaje("Selecciona un producto y una cantidad válida."); return;
    }
    try {
      await crearMovimiento({
        producto_id: Number(productoId), tipo,
        cantidad: Number(cantidad),
        costo_unitario: Number(costo || 0),
        precio_unitario: Number(precio || 0),
        nota: nota || null,
        fecha_vencimiento: fechaVenc || null,
        lote: lote || null,
      });
      setMensaje("✓ Compra registrada. Stock y precios del producto actualizados.");
      resetForm(); cargarDatos();
    } catch (e) { setMensaje(e.message); }
  };

  const guardarEdicion = async () => {
    if (!movEdit) return;
    try {
      await actualizarMovimiento(movEdit.id, {
        cantidad: Number(movEdit.cantidad),
        costo_unitario: Number(movEdit.costo_unitario || 0),
        precio_unitario: Number(movEdit.precio_unitario || 0),
        nota: movEdit.nota || null,
        fecha_vencimiento: movEdit.fecha_vencimiento || null,
        lote: movEdit.lote || null,
      });
      setMensaje("✓ Movimiento actualizado.");
      setMovEdit(null); cargarDatos();
    } catch (e) { setMensaje(e.message); }
  };

  const borrarMovimiento = async (id) => {
    if (!window.confirm("¿Eliminar este movimiento?\nEsto revertirá el efecto en el stock del producto.")) return;
    try {
      await eliminarMovimiento(id);
      setMensaje("✓ Movimiento eliminado y stock revertido.");
      cargarDatos();
    } catch (e) { setMensaje(e.message); }
  };

  const exportarMovimientosExcel = () => {
    const enc = ["ID", "Producto", "Tipo", "Cantidad", "Costo unit.", "Precio venta", "Stock despues", "Lote", "F. Vencimiento", "Fecha registro", "Nota"];
    const filas = movimientosFiltrados.map((m) => [
      m.id, nombreProducto(m.producto_id), m.tipo, Number(m.cantidad),
      Number(m.costo_unitario || 0), Number(m.precio_unitario || 0), m.stock_despues,
      m.lote || "", m.fecha_vencimiento ? new Date(m.fecha_vencimiento).toLocaleDateString() : "",
      normalizarFechaUTC(m.fecha).toLocaleString(), m.nota || "",
    ]);
    exportarExcel("inventario_movimientos", enc, filas, "Movimientos");
  };

  const movimientosFiltrados = movimientos.filter((m) => {
    const fecha = normalizarFechaUTC(m.fecha);
    if (filtroFechaDesde && fecha < new Date(filtroFechaDesde)) return false;
    if (filtroFechaHasta && fecha > new Date(filtroFechaHasta + "T23:59:59")) return false;
    if (filtroCantMin && Number(m.cantidad) < Number(filtroCantMin)) return false;
    const p = Number(m.precio_unitario || 0);
    if (filtroPrecioMin && p < Number(filtroPrecioMin)) return false;
    if (filtroPrecioMax && p > Number(filtroPrecioMax)) return false;
    return true;
  }).sort((a, b) => {
    if (ordenPrecio === "asc") return Number(a.precio_unitario || 0) - Number(b.precio_unitario || 0);
    if (ordenPrecio === "desc") return Number(b.precio_unitario || 0) - Number(a.precio_unitario || 0);
    return 0;
  });

  return (
    <div>
      {/* ── Header ── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
        <h1>🚚 Compras</h1>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          <button type="button" className="btn-export" onClick={exportarMovimientosExcel}>⬇ Excel</button>
          <button type="button" className="btn-nuevo" onClick={() => setMostrarForm(true)}>+ Nueva compra</button>
        </div>
      </div>

      {/* ── Modal nueva compra ── */}
      {mostrarForm && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && resetForm()}>
          <div className="modal-box" style={{ maxWidth: "680px" }}>
            <div className="modal-header">
              <h2>➕ Registrar compra</h2>
              <button type="button" className="btn-cerrar" onClick={resetForm}>✕</button>
            </div>
            <div className="formulario-grid">
              <div className="campo campo-full">
                <label>Producto *</label>
                <select value={productoId} onChange={(e) => setProductoId(e.target.value)}>
                  <option value="">— Seleccione un producto —</option>
                  {productos.map((p) => (
                    <option key={p.id} value={p.id}>{p.codigo} — {p.nombre}</option>
                  ))}
                </select>
              </div>

              {productoSeleccionado && (
                <div className="campo-full">
                  <div className="producto-info-compra">
                    <span>📦 Stock: <strong>{stockAmigable(productoConEquiv(productoSeleccionado), productoSeleccionado.stock_actual)}</strong></span>
                    <span>💰 Costo: <strong>{fmt(productoSeleccionado.costo)}</strong></span>
                    <span>🏷 Precio venta: <strong>{fmt(productoSeleccionado.precio_venta)}</strong></span>
                  </div>
                </div>
              )}

              <div className="campo">
                <label>Tipo de movimiento</label>
                <select value={tipo} onChange={(e) => setTipo(e.target.value)}>
                  {tiposMovimiento.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
              <div className="campo">
                <label>Cantidad *</label>
                <input type="number" min="0.01" step="0.01" value={cantidad}
                  onChange={(e) => setCantidad(e.target.value)} placeholder="0" />
              </div>
              <div className="campo">
                <label>Costo unitario <span style={{ color: "#10b981", fontSize: "0.75rem" }}>↻ actualiza producto</span></label>
                <input type="number" step="0.01" min="0" value={costo}
                  onChange={(e) => setCosto(e.target.value)} placeholder="0.00" />
              </div>
              <div className="campo">
                <label>Precio de venta <span style={{ color: "#10b981", fontSize: "0.75rem" }}>↻ actualiza producto</span></label>
                <input type="number" step="0.01" min="0" value={precio}
                  onChange={(e) => setPrecio(e.target.value)} placeholder="0.00" />
              </div>
              <div className="campo">
                <label>Lote <span style={{ color: "#10b981", fontSize: "0.75rem" }}>↻ actualiza producto</span></label>
                <input value={lote} onChange={(e) => setLote(e.target.value)} placeholder="Ej: L-2025-07" />
              </div>
              <div className="campo">
                <label>Fecha de ingreso</label>
                <input type="date" value={fechaIngreso} onChange={(e) => setFechaIngreso(e.target.value)} />
              </div>
              <div className="campo">
                <label>Fecha de vencimiento <span style={{ color: "#10b981", fontSize: "0.75rem" }}>↻ actualiza producto</span></label>
                <input type="date" value={fechaVenc} onChange={(e) => setFechaVenc(e.target.value)} />
              </div>
              <div className="campo">
                <label>Fecha de salida</label>
                <input type="date" value={fechaSalida} onChange={(e) => setFechaSalida(e.target.value)} />
              </div>
              <div className="campo campo-full">
                <label>Nota</label>
                <input value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Observaciones opcionales" />
              </div>
              {mensaje && <p className="mensaje campo-full">{mensaje}</p>}
              <div className="modal-acciones campo-full">
                <button type="button" className="btn-nuevo" onClick={crearNuevoMovimiento}>💾 Guardar compra</button>
                <button type="button" className="btn-cancelar"
                  style={{ background: "#f1f5f9", border: "none", borderRadius: "10px", padding: "10px 18px", cursor: "pointer" }}
                  onClick={resetForm}>Cancelar</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal editar movimiento ── */}
      {movEdit && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setMovEdit(null)}>
          <div className="modal-box" style={{ maxWidth: "520px" }}>
            <div className="modal-header">
              <h2>✏️ Editar movimiento #{movEdit.id}</h2>
              <button type="button" className="btn-cerrar" onClick={() => setMovEdit(null)}>✕</button>
            </div>
            <div className="formulario-grid">
              <div className="campo campo-full" style={{ background: "#f8fafc", borderRadius: "10px", padding: "10px 14px" }}>
                <span style={{ fontSize: "0.85rem", color: "#475569" }}>
                  Producto: <strong>{nombreProducto(movEdit.producto_id)}</strong>
                  {" · "}Tipo: <strong>{movEdit.tipo}</strong>
                </span>
              </div>
              <div className="campo">
                <label>Cantidad</label>
                <input type="number" min="0.01" step="0.01" value={movEdit.cantidad}
                  onChange={(e) => setMovEdit({ ...movEdit, cantidad: e.target.value })} />
              </div>
              <div className="campo">
                <label>Costo unitario</label>
                <input type="number" step="0.01" min="0" value={movEdit.costo_unitario || ""}
                  onChange={(e) => setMovEdit({ ...movEdit, costo_unitario: e.target.value })} />
              </div>
              <div className="campo">
                <label>Precio de venta</label>
                <input type="number" step="0.01" min="0" value={movEdit.precio_unitario || ""}
                  onChange={(e) => setMovEdit({ ...movEdit, precio_unitario: e.target.value })} />
              </div>
              <div className="campo">
                <label>Lote</label>
                <input value={movEdit.lote || ""}
                  onChange={(e) => setMovEdit({ ...movEdit, lote: e.target.value })} />
              </div>
              <div className="campo">
                <label>Fecha de vencimiento</label>
                <input type="date" value={movEdit.fecha_vencimiento || ""}
                  onChange={(e) => setMovEdit({ ...movEdit, fecha_vencimiento: e.target.value })} />
              </div>
              <div className="campo campo-full">
                <label>Nota</label>
                <input value={movEdit.nota || ""}
                  onChange={(e) => setMovEdit({ ...movEdit, nota: e.target.value })} />
              </div>
              {mensaje && <p className="mensaje campo-full">{mensaje}</p>}
              <div className="modal-acciones campo-full">
                <button type="button" className="btn-nuevo" onClick={guardarEdicion}>💾 Guardar cambios</button>
                <button type="button" className="btn-cancelar"
                  style={{ background: "#f1f5f9", border: "none", borderRadius: "10px", padding: "10px 18px", cursor: "pointer" }}
                  onClick={() => setMovEdit(null)}>Cancelar</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {mensaje && !mostrarForm && !movEdit && <p className="mensaje">{mensaje}</p>}

      {/* ── Cards resumen ── */}
      <div className="cards">
        <div className="info-card"><h2>{stockBajo.length}</h2><h3>Stock bajo</h3></div>
        <div className="info-card"><h2>{vencidos.length}</h2><h3>Vencidos</h3></div>
        <div className="info-card"><h2>{proxVencer.length}</h2><h3>Próx. a vencer (30d)</h3></div>
        <div className="info-card"><h2>{movimientosFiltrados.length}</h2><h3>Movimientos</h3></div>
      </div>

      {/* ── Filtros ── */}
      <h2 style={{ marginTop: "24px", marginBottom: "10px" }}>Historial de movimientos</h2>
      <div className="header-filtros">
        <div className="filtros-grupo"><label>Desde</label>
          <input type="date" value={filtroFechaDesde} onChange={(e) => setFiltroFechaDesde(e.target.value)} /></div>
        <div className="filtros-grupo"><label>Hasta</label>
          <input type="date" value={filtroFechaHasta} onChange={(e) => setFiltroFechaHasta(e.target.value)} /></div>
        <div className="filtros-grupo"><label>Cant. mín.</label>
          <input type="number" min="0" placeholder="0" value={filtroCantMin} onChange={(e) => setFiltroCantMin(e.target.value)} /></div>
        <div className="filtros-grupo"><label>Precio mín.</label>
          <input type="number" min="0" step="0.01" value={filtroPrecioMin} onChange={(e) => setFiltroPrecioMin(e.target.value)} /></div>
        <div className="filtros-grupo"><label>Precio máx.</label>
          <input type="number" min="0" step="0.01" value={filtroPrecioMax} onChange={(e) => setFiltroPrecioMax(e.target.value)} /></div>
        <div className="filtros-grupo">
          <label>Ordenar precio</label>
          <select value={ordenPrecio} onChange={(e) => setOrdenPrecio(e.target.value)}>
            <option value="">Sin orden</option>
            <option value="asc">Menor → Mayor</option>
            <option value="desc">Mayor → Menor</option>
          </select>
        </div>
      </div>

      {/* ── Tabla ── */}
      <div className="tabla-wrapper" style={{ marginTop: "12px" }}>
        <table className="tabla">
          <thead>
            <tr>
              <th>ID</th>
              <th>Producto</th>
              <th>Tipo</th>
              <th>Cantidad</th>
              <th>Costo unit.</th>
              <th>Precio venta</th>
              <th>Stock después</th>
              <th>Lote</th>
              <th>F. Vencimiento</th>
              <th>Fecha registro</th>
              <th>Nota</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {movimientosFiltrados.length === 0 ? (
              <tr><td colSpan="12" style={{ textAlign: "center", color: "#94a3b8", padding: "24px" }}>
                No hay movimientos registrados
              </td></tr>
            ) : movimientosFiltrados.map((m) => {
              const tc = TIPO_COLOR[m.tipo] || { bg: "#f1f5f9", color: "#475569" };
              const prodMov = productoConEquiv(productos.find((p) => String(p.id) === String(m.producto_id)));
              return (
                <tr key={m.id}>
                  <td style={{ color: "#94a3b8", fontSize: "0.8rem" }}>#{m.id}</td>
                  <td style={{ fontWeight: 600, fontSize: "0.85rem" }}>{nombreProducto(m.producto_id)}</td>
                  <td>
                    <span style={{ background: tc.bg, color: tc.color, padding: "2px 8px", borderRadius: "20px", fontSize: "0.75rem", fontWeight: 700 }}>
                      {m.tipo}
                    </span>
                  </td>
                  <td style={{ fontWeight: 700 }}>{m.cantidad}</td>
                  <td>{fmt(m.costo_unitario)}</td>
                  <td style={{ color: "#0f6df2", fontWeight: 600 }}>{fmt(m.precio_unitario)}</td>
                  <td style={{ fontSize: "0.82rem", whiteSpace: "nowrap" }}>
                    {prodMov ? stockAmigable(prodMov, m.stock_despues) : m.stock_despues}
                  </td>
                  <td style={{ fontSize: "0.82rem" }}>{m.lote || "—"}</td>
                  <td style={{ fontSize: "0.82rem" }}>
                    {m.fecha_vencimiento ? new Date(m.fecha_vencimiento).toLocaleDateString() : "—"}
                  </td>
                  <td style={{ fontSize: "0.8rem", color: "#64748b" }}>{normalizarFechaUTC(m.fecha).toLocaleString()}</td>
                  <td style={{ fontSize: "0.82rem", maxWidth: "120px", overflow: "hidden", textOverflow: "ellipsis" }}>{m.nota || "—"}</td>
                  <td>
                    <div style={{ display: "flex", gap: "4px" }}>
                      <button type="button"
                        style={{ background: "#0f6df2", color: "white", border: "none", borderRadius: "6px", padding: "5px 9px", cursor: "pointer", fontSize: "0.8rem" }}
                        onClick={() => setMovEdit({ ...m })}>✏️</button>
                      <button type="button"
                        style={{ background: "#ef4444", color: "white", border: "none", borderRadius: "6px", padding: "5px 9px", cursor: "pointer", fontSize: "0.8rem" }}
                        onClick={() => borrarMovimiento(m.id)}>🗑️</button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default Inventario;
