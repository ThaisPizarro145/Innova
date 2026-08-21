import { useEffect, useState } from "react";
import {
  crearMovimiento, getMovimientos, getProductos, getLotes,
  getProductosVencidos, getProximosVencer, getStockBajo, getStockSinExistencia,
  actualizarMovimiento, eliminarMovimiento,
} from "../services/api";
import { stockAmigable } from "../utils/stock";
import { exportarExcel } from "../utils/exportExcel";
import { normalizarFechaUTC } from "../components/NotaVenta";

const TIPOS_AJUSTE = [
  { value: "AJUSTE_POSITIVO", label: "Ajuste Positivo (ingreso sin compra)" },
  { value: "AJUSTE_NEGATIVO", label: "Ajuste Negativo (merma, daño, vencimiento)" },
];

// Solo los ajustes manuales se pueden editar/eliminar desde aquí — ENTRADA,
// SALIDA y DEVOLUCION los genera el sistema (Compras/Ventas) y el backend
// rechaza intentos de editarlos/eliminarlos manualmente.
const TIPOS_EDITABLES = ["AJUSTE_POSITIVO", "AJUSTE_NEGATIVO"];

const TIPO_COLOR = {
  ENTRADA: { bg: "#dcfce7", color: "#16a34a" },
  SALIDA: { bg: "#fee2e2", color: "#dc2626" },
  AJUSTE_POSITIVO: { bg: "#fecaca", color: "#b91c1c" },
  AJUSTE_NEGATIVO: { bg: "#fef9c3", color: "#854d0e" },
  DEVOLUCION: { bg: "#f3e8ff", color: "#7e22ce" },
};

const TIPO_DOCUMENTO_LABEL = { ENTRADA: "Compra", SALIDA: "Venta", AJUSTE_POSITIVO: "Ajuste", AJUSTE_NEGATIVO: "Ajuste", DEVOLUCION: "Devolución" };

const fmt = (v) => `S/ ${Number(v || 0).toFixed(2)}`;
const fmtFecha = (v) => v ? new Date(v).toLocaleDateString() : "—";

const AJUSTE_INICIAL = {
  producto_id: "", tipo: "AJUSTE_POSITIVO", cantidad: "",
  costo_unitario: "", precio_unitario: "", nota: "", lote: "", fecha_vencimiento: "",
};

