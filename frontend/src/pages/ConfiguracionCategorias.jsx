/**
 * ConfiguracionCategorias.jsx
 *
 * Pantalla para gestionar la configuración de unidades por categoría.
 * Permite al administrador definir:
 * - Qué unidades se usan para COMPRAR cada categoría
 * - Qué unidades se usan para VENDER cada categoría
 * - Los factores de conversión entre ellas
 */
import { useState, useEffect } from "react";
import { getCategoriasConfig, crearCategoriaConfig, actualizarCategoriaConfig, eliminarCategoriaConfig, getCategorias } from "../services/api";

const ETIQUETAS = {
  kilo: "Kilo", saco: "Saco", medio_saco: "½ Saco",
  caja: "Caja", unidad: "Unidad", paquete: "Paquete",
  maple: "Maple", bolsa: "Bolsa", litro: "Litro",
};

const UNIDADES_DISPONIBLES = [
  { value: "kilo",      label: "Kilo" },
  { value: "saco",      label: "Saco" },
  { value: "medio_saco",label: "½ Saco" },
  { value: "caja",      label: "Caja" },
  { value: "unidad",    label: "Unidad" },
  { value: "paquete",   label: "Paquete" },
  { value: "maple",     label: "Maple" },
  { value: "bolsa",     label: "Bolsa" },
  { value: "litro",     label: "Litro" },
];

const TIPOS_FLUJO = [
  { value: "caja_unidad", label: "Caja / Unidad" },
  { value: "saco_kilo",   label: "Saco / Kilo" },
  { value: "saco_unidad", label: "Saco / Bolsa" },
  { value: "multinivel",  label: "Multinivel" },
];

// Formulario de conversión para una unidad
function ConversionEditor({ unidad, conv, onChange }) {
  const tipo = conv?.tipo || "base_conteo";
  return (
    <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "8px", padding: "10px 12px", marginBottom: "8px" }}>
      <div style={{ fontWeight: 600, marginBottom: "6px", fontSize: "0.85rem" }}>{ETIQUETAS[unidad] || unidad}</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
        <div style={{ flex: "1 1 140px" }}>
          <label style={{ fontSize: "0.75rem", color: "#6b7280" }}>Tipo</label>
          <select
            value={tipo}
            onChange={(e) => onChange(unidad, "tipo", e.target.value)}
            style={{ width: "100%", padding: "4px 6px", borderRadius: "6px", border: "1px solid #d1d5db", fontSize: "0.82rem" }}
          >
            <option value="base_conteo">Base conteo (unidad)</option>
            <option value="base_peso">Base peso (kilo)</option>
            <option value="conteo">Conteo (N unidades)</option>
            <option value="peso">Peso (N kg)</option>
            <option value="fraccion">Fracción de otro</option>
            <option value="multinivel">Multinivel</option>
          </select>
        </div>
        {tipo === "peso" && (
          <div style={{ flex: "1 1 100px" }}>
            <label style={{ fontSize: "0.75rem", color: "#6b7280" }}>Kg</label>
            <input type="number" min="0.01" step="0.01"
              value={conv?.kg || ""}
              onChange={(e) => onChange(unidad, "kg", Number(e.target.value))}
              style={{ width: "100%", padding: "4px 6px", borderRadius: "6px", border: "1px solid #d1d5db", fontSize: "0.82rem" }}
            />
          </div>
        )}
        {tipo === "conteo" && (
          <div style={{ flex: "1 1 100px" }}>
            <label style={{ fontSize: "0.75rem", color: "#6b7280" }}>Unidades</label>
            <input type="number" min="1" step="1"
              value={conv?.unidades || ""}
              onChange={(e) => onChange(unidad, "unidades", Number(e.target.value))}
              style={{ width: "100%", padding: "4px 6px", borderRadius: "6px", border: "1px solid #d1d5db", fontSize: "0.82rem" }}
            />
          </div>
        )}
        {tipo === "fraccion" && (
          <>
            <div style={{ flex: "1 1 100px" }}>
              <label style={{ fontSize: "0.75rem", color: "#6b7280" }}>Base</label>
              <input type="text" value={conv?.base || ""} placeholder="ej: saco"
                onChange={(e) => onChange(unidad, "base", e.target.value)}
                style={{ width: "100%", padding: "4px 6px", borderRadius: "6px", border: "1px solid #d1d5db", fontSize: "0.82rem" }}
              />
            </div>
            <div style={{ flex: "1 1 80px" }}>
              <label style={{ fontSize: "0.75rem", color: "#6b7280" }}>Factor</label>
              <input type="number" min="0.01" step="0.01" value={conv?.factor || ""}
                onChange={(e) => onChange(unidad, "factor", Number(e.target.value))}
                style={{ width: "100%", padding: "4px 6px", borderRadius: "6px", border: "1px solid #d1d5db", fontSize: "0.82rem" }}
              />
            </div>
          </>
        )}
        {tipo === "multinivel" && (
          <>
            <div style={{ flex: "1 1 100px" }}>
              <label style={{ fontSize: "0.75rem", color: "#6b7280" }}>Nivel 2</label>
              <input type="text" value={conv?.nivel2 || ""} placeholder="maple"
                onChange={(e) => onChange(unidad, "nivel2", e.target.value)}
                style={{ width: "100%", padding: "4px 6px", borderRadius: "6px", border: "1px solid #d1d5db", fontSize: "0.82rem" }}
              />
            </div>
            <div style={{ flex: "1 1 80px" }}>
              <label style={{ fontSize: "0.75rem", color: "#6b7280" }}>Cant. nivel 2</label>
              <input type="number" min="1" value={conv?.nivel2_cantidad || ""}
                onChange={(e) => onChange(unidad, "nivel2_cantidad", Number(e.target.value))}
                style={{ width: "100%", padding: "4px 6px", borderRadius: "6px", border: "1px solid #d1d5db", fontSize: "0.82rem" }}
              />
            </div>
            <div style={{ flex: "1 1 80px" }}>
              <label style={{ fontSize: "0.75rem", color: "#6b7280" }}>Kg/empaque</label>
              <input type="number" min="0" step="0.01" value={conv?.kg_por_empaque || ""}
                onChange={(e) => onChange(unidad, "kg_por_empaque", Number(e.target.value))}
                style={{ width: "100%", padding: "4px 6px", borderRadius: "6px", border: "1px solid #d1d5db", fontSize: "0.82rem" }}
              />
            </div>
          </>
        )}
        <div style={{ flex: "2 1 180px" }}>
          <label style={{ fontSize: "0.75rem", color: "#6b7280" }}>Descripción</label>
          <input type="text" value={conv?.descripcion || ""} placeholder="ej: 1 Saco = 100 kg"
            onChange={(e) => onChange(unidad, "descripcion", e.target.value)}
            style={{ width: "100%", padding: "4px 6px", borderRadius: "6px", border: "1px solid #d1d5db", fontSize: "0.82rem" }}
          />
        </div>
      </div>
    </div>
  );
}

