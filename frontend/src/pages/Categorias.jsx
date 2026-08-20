import { useEffect, useState, useMemo } from "react";
import { getCategorias, crearCategoria, actualizarCategoria, eliminarCategoria, getProductos } from "../services/api";

// Ícono/color ya no se piden en el formulario (el usuario solo escribe el
// nombre) — se asignan automáticamente ciclando estas paletas para que las
// insignias de categoría sigan viéndose distintas entre sí en Productos/Inventario.
const ICONOS = ["💊","🩹","🧴","🌡️","💉","🧬","🦠","🩺","🧪","📦","🧊","🌿","🍬","🧫","🩸","🧉","🧻","🧼","🫙","🥤"];
const COLORES_PRESET = ["#dc2626","#10b981","#f59e0b","#ef4444","#8b5cf6","#06b6d4","#ec4899","#f97316","#84cc16","#6366f1"];
const estadoInicial = { nombre: "" };
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
      if (editandoId !== null) {
        await actualizarCategoria(editandoId, { nombre: form.nombre });
        setMensaje("Categoría actualizada.");
      } else {
        // Ícono/color no se piden en el formulario: se asignan ciclando las
        // paletas según cuántas categorías existen ya, solo para que las
        // insignias sigan viéndose distintas entre sí.
        const indice = categorias.length;
        await crearCategoria({
          nombre: form.nombre,
          icono: ICONOS[indice % ICONOS.length],
          color: COLORES_PRESET[indice % COLORES_PRESET.length],
        });
        setMensaje("Categoría creada.");
      }
      limpiar(); cargar();
    } catch (e) { setMensaje(e.message); }
  };

  const editar = (cat) => {
    setEditandoId(cat.id);
    setForm({ nombre: cat.nombre });
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
      const matchCat = p.categoria_id === categoriaActiva.id;
      const matchBusq = !busquedaProducto ||
        p.nombre?.toLowerCase().includes(busquedaProducto.toLowerCase()) ||
        (p.marca || "").toLowerCase().includes(busquedaProducto.toLowerCase()) ||
        (p.laboratorio || "").toLowerCase().includes(busquedaProducto.toLowerCase());
      return matchCat && matchBusq;
    });
  }, [categoriaActiva, productos, busquedaProducto]);

  const categoriasConConteo = filtradas;

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
                <input value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} placeholder="Ej: Analgésicos, Antibióticos, Vitaminas..." autoFocus />
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
              style={{ borderLeft: `4px solid ${cat.color || "#dc2626"}` }}
              onClick={() => { setCategoriaActiva(cat); setBusquedaProducto(""); }}
            >
              <span className="cat-icono-sm" style={{ background: (cat.color || "#dc2626") + "22", color: cat.color || "#dc2626" }}>
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
                <span className="cat-productos-badge" style={{ background: (categoriaActiva.color || "#dc2626") + "22", color: categoriaActiva.color || "#dc2626" }}>
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
                        <th>Nombre / Marca</th>
                        <th>Laboratorio</th>
                        <th>Stock</th>
                        <th>Unidad</th>
                        <th>Precio venta</th>
                        <th>Último costo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {productosCat.map((p) => (
                        <tr key={p.id}>
                          <td>
                            <div style={{ fontWeight: 600, color: "#0f172a" }}>{p.nombre}</div>
                            {p.marca && (
                              <div style={{ fontSize: "0.75rem", color: "#64748b" }}>{p.marca}</div>
                            )}
                          </td>
                          <td style={{ fontSize: "0.83rem", color: "#475569" }}>{p.laboratorio || "—"}</td>
                          <td>
                            <span style={{
                              fontWeight: 700,
                              color: Number(p.stock_actual) <= Number(p.stock_minimo) ? "#dc2626" : "#16a34a"
                            }}>
                              {p.stock_actual ?? 0}
                            </span>
                          </td>
                          <td><span className="tag-presentacion">{p.unidad_base || "unidad"}</span></td>
                          <td style={{ fontWeight: 700, color: "#dc2626" }}>{fmt(p.precios_presentacion?.Unidad)}</td>
                          <td style={{ color: "#64748b" }}>{fmt(p.ultimo_costo)}</td>
                        </tr>
                      ))}
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
