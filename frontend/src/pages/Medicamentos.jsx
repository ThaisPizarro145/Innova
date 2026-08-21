/**
 * Productos.jsx — Módulo de Productos (farmacia)
 * Presentaciones fijas: Caja / Unidad / Blíster, con precios independientes
 * por presentación y categoría real (categoria_id -> tabla Categorías).
 */
import { useEffect, useState, useCallback } from "react";
import FormularioProducto from "../components/FormularioProducto";
import {
  crearProducto, eliminarProducto, getProductos, actualizarProducto,
  actualizarPreciosPresentacion,
} from "../services/api";
import { useCategorias } from "../hooks/useCategorias";
import { stockAmigable } from "../utils/stock";
import { exportarExcel } from "../utils/exportExcel";
import "../styles/Compras.css";

const fmt = (v) => `S/ ${Number(v || 0).toFixed(2)}`;
const fmtNum = (v, dec = 2) => (Number(v || 0) % 1 === 0 ? String(Number(v || 0)) : Number(v || 0).toFixed(dec));

const CAT_COLOR_DEFAULT = "#64748b";

/** Partes de equivalencia de empaque a partir de unidades_por_caja / unidades_por_blister. */
function equivalenciaPartes(producto) {
  const partes = [];
  if (producto.unidades_por_caja > 0) partes.push(`1 Caja = ${producto.unidades_por_caja} Unidades`);
  if (producto.unidades_por_blister > 0) partes.push(`1 Blíster = ${producto.unidades_por_blister} Unidades`);
  return partes;
}

/** Texto de equivalencia de empaque a partir de unidades_por_caja / unidades_por_blister. */
function equivalenciaLabel(producto) {
  const partes = equivalenciaPartes(producto);
  return partes.length > 0 ? partes.join(" · ") : null;
}

// ─── Modal de precios editables por presentación ───────────────────────────────
function ModalPrecios({ producto, onGuardar, onCerrar }) {
  const presentaciones = Object.keys(producto.precios_presentacion || {}).length > 0
    ? Object.keys(producto.precios_presentacion)
    : ["Unidad"];

  const costoBase = Number(producto.ultimo_costo || 0);
  const [precios, setPrecios] = useState(() => {
    const pp = producto.precios_presentacion || {};
    const init = {};
    presentaciones.forEach((p) => { init[p] = Number(pp[p] || 0); });
    return init;
  });
  const [guardando, setGuardando] = useState(false);

  const handleGuardar = async () => {
    setGuardando(true);
    try { await onGuardar(precios); } finally { setGuardando(false); }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    handleGuardar();
  };

  const ganancia = (precio, costo) => {
    if (!costo || !precio) return null;
    return (((precio - costo) / costo) * 100).toFixed(1);
  };

  const costoEstimado = (pres) => {
    if (pres === "Caja" && producto.unidades_por_caja > 0) return costoBase * producto.unidades_por_caja;
    if (pres === "Blíster" && producto.unidades_por_blister > 0) return costoBase * producto.unidades_por_blister;
    return costoBase;
  };

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onCerrar()}>
      <div className="modal-box" style={{ maxWidth: "560px" }}>
        <div className="modal-header">
          <h2>💰 Precios por presentación</h2>
          <button type="button" className="btn-cerrar" onClick={onCerrar}>✕</button>
        </div>
        <div style={{ marginBottom: "12px", fontSize: "0.85rem", color: "#475569" }}>
          <strong>{producto.nombre}</strong> · Costo base: <strong>{fmt(costoBase)}/Unidad</strong>
        </div>
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          {presentaciones.map((pres) => {
            const costoEst = costoEstimado(pres);
            const g = ganancia(precios[pres], costoEst);
            return (
              <div key={pres} style={{
                display: "flex", alignItems: "center", gap: "12px",
                background: "#f8fafc", borderRadius: "10px", padding: "10px 14px",
                border: "1px solid #e2e8f0",
              }}>
                <div style={{ flex: "0 0 110px" }}>
                  <div style={{ fontWeight: 700, fontSize: "0.92rem" }}>{pres}</div>
                  <div style={{ fontSize: "0.72rem", color: "#64748b" }}>Costo est: {fmt(costoEst)}</div>
                </div>
                <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "3px" }}>
                  <label style={{ fontSize: "0.72rem", color: "#64748b" }}>Precio de venta (S/)</label>
                  <input type="number" min="0" step="0.01"
                    value={precios[pres] || ""}
                    onChange={(e) => setPrecios((prev) => ({ ...prev, [pres]: Number(e.target.value) }))}
                    style={{ padding: "6px 10px", borderRadius: "8px", border: "2px solid #fca5a5",
                      background: "#fef2f2", fontWeight: 700, color: "#b91c1c", fontSize: "1.05rem", width: "100%" }}
                  />
                </div>
                {g !== null && (
                  <div style={{
                    fontSize: "0.8rem", fontWeight: 700,
                    color: Number(g) >= 10 ? "#16a34a" : Number(g) >= 0 ? "#d97706" : "#dc2626",
                    background: Number(g) >= 10 ? "#f0fdf4" : Number(g) >= 0 ? "#fefce8" : "#fef2f2",
                    borderRadius: "8px", padding: "4px 8px", whiteSpace: "nowrap",
                  }}>
                    {g}%
                  </div>
                )}
              </div>
            );
          })}
          <div className="modal-acciones" style={{ marginTop: "16px" }}>
            <button type="submit" className="btn-nuevo" disabled={guardando}>
              {guardando ? "Guardando..." : "💾 Guardar precios"}
            </button>
            <button type="button" className="btn-cancelar"
              style={{ background: "#f1f5f9", border: "none", borderRadius: "10px", padding: "10px 18px", cursor: "pointer" }}
              onClick={onCerrar}>Cancelar</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Tarjeta de producto ───────────────────────────────────────────────────────
