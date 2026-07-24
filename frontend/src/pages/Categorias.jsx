import { useEffect, useState, useMemo } from "react";
import { getCategorias, crearCategoria, actualizarCategoria, eliminarCategoria, getProductos } from "../services/api";

const ICONOS = ["🧹","🧼","🫧","🧺","🪣","🌾","🫘","🌽","🍚","🧈","🥚","🐔","🥩","🐟","🍫","🍬","🧃","🥤","🛒","📦","🏠","🌿","🍋","🧂","🫙","🥫","🍶","🫒","🥜","🌰","🍞","🧁","🍭","🧴","🪥","🧻","🧽","💧","🔋","💡"];
const COLORES_PRESET = ["#0f6df2","#10b981","#f59e0b","#ef4444","#8b5cf6","#06b6d4","#ec4899","#f97316","#84cc16","#6366f1"];
const estadoInicial = { nombre: "", descripcion: "", icono: "📦", color: "#0f6df2" };
const fmt = (v) => `S/ ${Number(v || 0).toFixed(2)}`;

export default function Categorias() {
  const [categorias, setCategorias] = useState([]);
  const [productos, setProductos] = useState([]);
  const [form, setForm] = useState({ ...estadoInicial });
  const [editandoId, setEditandoId] = useState(null);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const [categoriaActiva, setCategoriaActiva] = useState(null); // categoría seleccionada
  const [busquedaProducto, setBusquedaProducto] = useState("");
  const [mensaje, setMensaje] = useState("");

  useEffect(() => {
    cargar();
    getProductos().then(setProductos).catch(() => {});
  }, []);

  const cargar = async () => {
    try { setCategorias(await getCategorias()); }
    catch (e) { setMensaje(e.message); }
  };

  const limpiar = () => {
    setForm({ ...estadoInicial }); setEditandoId(null);
    setMostrarForm(false); setMensaje("");
  };

  const guardar = async () => {
    if (!form.nombre.trim()) { setMensaje("El nombre es obligatorio."); return; }
    try {
      if (editandoId !== null) { await actualizarCategoria(editandoId, form); setMensaje("Categoría actualizada."); }
      else { await crearCategoria(form); setMensaje("Categoría creada."); }
      limpiar(); cargar();
    } catch (e) { setMensaje(e.message); }
  };

  const editar = (cat) => {
    setEditandoId(cat.id);
    setForm({ nombre: cat.nombre, descripcion: cat.descripcion || "", icono: cat.icono || "📦", color: cat.color || "#0f6df2" });
    setMostrarForm(true);
  };

  const eliminar = async (id) => {
    if (!window.confirm("¿Eliminar esta categoría?")) return;
    try { await eliminarCategoria(id); setMensaje("Categoría eliminada."); cargar(); if (categoriaActiva?.id === id) setCategoriaActiva(null); }
    catch (e) { setMensaje(e.message); }
  };

  // Categorías filtradas por búsqueda
  const filtradas = categorias.filter((c) =>
    !busqueda || c.nombre.toLowerCase().includes(busqueda.toLowerCase())
  );

  // Productos de la categoría activa filtrados por búsqueda de producto
  const productosCat = useMemo(() => {
    if (!categoriaActiva) return [];
    return productos.filter((p) => {
      const matchCat = (p.categoria || "").toLowerCase() === categoriaActiva.nombre.toLowerCase();
      const matchBusq = !busquedaProducto ||
        p.nombre?.toLowerCase().includes(busquedaProducto.toLowerCase()) ||
        p.codigo?.toLowerCase().includes(busquedaProducto.toLowerCase()) ||
        (p.proveedor || p.laboratorio || "")?.toLowerCase().includes(busquedaProducto.toLowerCase());
      return matchCat && matchBusq;
    });
  }, [categoriaActiva, productos, busquedaProducto]);

  // Enriquecer categorías con conteo real desde productos cargados
  const categoriasConConteo = useMemo(() =>
    filtradas.map((c) => ({
      ...c,
      total_productos: productos.filter((p) =>
        (p.categoria || "").toLowerCase() === c.nombre.toLowerCase()
      ).length,
    }))
  , [filtradas, productos]);

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
        <h1>🏷️ Categorías</h1>
        <button type="button" className="btn-nuevo" onClick={() => { limpiar(); setMostrarForm(true); }}>
          + Nueva categoría
        </button>
      </div>

      <div className="header-filtros" style={{ marginBottom: "18px" }}>
        <input className="input-busqueda" value={busqueda}
          onChange={(e) => { setBusqueda(e.target.value); setCategoriaActiva(null); }}
          placeholder="🔍 Buscar categoría" />
      </div>

      {mensaje && <p className="mensaje">{mensaje}</p>}

      {/* Modal formulario */}
      {mostrarForm && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && limpiar()}>
          <div className="modal-box" style={{ maxWidth: "520px" }}>
            <div className="modal-header">
              <h2>{editandoId !== null ? "✏️ Editar categoría" : "➕ Nueva categoría"}</h2>
              <button type="button" className="btn-cerrar" onClick={limpiar}>✕</button>
            </div>
            <div className="formulario-grid" style={{ gridTemplateColumns: "1fr" }}>
              <div className="campo">
                <label>Nombre *</label>
                <input value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} placeholder="Ej: Limpieza, Jabones, Menestras..." />
              </div>
              <div className="campo">
                <label>Descripción</label>
                <input value={form.descripcion} onChange={(e) => setForm({ ...form, descripcion: e.target.value })} placeholder="Descripción opcional" />
              </div>
              <div className="campo">
                <label>Ícono</label>
                <div className="iconos-grid">
                  {ICONOS.map((ic) => (
                    <button key={ic} type="button"
                      className={`icono-btn ${form.icono === ic ? "icono-activo" : ""}`}
                      onClick={() => setForm({ ...form, icono: ic })}>{ic}</button>
                  ))}
                </div>
              </div>
              <div className="campo">
                <label>Color</label>
                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
                  {COLORES_PRESET.map((c) => (
                    <button key={c} type="button"
                      style={{ width: "28px", height: "28px", borderRadius: "50%", background: c, border: form.color === c ? "3px solid #0f172a" : "2px solid transparent", cursor: "pointer" }}
                      onClick={() => setForm({ ...form, color: c })} />
                  ))}
                  <input type="color" value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })}
                    style={{ width: "36px", height: "36px", borderRadius: "50%", border: "none", cursor: "pointer", padding: 0 }} />
                </div>
              </div>
              <div className="campo">
                <label>Vista previa</label>
                <div className="cat-card-preview" style={{ borderLeft: `4px solid ${form.color}` }}>
                  <span className="cat-icono" style={{ background: form.color + "22", color: form.color }}>{form.icono}</span>
                  <div>
                    <div className="cat-nombre">{form.nombre || "Nombre de categoría"}</div>
                    {form.descripcion && <div className="cat-desc">{form.descripcion}</div>}
                  </div>
                </div>
              </div>
              {mensaje && <p className="mensaje">{mensaje}</p>}
              <div className="modal-acciones">
                <button type="button" className="btn-nuevo" onClick={guardar}>{editandoId !== null ? "✏️ Actualizar" : "💾 Guardar"}</button>
                <button type="button" className="btn-cancelar" style={{ background: "#f1f5f9", border: "none", borderRadius: "10px", padding: "10px 18px", cursor: "pointer" }} onClick={limpiar}>Cancelar</button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="cat-layout">
        {/* Panel izquierdo: lista de categorías */}
        <div className="cat-lista-panel">
          {categoriasConConteo.length === 0 ? (
            <div style={{ textAlign: "center", padding: "32px", color: "#94a3b8" }}>
              <div style={{ fontSize: "2.5rem" }}>🏷️</div>
              <p style={{ marginTop: "8px" }}>No hay categorías aún</p>
            </div>
          ) : categoriasConConteo.map((cat) => (
            <div
              key={cat.id}
              className={`cat-lista-item ${categoriaActiva?.id === cat.id ? "cat-lista-activa" : ""}`}
              style={{ borderLeft: `4px solid ${cat.color || "#0f6df2"}` }}
              onClick={() => { setCategoriaActiva(cat); setBusquedaProducto(""); }}
            >
              <span className="cat-icono-sm" style={{ background: (cat.color || "#0f6df2") + "22", color: cat.color || "#0f6df2" }}>
                {cat.icono || "📦"}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="cat-nombre" style={{ fontSize: "0.9rem" }}>{cat.nombre}</div>
                <div className="cat-meta">{cat.total_productos} producto{cat.total_productos !== 1 ? "s" : ""}</div>
              </div>
              <div style={{ display: "flex", gap: "4px" }}>
                <button type="button" className="cat-btn-sm" onClick={(e) => { e.stopPropagation(); editar(cat); }} title="Editar">✏️</button>
                <button type="button" className="cat-btn-sm cat-btn-danger" onClick={(e) => { e.stopPropagation(); eliminar(cat.id); }} title="Eliminar">🗑️</button>
              </div>
            </div>
          ))}
        </div>

        {/* Panel derecho: productos de la categoría */}
        <div className="cat-productos-panel">
          {!categoriaActiva ? (
            <div className="cat-placeholder">
              <div style={{ fontSize: "3rem" }}>👈</div>
              <p>Selecciona una categoría para ver sus productos</p>
            </div>
          ) : (
            <>
              <div className="cat-productos-header">
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <span style={{ fontSize: "1.6rem" }}>{categoriaActiva.icono}</span>
                  <div>
                    <h2 style={{ margin: 0, color: "#0f172a" }}>{categoriaActiva.nombre}</h2>
                    {categoriaActiva.descripcion && <p style={{ margin: 0, color: "#64748b", fontSize: "0.82rem" }}>{categoriaActiva.descripcion}</p>}
                  </div>
                </div>
                <span className="cat-productos-badge" style={{ background: (categoriaActiva.color || "#0f6df2") + "22", color: categoriaActiva.color || "#0f6df2" }}>
                  {productosCat.length} producto{productosCat.length !== 1 ? "s" : ""}
                </span>
              </div>

              <input
                className="input-busqueda"
                value={busquedaProducto}
                onChange={(e) => setBusquedaProducto(e.target.value)}
                placeholder={`🔍 Buscar en ${categoriaActiva.nombre}...`}
                style={{ marginBottom: "12px" }}
              />

              {productosCat.length === 0 ? (
                <div className="cat-placeholder" style={{ padding: "32px" }}>
                  <div style={{ fontSize: "2rem" }}>📭</div>
                  <p>No hay productos en esta categoría{busquedaProducto ? ` con "${busquedaProducto}"` : ""}</p>
                </div>
              ) : (
                <div className="tabla-wrapper">
                  <table className="tabla">
                    <thead>
                      <tr>
                        <th>Código</th>
                        <th>Nombre / Marca</th>
                        <th>Proveedor</th>
                        <th>Stock</th>
                        <th>Unidad</th>
                        <th>Precio venta</th>
                        <th>Costo</th>
                        <th>Vencimiento</th>
                      </tr>
                    </thead>
                    <tbody>
                      {productosCat.map((p) => {
                        const venc = p.fecha_vencimiento ? new Date(p.fecha_vencimiento) : null;
                        const hoy = new Date();
                        const diasVenc = venc ? Math.ceil((venc - hoy) / 86400000) : null;
                        const alertaVenc = diasVenc !== null && diasVenc <= 30;

                        return (
                          <tr key={p.id}>
                            <td style={{ fontFamily: "monospace", fontSize: "0.82rem" }}>{p.codigo}</td>
                            <td>
                              <div style={{ fontWeight: 600, color: "#0f172a" }}>{p.nombre}</div>
                              {(p.proveedor || p.laboratorio) && (
                                <div style={{ fontSize: "0.75rem", color: "#64748b" }}>{p.proveedor || p.laboratorio}</div>
                              )}
                            </td>
                            <td style={{ fontSize: "0.83rem", color: "#475569" }}>{p.proveedor || p.laboratorio || "—"}</td>
                            <td>
                              <span style={{
                                fontWeight: 700,
                                color: Number(p.stock_actual) <= Number(p.stock_minimo) ? "#dc2626" : "#16a34a"
                              }}>
                                {p.stock_actual ?? 0}
                              </span>
                            </td>
                            <td><span className="tag-presentacion">{p.unidad_base || "unidad"}</span></td>
                            <td style={{ fontWeight: 700, color: "#0f6df2" }}>{fmt(p.precio_venta)}</td>
                            <td style={{ color: "#64748b" }}>{fmt(p.costo)}</td>
                            <td>
                              {venc ? (
                                <span style={{
                                  fontSize: "0.8rem", fontWeight: 600,
                                  color: diasVenc < 0 ? "#dc2626" : alertaVenc ? "#d97706" : "#16a34a"
                                }}>
                                  {diasVenc < 0 ? "⚠️ Vencido" : alertaVenc ? `⚠️ ${diasVenc}d` : venc.toLocaleDateString()}
                                </span>
                              ) : <span style={{ color: "#94a3b8", fontSize: "0.8rem" }}>Sin fecha</span>}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