// Modal para crear/editar una categoría
function ModalCategoria({ cat, categoriasBase, onGuardar, onCancelar }) {
  const [form, setForm] = useState(cat ? { ...cat } : {
    nombre: "", descripcion: "", icono: "📦", color: "#0f6df2",
    unidades_compra: [], unidades_venta: [],
    conversiones: {}, tipo_flujo_default: "caja_unidad",
    empaque_mayor_default: "", unidad_menor_default: "",
    nivel2_nombre_default: "", margen_ganancia_default: 20,
  });
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");

  // Cuando el usuario selecciona una categoría base, autocompletar ícono y color
  const handleSelectCategoria = (nombre) => {
    const base = categoriasBase.find((c) => c.nombre === nombre);
    setForm((p) => ({
      ...p,
      nombre,
      icono: base?.icono || p.icono,
      color: base?.color || p.color,
      descripcion: base?.descripcion || p.descripcion,
    }));
  };

  const toggleUnidad = (campo, valor) => {
    setForm((p) => {
      const lista = p[campo] || [];
      const nueva = lista.includes(valor) ? lista.filter((u) => u !== valor) : [...lista, valor];
      // Asegurar que haya una entrada en conversiones para cada unidad seleccionada
      const nuevasConv = { ...p.conversiones };
      if (!lista.includes(valor)) {
        nuevasConv[valor] = nuevasConv[valor] || { tipo: "base_conteo" };
      }
      return { ...p, [campo]: nueva, conversiones: nuevasConv };
    });
  };

  const updateConversion = (unidad, campo, valor) => {
    setForm((p) => ({
      ...p,
      conversiones: {
        ...p.conversiones,
        [unidad]: { ...(p.conversiones[unidad] || {}), [campo]: valor },
      },
    }));
  };

  // Todas las unidades seleccionadas (compra + venta, deduplicadas)
  const todasUnidades = [...new Set([...(form.unidades_compra || []), ...(form.unidades_venta || [])])];

  const handleGuardar = async () => {
    const nombreFinal = form.nombre === "__nueva__" ? "" : form.nombre;
    if (!nombreFinal?.trim()) { setError("El nombre de la categoría es obligatorio."); return; }
    if (!form.unidades_compra?.length) { setError("Define al menos una unidad de compra."); return; }
    if (!form.unidades_venta?.length) { setError("Define al menos una unidad de venta."); return; }
    setGuardando(true);
    setError("");
    try {
      await onGuardar({ ...form, nombre: nombreFinal });
    } catch (e) {
      setError(e.message);
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onCancelar()}>
      <div className="modal-box" style={{ maxWidth: "780px", maxHeight: "90vh", overflowY: "auto" }}>
        <div className="modal-header">
          <h2>{cat ? "✏️ Editar categoría" : "➕ Nueva categoría"}</h2>
          <button type="button" className="btn-cerrar" onClick={onCancelar}>✕</button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {/* Info básica */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: "12px" }}>
            <div className="campo" style={{ flex: "2 1 200px", margin: 0 }}>
              <label>Categoría *</label>
              {cat ? (
                // Editando: mostrar el nombre como texto fijo + input por si acaso
                <input
                  value={form.nombre}
                  onChange={(e) => setForm((p) => ({ ...p, nombre: e.target.value }))}
                  placeholder="Nombre de la categoría"
                />
              ) : (
                // Creando: selector con las categorías existentes
                <select
                  value={form.nombre}
                  onChange={(e) => handleSelectCategoria(e.target.value)}
                  style={{ padding: "8px 10px", borderRadius: "8px", border: "1px solid #d1d5db", width: "100%", fontSize: "0.9rem" }}
                >
                  <option value="">— Seleccionar categoría —</option>
                  {categoriasBase.map((c) => (
                    <option key={c.id} value={c.nombre}>
                      {c.icono} {c.nombre}
                    </option>
                  ))}
                  <option value="__nueva__">+ Escribir nombre nuevo...</option>
                </select>
              )}
              {/* Si eligió escribir nuevo, mostrar input */}
              {!cat && form.nombre === "__nueva__" && (
                <input
                  autoFocus
                  placeholder="Escribe el nombre"
                  onChange={(e) => setForm((p) => ({ ...p, nombre: e.target.value }))}
                  style={{ marginTop: "6px", padding: "8px 10px", borderRadius: "8px", border: "1px solid #d1d5db", width: "100%", fontSize: "0.9rem" }}
                />
              )}
            </div>
            <div className="campo" style={{ flex: "1 1 80px", margin: 0 }}>
              <label>Ícono</label>
              <input value={form.icono} onChange={(e) => setForm((p) => ({ ...p, icono: e.target.value }))} style={{ fontSize: "1.5rem", textAlign: "center" }} />
            </div>
            <div className="campo" style={{ flex: "1 1 100px", margin: 0 }}>
              <label>Color</label>
              <input type="color" value={form.color} onChange={(e) => setForm((p) => ({ ...p, color: e.target.value }))} style={{ height: "36px", padding: "2px" }} />
            </div>
            <div className="campo" style={{ flex: "1 1 100px", margin: 0 }}>
              <label>% Margen</label>
              <input type="number" min="0" max="999" step="0.5" value={form.margen_ganancia_default}
                onChange={(e) => setForm((p) => ({ ...p, margen_ganancia_default: Number(e.target.value) }))} />
            </div>
          </div>

          {/* Unidades de COMPRA */}
          <div>
            <div style={{ fontWeight: 600, color: "#334155", marginBottom: "6px" }}>📥 Unidades de compra</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
              {UNIDADES_DISPONIBLES.map(({ value, label }) => (
                <button
                  key={value} type="button"
                  onClick={() => toggleUnidad("unidades_compra", value)}
                  style={{
                    padding: "5px 14px", borderRadius: "20px", cursor: "pointer",
                    border: (form.unidades_compra || []).includes(value) ? "2px solid #0f6df2" : "1px solid #cbd5e1",
                    background: (form.unidades_compra || []).includes(value) ? "#eff6ff" : "#fff",
                    fontWeight: (form.unidades_compra || []).includes(value) ? 700 : 400,
                    fontSize: "0.85rem",
                  }}
                >{label}</button>
              ))}
            </div>
          </div>

          {/* Unidades de VENTA */}
          <div>
            <div style={{ fontWeight: 600, color: "#334155", marginBottom: "6px" }}>📤 Unidades de venta</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
              {UNIDADES_DISPONIBLES.map(({ value, label }) => (
                <button
                  key={value} type="button"
                  onClick={() => toggleUnidad("unidades_venta", value)}
                  style={{
                    padding: "5px 14px", borderRadius: "20px", cursor: "pointer",
                    border: (form.unidades_venta || []).includes(value) ? "2px solid #10b981" : "1px solid #cbd5e1",
                    background: (form.unidades_venta || []).includes(value) ? "#f0fdf4" : "#fff",
                    fontWeight: (form.unidades_venta || []).includes(value) ? 700 : 400,
                    fontSize: "0.85rem",
                  }}
                >{label}</button>
              ))}
            </div>
          </div>

          {/* Conversiones */}
          {todasUnidades.length > 0 && (
            <div>
              <div style={{ fontWeight: 600, color: "#334155", marginBottom: "8px" }}>📐 Conversiones</div>
              {todasUnidades.map((u) => (
                <ConversionEditor
                  key={u}
                  unidad={u}
                  conv={form.conversiones?.[u]}
                  onChange={updateConversion}
                />
              ))}
            </div>
          )}

          {/* Tipo de flujo y nombres */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: "12px" }}>
            <div className="campo" style={{ flex: "1 1 160px", margin: 0 }}>
              <label>Tipo de flujo por defecto</label>
              <select value={form.tipo_flujo_default || ""}
                onChange={(e) => setForm((p) => ({ ...p, tipo_flujo_default: e.target.value }))}>
                <option value="">— Sin flujo —</option>
                {TIPOS_FLUJO.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div className="campo" style={{ flex: "1 1 120px", margin: 0 }}>
              <label>Empaque mayor</label>
              <input value={form.empaque_mayor_default || ""} placeholder="Caja, Saco…"
                onChange={(e) => setForm((p) => ({ ...p, empaque_mayor_default: e.target.value }))} />
            </div>
            <div className="campo" style={{ flex: "1 1 120px", margin: 0 }}>
              <label>Unidad menor</label>
              <input value={form.unidad_menor_default || ""} placeholder="Unidad, Kilo…"
                onChange={(e) => setForm((p) => ({ ...p, unidad_menor_default: e.target.value }))} />
            </div>
            <div className="campo" style={{ flex: "1 1 120px", margin: 0 }}>
              <label>Nivel 2 (opcional)</label>
              <input value={form.nivel2_nombre_default || ""} placeholder="Maple"
                onChange={(e) => setForm((p) => ({ ...p, nivel2_nombre_default: e.target.value }))} />
            </div>
          </div>

          {error && <div style={{ background: "#fef2f2", color: "#991b1b", padding: "8px 12px", borderRadius: "8px", fontSize: "0.85rem" }}>{error}</div>}

          <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
            <button type="button" onClick={onCancelar} style={{ padding: "9px 20px", borderRadius: "8px", border: "1px solid #d1d5db", background: "#fff", cursor: "pointer" }}>
              Cancelar
            </button>
            <button type="button" onClick={handleGuardar} disabled={guardando}
              style={{ padding: "9px 24px", borderRadius: "8px", background: "#0f6df2", color: "#fff", border: "none", fontWeight: 700, cursor: "pointer" }}>
              {guardando ? "Guardando..." : "💾 Guardar"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Página principal ─────────────────────────────────────────────────────────

export default function ConfiguracionCategorias() {
  const [categorias, setCategorias] = useState([]);
  const [categoriasBase, setCategoriasBase] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [modalAbierto, setModalAbierto] = useState(false);
  const [editando, setEditando] = useState(null);
  const [mensaje, setMensaje] = useState("");

  useEffect(() => {
    cargar();
    // Cargar categorías base (las que el usuario ya creó en /categorias)
    getCategorias().then(setCategoriasBase).catch(() => {});
  }, []);

  const cargar = async () => {
    setCargando(true);
    try { setCategorias(await getCategoriasConfig()); }
    catch (e) { setMensaje(e.message); }
    finally { setCargando(false); }
  };

  const handleGuardar = async (form) => {
    if (editando) {
      await actualizarCategoriaConfig(editando.id, form);
      setMensaje("Categoría actualizada.");
    } else {
      await crearCategoriaConfig(form);
      setMensaje("Categoría creada.");
    }
    setModalAbierto(false);
    setEditando(null);
    cargar();
  };

  const handleEliminar = async (id) => {
    if (!confirm("¿Eliminar esta configuración de categoría?")) return;
    try {
      await eliminarCategoriaConfig(id);
      setMensaje("Categoría eliminada.");
      cargar();
    } catch (e) {
      setMensaje(e.message);
    }
  };

  return (
    <div style={{ padding: "24px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
        <div>
          <h1 style={{ margin: 0 }}>⚙️ Configuración de Categorías</h1>
          <p style={{ color: "#64748b", margin: "4px 0 0" }}>
            Define las unidades y conversiones de cada categoría. El formulario de productos se adaptará automáticamente.
          </p>
        </div>
        <button
          className="btn-nuevo"
          onClick={() => { setEditando(null); setModalAbierto(true); }}
        >
          + Nueva categoría
        </button>
      </div>

      {mensaje && (
        <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", color: "#166534", padding: "10px 14px", borderRadius: "8px", marginBottom: "16px", fontSize: "0.85rem" }}>
          {mensaje}
        </div>
      )}

      {cargando ? (
        <p style={{ color: "#94a3b8" }}>Cargando configuraciones...</p>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: "16px" }}>
          {categorias.map((cat) => (
            <div key={cat.id} style={{
              background: "#fff", border: "1px solid #e2e8f0", borderRadius: "14px",
              padding: "16px 18px", borderTop: `4px solid ${cat.color || "#0f6df2"}`,
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <span style={{ fontSize: "1.8rem" }}>{cat.icono}</span>
                  <div style={{ fontWeight: 700, fontSize: "1rem", color: "#1e293b" }}>{cat.nombre}</div>
                  {cat.descripcion && <div style={{ fontSize: "0.78rem", color: "#94a3b8", marginTop: "2px" }}>{cat.descripcion}</div>}
                </div>
                <div style={{ display: "flex", gap: "6px" }}>
                  <button onClick={() => { setEditando(cat); setModalAbierto(true); }}
                    style={{ padding: "4px 10px", borderRadius: "6px", border: "1px solid #e2e8f0", background: "#f8fafc", cursor: "pointer", fontSize: "0.8rem" }}>
                    ✏️
                  </button>
                  <button onClick={() => handleEliminar(cat.id)}
                    style={{ padding: "4px 10px", borderRadius: "6px", border: "1px solid #fecaca", background: "#fef2f2", cursor: "pointer", fontSize: "0.8rem", color: "#991b1b" }}>
                    ✕
                  </button>
                </div>
              </div>

              <div style={{ marginTop: "10px", display: "flex", flexDirection: "column", gap: "4px" }}>
                <div style={{ fontSize: "0.78rem" }}>
                  <span style={{ color: "#64748b" }}>Compra:</span>{" "}
                  <span style={{ fontWeight: 600 }}>
                    {(cat.unidades_compra || []).map((u) => ETIQUETAS[u] || u).join(", ") || "—"}
                  </span>
                </div>
                <div style={{ fontSize: "0.78rem" }}>
                  <span style={{ color: "#64748b" }}>Venta:</span>{" "}
                  <span style={{ fontWeight: 600 }}>
                    {(cat.unidades_venta || []).map((u) => ETIQUETAS[u] || u).join(", ") || "—"}
                  </span>
                </div>
                <div style={{ fontSize: "0.78rem", color: "#94a3b8" }}>
                  Margen: {cat.margen_ganancia_default}% · {cat.tipo_flujo_default || "sin flujo"}
                </div>
              </div>

              {/* Resumen conversiones */}
              {Object.keys(cat.conversiones || {}).length > 0 && (
                <div style={{ marginTop: "8px", background: "#f8fafc", borderRadius: "6px", padding: "6px 8px" }}>
                  {Object.entries(cat.conversiones).map(([u, conv]) =>
                    conv.descripcion ? (
                      <div key={u} style={{ fontSize: "0.72rem", color: "#64748b" }}>
                        {conv.descripcion}
                      </div>
                    ) : null
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {modalAbierto && (
        <ModalCategoria
          cat={editando}
          categoriasBase={categoriasBase}
          onGuardar={handleGuardar}
          onCancelar={() => { setModalAbierto(false); setEditando(null); }}
        />
      )}
    </div>
  );
}