function TarjetaProducto({ producto, onEditar, onEliminar, onEditarPrecios }) {
  const presentaciones = Object.keys(producto.precios_presentacion || {}).filter((k) => Number(producto.precios_presentacion[k]) > 0);
  const pp = producto.precios_presentacion || {};
  const color = producto.categoria?.color || CAT_COLOR_DEFAULT;
  const stock = Number(producto.stock_actual || 0);
  const stockBajo = stock <= Number(producto.stock_minimo || 0);
  const costoBase = Number(producto.ultimo_costo || 0);
  const equivLabel = equivalenciaLabel(producto);

  return (
    <div style={{
      background: "#fff", borderRadius: "16px", border: "1px solid #e2e8f0",
      overflow: "hidden", transition: "box-shadow 0.2s",
      boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
    }}
      onMouseEnter={(e) => e.currentTarget.style.boxShadow = "0 4px 16px rgba(0,0,0,0.12)"}
      onMouseLeave={(e) => e.currentTarget.style.boxShadow = "0 1px 4px rgba(0,0,0,0.06)"}
    >
      {/* Header de color con categoría */}
      <div style={{ background: `linear-gradient(135deg, ${color}22, ${color}11)`, borderBottom: `3px solid ${color}`, padding: "14px 16px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: "0.97rem", color: "#1e293b", marginBottom: "2px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {producto.nombre}
            </div>
            {producto.marca && <div style={{ fontSize: "0.75rem", color: "#64748b" }}>{producto.marca}</div>}
          </div>
          {producto.categoria && (
            <span style={{ background: `${color}22`, color, border: `1px solid ${color}44`, borderRadius: "20px", padding: "2px 8px", fontSize: "0.7rem", fontWeight: 700, whiteSpace: "nowrap", marginLeft: "8px" }}>
              {producto.categoria.icono} {producto.categoria.nombre}
            </span>
          )}
        </div>
        {producto.laboratorio && (
          <div style={{ fontSize: "0.72rem", color: "#64748b", marginTop: "4px" }}>🏢 {producto.laboratorio}</div>
        )}
      </div>

      {/* Body */}
      <div style={{ padding: "14px 16px" }}>
        {/* Equivalencia */}
        {equivLabel && (
          <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: "8px", padding: "6px 10px", fontSize: "0.75rem", color: "#991b1b", marginBottom: "10px", fontWeight: 600 }}>
            📐 {equivLabel}
          </div>
        )}

        {/* Stock */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
          <span style={{ fontSize: "0.78rem", color: "#64748b" }}>Stock</span>
          <span style={{
            fontWeight: 700, fontSize: "0.88rem",
            color: stockBajo ? "#dc2626" : "#16a34a",
            background: stockBajo ? "#fef2f2" : "#f0fdf4",
            borderRadius: "20px", padding: "3px 10px",
          }}>
            {stockBajo ? "⚠️ " : "✓ "}{stockAmigable(producto, stock)}
          </span>
        </div>

        {/* Costo base */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px", padding: "6px 0", borderTop: "1px solid #f1f5f9", borderBottom: "1px solid #f1f5f9" }}>
          <span style={{ fontSize: "0.78rem", color: "#64748b" }}>Costo/Unidad</span>
          <span style={{ fontWeight: 700, fontSize: "0.88rem", color: "#475569" }}>{fmt(costoBase)}</span>
        </div>

        {/* Precios por presentación */}
        {presentaciones.length > 0 ? (
          <div>
            <div style={{ fontSize: "0.72rem", fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "6px" }}>Precios de venta</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "5px" }}>
              {presentaciones.map((pres) => {
                const precio = Number(pp[pres] || 0);
                const g = precio > 0 && costoBase > 0 ? ((precio - costoBase) / costoBase * 100).toFixed(0) : null;
                return (
                  <div key={pres} style={{
                    flex: "1 1 auto", minWidth: "80px",
                    background: "#f8fafc", borderRadius: "8px", padding: "6px 8px",
                    border: "1px solid #e2e8f0", textAlign: "center",
                  }}>
                    <div style={{ fontSize: "0.68rem", color: "#94a3b8", marginBottom: "2px" }}>{pres}</div>
                    <div style={{ fontWeight: 700, fontSize: "0.9rem", color: "#dc2626" }}>
                      {precio > 0 ? fmt(precio) : <span style={{ color: "#cbd5e1" }}>—</span>}
                    </div>
                    {g !== null && (
                      <div style={{ fontSize: "0.65rem", color: Number(g) >= 10 ? "#16a34a" : "#d97706", fontWeight: 600 }}>+{g}%</div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div style={{ fontSize: "0.8rem", color: "#94a3b8", textAlign: "center", padding: "8px 0" }}>
            Sin presentaciones configuradas
          </div>
        )}
      </div>

      {/* Acciones */}
      <div style={{ display: "flex", gap: "6px", padding: "10px 16px", borderTop: "1px solid #f1f5f9", background: "#fafafa" }}>
        <button type="button" onClick={() => onEditarPrecios(producto)}
          style={{ flex: 1, background: "#f0fdf4", color: "#16a34a", border: "1px solid #bbf7d0", borderRadius: "8px", padding: "6px 0", cursor: "pointer", fontSize: "0.8rem", fontWeight: 600 }}>
          💰 Precios
        </button>
        <button type="button" onClick={() => onEditar(producto)}
          style={{ flex: 1, background: "#fef2f2", color: "#dc2626", border: "1px solid #fca5a5", borderRadius: "8px", padding: "6px 0", cursor: "pointer", fontSize: "0.8rem", fontWeight: 600 }}>
          ✏️ Editar
        </button>
        <button type="button" onClick={() => onEliminar(producto.id)}
          style={{ background: "#fef2f2", color: "#ef4444", border: "1px solid #fecaca", borderRadius: "8px", padding: "6px 10px", cursor: "pointer", fontSize: "0.8rem" }}>
          🗑️
        </button>
      </div>
    </div>
  );
}

// ─── Componente principal ──────────────────────────────────────────────────────
function Medicamentos() {
  const categorias = useCategorias();
  const [productos, setProductos] = useState([]);
  const [editandoId, setEditandoId] = useState(null);
  const [mostrarFormulario, setMostrarFormulario] = useState(false);
  const [productoEditandoObj, setProductoEditandoObj] = useState(null);
  const [productoPrecios, setProductoPrecios] = useState(null);
  const [busqueda, setBusqueda] = useState("");
  const [filtroCategoria, setFiltroCategoria] = useState("");
  const [vistaTabla, setVistaTabla] = useState(true);
  const [mensaje, setMensaje] = useState("");

  useEffect(() => { cargarProductos(); }, []);

  const cargarProductos = useCallback(async (query = "") => {
    try { setProductos(await getProductos(query)); }
    catch (e) { setMensaje(e.message); }
  }, []);

  const limpiarFormulario = () => {
    setEditandoId(null);
    setProductoEditandoObj(null);
    setMostrarFormulario(false);
    setMensaje("");
  };

  const editarProducto = (prod) => {
    setEditandoId(prod.id);
    setProductoEditandoObj(prod);
    setMostrarFormulario(true);
  };

  const handleGuardarProducto = async (payload) => {
    if (editandoId !== null) {
      await actualizarProducto(editandoId, payload);
      setMensaje("Producto actualizado.");
    } else {
      await crearProducto(payload);
      setMensaje("Producto creado.");
    }
    limpiarFormulario();
    cargarProductos(busqueda);
  };

  const handleGuardarPrecios = async (precios) => {
    await actualizarPreciosPresentacion(productoPrecios.id, precios);
    setProductoPrecios(null);
    setMensaje("Precios actualizados.");
    cargarProductos(busqueda);
  };

  const exportarProductosExcel = () => {
    const enc = ["Nombre", "Categoría", "Laboratorio", "Stock", "Último costo", "Precio venta"];
    const filas = productosFiltrados.map((p) => [
      p.nombre, p.categoria?.nombre || "", p.laboratorio || "",
      p.stock_actual ?? 0, Number(p.ultimo_costo || 0), Number(p.precios_presentacion?.Unidad || 0),
    ]);
    exportarExcel("productos", enc, filas, "Productos");
  };

  const productosFiltrados = productos.filter((p) => {
    const matchB = !busqueda ||
      p.nombre?.toLowerCase().includes(busqueda.toLowerCase()) ||
      (p.laboratorio || "").toLowerCase().includes(busqueda.toLowerCase()) ||
      (p.marca || "").toLowerCase().includes(busqueda.toLowerCase());
    const matchC = !filtroCategoria || String(p.categoria_id) === String(filtroCategoria);
    return matchB && matchC;
  });

  // Stats
  const totalStock = productos.reduce((a, p) => a + Number(p.stock_actual || 0), 0);
  const stockBajoCount = productos.filter((p) => Number(p.stock_actual || 0) <= Number(p.stock_minimo || 0)).length;
  const sinPrecios = productos.filter((p) => !p.precios_presentacion || Object.keys(p.precios_presentacion).length === 0).length;

  return (
    <div>
      {/* Formulario modal */}
      {mostrarFormulario && (
        <FormularioProducto
          productoEditando={editandoId !== null ? { ...productoEditandoObj, id: editandoId } : null}
          categorias={categorias}
          onGuardar={handleGuardarProducto}
          onCancelar={limpiarFormulario}
        />
      )}

      {/* Modal precios */}
      {productoPrecios && (
        <ModalPrecios
          producto={productoPrecios}
          onGuardar={handleGuardarPrecios}
          onCerrar={() => setProductoPrecios(null)}
        />
      )}

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "20px", flexWrap: "wrap", gap: "10px" }}>
        <div>
          <h1 style={{ margin: 0, fontSize: "1.5rem" }}>📦 Productos</h1>
        </div>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          <button type="button" className="btn-export" onClick={exportarProductosExcel}>⬇ Excel</button>
          <button type="button" onClick={() => setVistaTabla((v) => !v)}
            style={{ background: "#f1f5f9", border: "1px solid #e2e8f0", borderRadius: "8px", padding: "8px 14px", cursor: "pointer", fontSize: "0.85rem" }}>
            {vistaTabla ? "⊞ Tarjetas" : "☰ Tabla"}
          </button>
          <button type="button" className="btn-nuevo" onClick={() => { limpiarFormulario(); setMostrarFormulario(true); }}>
            + Nuevo producto
          </button>
        </div>
      </div>

      {/* KPI cards */}
      <div className="cards" style={{ marginBottom: "20px" }}>
        <div className="info-card"><h2>{productos.length}</h2><h3>Total productos</h3></div>
        <div className="info-card" style={{ background: stockBajoCount > 0 ? "#fef2f2" : "" }}>
          <h2 style={{ color: stockBajoCount > 0 ? "#dc2626" : "" }}>{stockBajoCount}</h2>
          <h3>Stock bajo</h3>
        </div>
        <div className="info-card"><h2>{fmtNum(totalStock, 1)}</h2><h3>Total en stock</h3></div>
        <div className="info-card" style={{ background: sinPrecios > 0 ? "#fefce8" : "" }}>
          <h2 style={{ color: sinPrecios > 0 ? "#d97706" : "" }}>{sinPrecios}</h2>
          <h3>Sin precios</h3>
        </div>
      </div>

      {/* Filtros */}
      <div className="header-filtros" style={{ marginBottom: "16px" }}>
        <input className="input-busqueda" value={busqueda}
          onChange={(e) => { setBusqueda(e.target.value); cargarProductos(e.target.value); }}
          placeholder="🔍 Buscar por nombre, laboratorio o marca" style={{ flex: 1 }} />
        <div className="filtros-grupo">
          <label>Categoría</label>
          <select value={filtroCategoria} onChange={(e) => setFiltroCategoria(e.target.value)}>
            <option value="">Todas</option>
            {categorias.map((c) => (
              <option key={c.id} value={c.id}>{c.icono} {c.nombre}</option>
            ))}
          </select>
        </div>
      </div>

      {mensaje && <p className="mensaje" style={{ marginBottom: "12px" }}>{mensaje}</p>}

      {/* Vista tarjetas */}
      {!vistaTabla && (
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
          gap: "16px",
        }}>
          {productosFiltrados.length === 0 ? (
            <div style={{ gridColumn: "1/-1", textAlign: "center", color: "#94a3b8", padding: "48px" }}>
              No hay productos. Crea uno con "+ Nuevo producto"
            </div>
          ) : productosFiltrados.map((p) => (
            <TarjetaProducto
              key={p.id}
              producto={p}
              onEditar={editarProducto}
              onEliminar={(id) => {
                if (!window.confirm("¿Eliminar este producto?")) return;
                eliminarProducto(id).then(() => { cargarProductos(busqueda); setMensaje("Eliminado."); }).catch((e) => setMensaje(e.message));
              }}
              onEditarPrecios={setProductoPrecios}
            />
          ))}
        </div>
      )}

      {/* Vista tabla */}
      {vistaTabla && (
        <div className="tabla-wrapper">
          <table className="tabla">
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Categoría</th>
                <th>Equivalencia</th>
                <th>Último costo</th>
                <th>Stock</th>
                <th>Presentaciones y precios</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {productosFiltrados.length === 0 ? (
                <tr><td colSpan="7" style={{ textAlign: "center", color: "#94a3b8", padding: "24px" }}>Sin productos</td></tr>
              ) : productosFiltrados.map((p) => {
                const presentaciones = Object.keys(p.precios_presentacion || {}).filter((k) => Number(p.precios_presentacion[k]) > 0);
                const equivPartes = equivalenciaPartes(p);
                const stock = Number(p.stock_actual || 0);
                const stockBajo = stock <= Number(p.stock_minimo || 0);
                const color = p.categoria?.color || CAT_COLOR_DEFAULT;
                return (
                  <tr key={p.id}>
                    <td style={{ fontWeight: 600 }}>{p.nombre}</td>
                    <td>
                      {p.categoria ? (
                        <span style={{ background: `${color}22`, color, borderRadius: "20px", padding: "2px 8px", fontSize: "0.75rem", fontWeight: 700 }}>
                          {p.categoria.icono} {p.categoria.nombre}
                        </span>
                      ) : "—"}
                    </td>
                    <td style={{ fontSize: "0.8rem", color: "#475569", whiteSpace: "normal", maxWidth: "160px" }}>
                      {equivPartes.length > 0
                        ? equivPartes.map((parte, i) => <div key={i}>{parte}</div>)
                        : "—"}
                    </td>
                    <td style={{ fontWeight: 600 }}>{fmt(p.ultimo_costo)}<br /><span style={{ fontSize: "0.68rem", color: "#94a3b8" }}>/Unidad</span></td>
                    <td>
                      <span style={{ color: stockBajo ? "#dc2626" : "#16a34a", fontWeight: 600, fontSize: "0.82rem" }}>
                        {stockBajo ? "⚠️ " : ""}{stockAmigable(p, stock)}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
                        {presentaciones.map((pres) => (
                          <span key={pres} style={{ background: "#fef2f2", color: "#dc2626", borderRadius: "6px", padding: "2px 6px", fontSize: "0.72rem", fontWeight: 600 }}>
                            {pres}: {fmt(p.precios_presentacion?.[pres] || 0)}
                          </span>
                        ))}
                        {presentaciones.length === 0 && <span style={{ color: "#94a3b8", fontSize: "0.78rem" }}>Sin precios</span>}
                      </div>
                    </td>
                    <td>
                      <div style={{ display: "flex", gap: "4px" }}>
                        <button type="button" title="Editar precios"
                          style={{ background: "#f0fdf4", color: "#16a34a", border: "1px solid #bbf7d0", borderRadius: "6px", padding: "5px 8px", cursor: "pointer", fontSize: "0.8rem" }}
                          onClick={() => setProductoPrecios(p)}>💰</button>
                        <button type="button" title="Editar producto"
                          style={{ background: "#fef2f2", color: "#dc2626", border: "1px solid #fca5a5", borderRadius: "6px", padding: "5px 8px", cursor: "pointer", fontSize: "0.8rem" }}
                          onClick={() => editarProducto(p)}>✏️</button>
                        <button type="button" title="Eliminar"
                          style={{ background: "#fef2f2", color: "#ef4444", border: "1px solid #fecaca", borderRadius: "6px", padding: "5px 8px", cursor: "pointer", fontSize: "0.8rem" }}
                          onClick={() => { if (!window.confirm("¿Eliminar?")) return; eliminarProducto(p.id).then(() => { cargarProductos(busqueda); }).catch((e) => setMensaje(e.message)); }}>🗑️</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default Medicamentos;