function Inventario() {
  const [tab, setTab] = useState("stock"); // "stock" | "lotes" | "kardex"
  const [productos, setProductos] = useState([]);
  const [movimientos, setMovimientos] = useState([]);
  const [lotes, setLotes] = useState([]);
  const [vencidos, setVencidos] = useState([]);
  const [stockBajo, setStockBajo] = useState([]);
  const [sinStock, setSinStock] = useState([]);
  const [proxVencer, setProxVencer] = useState([]);
  const [mensaje, setMensaje] = useState("");
  const [mostrarAjuste, setMostrarAjuste] = useState(false);
  const [ajusteForm, setAjusteForm] = useState({ ...AJUSTE_INICIAL });
  const [movEdit, setMovEdit] = useState(null);

  // Filtros del kardex
  const [filtroFechaDesde, setFiltroFechaDesde] = useState("");
  const [filtroFechaHasta, setFiltroFechaHasta] = useState("");
  const [filtroCantMin, setFiltroCantMin] = useState("");
  const [filtroPrecioMin, setFiltroPrecioMin] = useState("");
  const [filtroPrecioMax, setFiltroPrecioMax] = useState("");
  const [ordenPrecio, setOrdenPrecio] = useState("");

  useEffect(() => { cargarDatos(); }, []);

  const cargarDatos = async () => {
    try {
      const [prods, movs, lts, venc, bajo, sin, prox] = await Promise.all([
        getProductos(), getMovimientos(), getLotes(),
        getProductosVencidos(), getStockBajo(), getStockSinExistencia(), getProximosVencer(30),
      ]);
      setProductos(prods);
      setMovimientos(movs);
      setLotes(lts);
      setVencidos(venc);
      setStockBajo(bajo);
      setSinStock(sin);
      setProxVencer(prox);
    } catch (e) { setMensaje(e.message); }
  };

  const nombreProducto = (id) => {
    const p = productos.find((p) => String(p.id) === String(id));
    return p ? p.nombre : `ID ${id}`;
  };

  const resetAjuste = () => {
    setAjusteForm({ ...AJUSTE_INICIAL });
    setMostrarAjuste(false);
  };

  const crearAjuste = async () => {
    if (!ajusteForm.producto_id || !ajusteForm.cantidad || Number(ajusteForm.cantidad) <= 0) {
      setMensaje("Selecciona un producto y una cantidad válida."); return;
    }
    if (ajusteForm.tipo === "AJUSTE_POSITIVO" && !(Number(ajusteForm.costo_unitario) > 0)) {
      setMensaje("Un ajuste positivo requiere un costo unitario mayor a cero."); return;
    }
    try {
      await crearMovimiento({
        producto_id: Number(ajusteForm.producto_id),
        tipo: ajusteForm.tipo,
        cantidad: Number(ajusteForm.cantidad),
        costo_unitario: Number(ajusteForm.costo_unitario || 0),
        precio_unitario: Number(ajusteForm.precio_unitario || 0),
        nota: ajusteForm.nota || null,
        lote: ajusteForm.lote || null,
        fecha_vencimiento: ajusteForm.fecha_vencimiento || null,
      });
      setMensaje("✓ Ajuste registrado.");
      resetAjuste(); cargarDatos();
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
      });
      setMensaje("✓ Ajuste actualizado.");
      setMovEdit(null); cargarDatos();
    } catch (e) { setMensaje(e.message); }
  };

  const borrarMovimiento = async (id) => {
    if (!window.confirm("¿Eliminar este ajuste?\nEsto revertirá el efecto en el lote correspondiente.")) return;
    try {
      await eliminarMovimiento(id);
      setMensaje("✓ Ajuste eliminado.");
      cargarDatos();
    } catch (e) { setMensaje(e.message); }
  };

  const exportarMovimientosExcel = () => {
    const enc = ["ID", "Producto", "Tipo", "Documento", "Entrada", "Salida", "Saldo (lote)", "Lote", "F. Vencimiento", "Fecha", "Nota"];
    const filas = movimientosFiltrados.map((m) => [
      m.id, nombreProducto(m.producto_id), m.tipo, TIPO_DOCUMENTO_LABEL[m.tipo] || m.tipo,
      ["ENTRADA", "AJUSTE_POSITIVO", "DEVOLUCION"].includes(m.tipo) ? Number(m.cantidad) : "",
      ["SALIDA", "AJUSTE_NEGATIVO"].includes(m.tipo) ? Number(m.cantidad) : "",
      m.stock_despues ?? "",
      m.lote || "", m.fecha_vencimiento ? new Date(m.fecha_vencimiento).toLocaleDateString() : "",
      normalizarFechaUTC(m.fecha).toLocaleString(), m.nota || "",
    ]);
    exportarExcel("inventario_kardex", enc, filas, "Kardex");
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
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px", flexWrap: "wrap", gap: "10px" }}>
        <div>
          <h1 style={{ margin: 0 }}>📋 Inventario</h1>
        </div>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          {tab === "kardex" && <button type="button" className="btn-export" onClick={exportarMovimientosExcel}>⬇ Excel</button>}
          <button type="button" className="btn-nuevo" onClick={() => setMostrarAjuste(true)}>+ Ajuste de inventario</button>
        </div>
      </div>

      {/* ── Modal ajuste manual ── */}
      {mostrarAjuste && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && resetAjuste()}>
          <div className="modal-box" style={{ maxWidth: "560px" }}>
            <div className="modal-header">
              <h2>➕ Ajuste de inventario</h2>
              <button type="button" className="btn-cerrar" onClick={resetAjuste}>✕</button>
            </div>
            <form className="formulario-grid" onSubmit={(e) => { e.preventDefault(); crearAjuste(); }}>
              <div className="campo campo-full">
                <label>Producto *</label>
                <select value={ajusteForm.producto_id} onChange={(e) => setAjusteForm({ ...ajusteForm, producto_id: e.target.value })}>
                  <option value="">— Seleccione un producto —</option>
                  {productos.map((p) => (
                    <option key={p.id} value={p.id}>{p.nombre} — stock: {stockAmigable(p, p.stock_actual)}</option>
                  ))}
                </select>
              </div>
              <div className="campo campo-full">
                <label>Tipo de ajuste *</label>
                <select value={ajusteForm.tipo} onChange={(e) => setAjusteForm({ ...ajusteForm, tipo: e.target.value })}>
                  {TIPOS_AJUSTE.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
              <div className="campo">
                <label>Cantidad (unidades) *</label>
                <input type="number" min="0.01" step="0.01" value={ajusteForm.cantidad}
                  onChange={(e) => setAjusteForm({ ...ajusteForm, cantidad: e.target.value })} placeholder="0" />
              </div>
              {ajusteForm.tipo === "AJUSTE_POSITIVO" && (
                <>
                  <div className="campo">
                    <label>Costo unitario *</label>
                    <input type="number" step="0.01" min="0.01" value={ajusteForm.costo_unitario}
                      onChange={(e) => setAjusteForm({ ...ajusteForm, costo_unitario: e.target.value })} placeholder="0.00" />
                  </div>
                  <div className="campo">
                    <label>Lote <span style={{ fontWeight: 400, color: "#94a3b8" }}>(opcional)</span></label>
                    <input value={ajusteForm.lote} onChange={(e) => setAjusteForm({ ...ajusteForm, lote: e.target.value })} placeholder="Ej: AJUSTE-01" />
                  </div>
                  <div className="campo">
                    <label>Fecha de vencimiento <span style={{ fontWeight: 400, color: "#94a3b8" }}>(opcional)</span></label>
                    <input type="date" value={ajusteForm.fecha_vencimiento} onChange={(e) => setAjusteForm({ ...ajusteForm, fecha_vencimiento: e.target.value })} />
                  </div>
                </>
              )}
              {ajusteForm.tipo === "AJUSTE_NEGATIVO" && (
                <div className="campo-full" style={{ fontSize: "0.8rem", color: "#64748b" }}>
                  Se descuenta automáticamente del lote más próximo a vencer (FIFO).
                </div>
              )}
              <div className="campo campo-full">
                <label>Nota</label>
                <input value={ajusteForm.nota} onChange={(e) => setAjusteForm({ ...ajusteForm, nota: e.target.value })} placeholder="Motivo del ajuste" />
              </div>
              {mensaje && <p className="mensaje campo-full">{mensaje}</p>}
              <div className="modal-acciones campo-full">
                <button type="submit" className="btn-nuevo">💾 Guardar ajuste</button>
                <button type="button" className="btn-cancelar"
                  style={{ background: "#f1f5f9", border: "none", borderRadius: "10px", padding: "10px 18px", cursor: "pointer" }}
                  onClick={resetAjuste}>Cancelar</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Modal editar ajuste ── */}
      {movEdit && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setMovEdit(null)}>
          <div className="modal-box" style={{ maxWidth: "520px" }}>
            <div className="modal-header">
              <h2>✏️ Editar ajuste #{movEdit.id}</h2>
              <button type="button" className="btn-cerrar" onClick={() => setMovEdit(null)}>✕</button>
            </div>
            <form className="formulario-grid" onSubmit={(e) => { e.preventDefault(); guardarEdicion(); }}>
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
              {movEdit.tipo === "AJUSTE_POSITIVO" && (
                <div className="campo">
                  <label>Costo unitario</label>
                  <input type="number" step="0.01" min="0" value={movEdit.costo_unitario || ""}
                    onChange={(e) => setMovEdit({ ...movEdit, costo_unitario: e.target.value })} />
                </div>
              )}
              <div className="campo campo-full">
                <label>Nota</label>
                <input value={movEdit.nota || ""}
                  onChange={(e) => setMovEdit({ ...movEdit, nota: e.target.value })} />
              </div>
              {mensaje && <p className="mensaje campo-full">{mensaje}</p>}
              <div className="modal-acciones campo-full">
                <button type="submit" className="btn-nuevo">💾 Guardar cambios</button>
                <button type="button" className="btn-cancelar"
                  style={{ background: "#f1f5f9", border: "none", borderRadius: "10px", padding: "10px 18px", cursor: "pointer" }}
                  onClick={() => setMovEdit(null)}>Cancelar</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {mensaje && !mostrarAjuste && !movEdit && <p className="mensaje">{mensaje}</p>}

      {/* ── Cards resumen ── */}
      <div className="cards">
        <div className="info-card"><h2>{stockBajo.length}</h2><h3>Stock bajo</h3></div>
        <div className="info-card"><h2>{sinStock.length}</h2><h3>Sin stock</h3></div>
        <div className="info-card"><h2>{vencidos.length}</h2><h3>Vencidos</h3></div>
        <div className="info-card"><h2>{proxVencer.length}</h2><h3>Próx. a vencer (30d)</h3></div>
      </div>

      {/* ── Tabs ── */}
      <div className="compras-tabs" style={{ marginTop: "20px" }}>
        <button className={`compras-tab${tab === "stock" ? " activo" : ""}`} onClick={() => setTab("stock")}>📊 Stock</button>
        <button className={`compras-tab${tab === "lotes" ? " activo" : ""}`} onClick={() => setTab("lotes")}>🧴 Lotes</button>
        <button className={`compras-tab${tab === "kardex" ? " activo" : ""}`} onClick={() => setTab("kardex")}>📖 Kardex</button>
      </div>

      {/* ── Tab: Stock ── */}
      {tab === "stock" && (
        <div className="tabla-wrapper" style={{ marginTop: "16px" }}>
          <table className="tabla">
            <thead>
              <tr>
                <th>Producto</th>
                <th>Stock actual</th>
                <th>Stock mínimo</th>
                <th>Último costo</th>
                <th>Última compra</th>
                <th>Última venta</th>
                <th>Fecha de vencimiento</th>
              </tr>
            </thead>
            <tbody>
              {productos.length === 0 ? (
                <tr><td colSpan="7" style={{ textAlign: "center", color: "#94a3b8", padding: "24px" }}>Sin productos</td></tr>
              ) : productos.map((p) => {
                const bajo = Number(p.stock_actual || 0) <= Number(p.stock_minimo || 0);
                const venc = p.proximo_vencimiento ? new Date(p.proximo_vencimiento) : null;
                const diasVenc = venc ? Math.ceil((venc - new Date()) / 86400000) : null;
                return (
                  <tr key={p.id}>
                    <td style={{ fontWeight: 600 }}>{p.nombre}</td>
                    <td>
                      <span style={{ color: bajo ? "#dc2626" : "#16a34a", fontWeight: 700 }}>
                        {bajo ? "⚠️ " : ""}{stockAmigable(p, p.stock_actual)}
                      </span>
                    </td>
                    <td>{p.stock_minimo ?? 0}</td>
                    <td>{p.ultimo_costo != null ? fmt(p.ultimo_costo) : "—"}</td>
                    <td>{fmtFecha(p.ultima_compra)}</td>
                    <td>{fmtFecha(p.ultima_venta)}</td>
                    <td>
                      {venc ? (
                        <span style={{
                          fontWeight: 600,
                          color: diasVenc < 0 ? "#dc2626" : diasVenc <= 30 ? "#d97706" : "#334155",
                        }}>
                          {diasVenc < 0 ? "⚠️ Vencido" : diasVenc <= 30 ? `⚠️ ${venc.toLocaleDateString()}` : venc.toLocaleDateString()}
                        </span>
                      ) : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Tab: Lotes ── */}
      {tab === "lotes" && (
        <div className="tabla-wrapper" style={{ marginTop: "16px" }}>
          <table className="tabla">
            <thead>
              <tr>
                <th>Producto</th>
                <th>Lote</th>
                <th>Fecha de vencimiento</th>
                <th>Cantidad disponible</th>
              </tr>
            </thead>
            <tbody>
              {lotes.filter((l) => l.cantidad_disponible > 0).length === 0 ? (
                <tr><td colSpan="4" style={{ textAlign: "center", color: "#94a3b8", padding: "24px" }}>Sin lotes con stock disponible</td></tr>
              ) : lotes.filter((l) => l.cantidad_disponible > 0).map((l) => (
                <tr key={l.id}>
                  <td style={{ fontWeight: 600 }}>{l.producto_nombre}</td>
                  <td>{l.codigo_lote || "—"}</td>
                  <td>{fmtFecha(l.fecha_vencimiento)}</td>
                  <td>{Number(l.cantidad_disponible).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Tab: Kardex ── */}
      {tab === "kardex" && (
        <>
          <div className="header-filtros" style={{ marginTop: "16px" }}>
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

          <div className="tabla-wrapper" style={{ marginTop: "12px" }}>
            <table className="tabla">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Producto</th>
                  <th>Tipo de movimiento</th>
                  <th>Documento</th>
                  <th>Entrada</th>
                  <th>Salida</th>
                  <th>Saldo lote</th>
                  <th>Lote</th>
                  <th>F. Vencimiento</th>
                  <th>Nota</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {movimientosFiltrados.length === 0 ? (
                  <tr><td colSpan="11" style={{ textAlign: "center", color: "#94a3b8", padding: "24px" }}>
                    No hay movimientos registrados
                  </td></tr>
                ) : movimientosFiltrados.map((m) => {
                  const tc = TIPO_COLOR[m.tipo] || { bg: "#f1f5f9", color: "#475569" };
                  const esEntrada = ["ENTRADA", "AJUSTE_POSITIVO", "DEVOLUCION"].includes(m.tipo);
                  const editable = TIPOS_EDITABLES.includes(m.tipo);
                  return (
                    <tr key={m.id}>
                      <td style={{ fontSize: "0.8rem", color: "#64748b", whiteSpace: "nowrap" }}>{normalizarFechaUTC(m.fecha).toLocaleString()}</td>
                      <td style={{ fontWeight: 600, fontSize: "0.85rem" }}>{nombreProducto(m.producto_id)}</td>
                      <td>
                        <span style={{ background: tc.bg, color: tc.color, padding: "2px 8px", borderRadius: "20px", fontSize: "0.75rem", fontWeight: 700 }}>
                          {m.tipo}
                        </span>
                      </td>
                      <td style={{ fontSize: "0.8rem" }}>{TIPO_DOCUMENTO_LABEL[m.tipo] || m.tipo}{m.venta_id ? ` #${m.venta_id}` : ""}</td>
                      <td style={{ fontWeight: 700, color: "#16a34a" }}>{esEntrada ? m.cantidad : ""}</td>
                      <td style={{ fontWeight: 700, color: "#dc2626" }}>{!esEntrada ? m.cantidad : ""}</td>
                      <td style={{ fontSize: "0.82rem", whiteSpace: "nowrap" }}>{m.stock_despues ?? "—"}</td>
                      <td style={{ fontSize: "0.82rem" }}>{m.lote || "—"}</td>
                      <td style={{ fontSize: "0.82rem" }}>{fmtFecha(m.fecha_vencimiento)}</td>
                      <td style={{ fontSize: "0.82rem", maxWidth: "120px", overflow: "hidden", textOverflow: "ellipsis" }}>{m.nota || "—"}</td>
                      <td>
                        {editable ? (
                          <div style={{ display: "flex", gap: "4px" }}>
                            <button type="button"
                              style={{ background: "#dc2626", color: "white", border: "none", borderRadius: "6px", padding: "5px 9px", cursor: "pointer", fontSize: "0.8rem" }}
                              onClick={() => setMovEdit({ ...m })}>✏️</button>
                            <button type="button"
                              style={{ background: "#ef4444", color: "white", border: "none", borderRadius: "6px", padding: "5px 9px", cursor: "pointer", fontSize: "0.8rem" }}
                              onClick={() => borrarMovimiento(m.id)}>🗑️</button>
                          </div>
                        ) : <span style={{ color: "#cbd5e1", fontSize: "0.78rem" }}>—</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

export default Inventario;
