/**
 * FormularioProducto.jsx
 *
 * Formulario de creación/edición de productos que adapta dinámicamente
 * sus unidades de compra y venta según la categoría seleccionada.
 *
 * Flujo:
 *  1. Usuario selecciona categoría
 *  2. Se cargan las unidades de compra válidas para esa categoría
 *  3. Usuario ingresa costo + unidad compra + factor de conversión
 *  4. Sistema calcula automáticamente todos los precios de venta
 *  5. Se muestran solo las unidades de venta de esa categoría
 */
import { useState, useEffect, useCallback, useRef } from "react";
import { useCategoriasConfig } from "../hooks/useCategoriaConfig";

// Etiquetas amigables para los nombres de unidades
const ETIQUETAS_UNIDAD = {
  kilo: "Kilo",
  saco: "Saco",
  medio_saco: "½ Saco",
  caja: "Caja",
  unidad: "Unidad",
  paquete: "Paquete",
  maple: "Maple",
  bolsa: "Bolsa",
  litro: "Litro",
  botella: "Botella",
  docena: "Docena",
  balde: "Balde",
  jaba: "Jaba",
};

function etiqueta(unidad) {
  return ETIQUETAS_UNIDAD[unidad] || (unidad ? unidad.charAt(0).toUpperCase() + unidad.slice(1) : "—");
}

function formatSol(v) {
  return `S/ ${Number(v ?? 0).toFixed(2)}`;
}

// Máscara de escritura dd/mm/aaaa: inserta las barras automáticamente
// a medida que el usuario digita solo números.
function formatFechaEscritura(raw) {
  const digits = raw.replace(/\D/g, "").slice(0, 8);
  const dd = digits.slice(0, 2);
  const mm = digits.slice(2, 4);
  const aaaa = digits.slice(4, 8);
  let out = dd;
  if (digits.length >= 3) out += "/" + mm;
  if (digits.length >= 5) out += "/" + aaaa;
  return out;
}

function fechaDDMMAAAAaISO(v) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(v || "");
  if (!m) return null;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

function fechaISOaDDMMAAAA(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || "");
  if (!m) return "";
  return `${m[3]}/${m[2]}/${m[1]}`;
}

const ESTADO_INICIAL = {
  nombre: "",
  categoria: "",
  proveedor: "",
  fecha_vencimiento: "",
  stock_actual: "",
  stock_minimo: "",
  // Compra
  unidad_compra: "",
  costo_compra: "",
  cantidad_comprada: 1,
  margen_ganancia: 0, // 0 para que la config de categoría pueda sobreescribir
  // Conversión: el usuario puede sobreescribir el factor de la categoría
  factor_override: {},
  // Resultados calculados
  precios_calculados: [],
  unidad_stock: "unidad",
  stock_ingresado: 0,
};

export default function FormularioProducto({ productoEditando, categorias, onGuardar, onCancelar, cargandoCategorias }) {
  const { getConfig, calcularPrecios } = useCategoriasConfig();

  const [form, setForm] = useState({ ...ESTADO_INICIAL });
  const [configCategoria, setConfigCategoria] = useState(null);
  const [calculando, setCalculando] = useState(false);
  const [mensaje, setMensaje] = useState("");
  const [guardando, setGuardando] = useState(false);

  // Snapshot de los valores de compra tal como quedó guardado el producto.
  // Mientras el usuario no toque ninguno de estos, no se debe recalcular
  // (recalcular pisaría los precios reales guardados con precios "sugeridos").
  const recalcSnapshotRef = useRef(null);

  // Cargar datos al editar
  useEffect(() => {
    if (productoEditando) {
      // Intentar deducir la unidad de compra del producto guardado
      const unidadCompraSaved = productoEditando.unidad_compra
        || productoEditando.nombre_empaque_mayor?.toLowerCase()
        || "";
      const margenSaved = productoEditando.margen_ganancia_default ?? 20;
      const costoSaved = productoEditando.costo || "";
      recalcSnapshotRef.current = {
        unidad_compra: unidadCompraSaved,
        costo_compra: costoSaved,
        cantidad_comprada: 1,
        margen_ganancia: margenSaved,
      };
      setForm({
        ...ESTADO_INICIAL,
        nombre: productoEditando.nombre || "",
        categoria: productoEditando.categoria || "",
        proveedor: productoEditando.proveedor || productoEditando.laboratorio || "",
        fecha_vencimiento: fechaISOaDDMMAAAA(productoEditando.fecha_vencimiento),
        stock_actual: productoEditando.stock_actual ?? "",
        stock_minimo: productoEditando.stock_minimo ?? "",
        margen_ganancia: margenSaved,
        costo_compra: costoSaved,
        unidad_compra: unidadCompraSaved,
        precios_calculados: _reconstructPrecios(productoEditando),
        unidad_stock: productoEditando.unidad_base || "unidad",
        factor_override: {},
      });
    }
  }, [productoEditando]);

  function _reconstructPrecios(prod) {
    const pp = prod.precios_presentacion || {};
    const entradas = Object.entries(pp).filter(([, v]) => Number(v) > 0);

    // Si hay precios_presentacion, usarlos
    if (entradas.length > 0) {
      return entradas.map(([unidad, precio_venta]) => ({
        unidad,
        costo: prod.costo || 0,
        precio_venta: Number(precio_venta) || 0,
        descripcion: null,
      }));
    }

    // Fallback: construir desde precio_venta + unidad_base
    const unidadBase = prod.unidad_base || "unidad";
    const precioVenta = Number(prod.precio_venta || 0);
    if (precioVenta > 0 || prod.costo > 0) {
      return [{
        unidad: unidadBase,
        costo: Number(prod.costo || 0),
        precio_venta: precioVenta,
        descripcion: null,
      }];
    }

    return [];
  }

  // Cuando cambia la categoría, actualizar config
  useEffect(() => {
    if (!form.categoria) {
      setConfigCategoria(null);
      // Solo limpiar precios si no estamos editando un producto existente
      if (!productoEditando) {
        setForm((p) => ({ ...p, unidad_compra: "", precios_calculados: [] }));
      } else {
        setForm((p) => ({ ...p, unidad_compra: "" }));
      }
      return;
    }
    const cfg = getConfig(form.categoria);
    setConfigCategoria(cfg);
    if (cfg) {
      setForm((p) => ({
        ...p,
        unidad_compra: p.unidad_compra || (cfg.unidades_compra?.[0] ?? ""),
        margen_ganancia: p.margen_ganancia || cfg.margen_ganancia_default || 20,
      }));
    }
  }, [form.categoria]); // eslint-disable-line react-hooks/exhaustive-deps

  // Recalcular precios cuando cambian los inputs relevantes
  const recalcular = useCallback(async () => {
    if (!form.categoria || !form.unidad_compra || !form.costo_compra || Number(form.costo_compra) <= 0) {
      // Al editar: no borrar precios ya cargados si no se está recalculando activamente
      if (!productoEditando) {
        setForm((p) => ({ ...p, precios_calculados: [] }));
      }
      return;
    }
    // Al editar: no recalcular (y pisar los precios reales ya cargados) mientras
    // el usuario no haya cambiado ninguno de los valores que afectan el cálculo.
    if (productoEditando && recalcSnapshotRef.current) {
      const snap = recalcSnapshotRef.current;
      const sinCambios =
        form.unidad_compra === snap.unidad_compra &&
        Number(form.costo_compra) === Number(snap.costo_compra) &&
        Number(form.cantidad_comprada) === Number(snap.cantidad_comprada) &&
        Number(form.margen_ganancia) === Number(snap.margen_ganancia) &&
        Object.keys(form.factor_override || {}).length === 0;
      if (sinCambios) return;
    }
    setCalculando(true);
    try {
      const resultado = await calcularPrecios({
        categoria_nombre: form.categoria,
        unidad_compra: form.unidad_compra,
        costo_compra: Number(form.costo_compra),
        cantidad_comprada: Number(form.cantidad_comprada) || 1,
        margen_ganancia: Number(form.margen_ganancia) || 20,
        factor_override: form.factor_override || null,
      });
      setForm((p) => ({
        ...p,
        precios_calculados: resultado.precios,
        stock_ingresado: resultado.stock_ingresado,
        unidad_stock: resultado.unidad_stock,
      }));
    } catch (err) {
      setMensaje(`⚠️ ${err.message}`);
    } finally {
      setCalculando(false);
    }
  }, [form.categoria, form.unidad_compra, form.costo_compra, form.cantidad_comprada, form.margen_ganancia, form.factor_override]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    recalcular();
  }, [recalcular]);

  const set = (campo, valor) => setForm((p) => ({ ...p, [campo]: valor }));

  const setFactorOverride = (unidad, campo, valor) => {
    setForm((p) => ({
      ...p,
      factor_override: {
        ...p.factor_override,
        [unidad]: { ...(p.factor_override?.[unidad] || {}), [campo]: Number(valor) },
      },
    }));
  };

  const handleGuardar = async () => {
    if (!form.nombre?.trim()) {
      setMensaje("El nombre es obligatorio.");
      return;
    }
    if (!form.categoria) {
      setMensaje("Selecciona una categoría para el producto.");
      return;
    }
    if (form.fecha_vencimiento?.trim() && !fechaDDMMAAAAaISO(form.fecha_vencimiento)) {
      setMensaje("La fecha de vencimiento debe tener el formato dd/mm/aaaa.");
      return;
    }
    setGuardando(true);
    setMensaje("");
    try {
      // Construir precios_presentacion desde los precios calculados
      // Si estamos editando y no hubo recálculo, preservar los precios del producto original
      const precios_presentacion = {};
      if (form.precios_calculados.length > 0) {
        (form.precios_calculados || []).forEach(({ unidad, precio_venta }) => {
          precios_presentacion[unidad] = precio_venta;
        });
      } else if (productoEditando?.precios_presentacion) {
        Object.assign(precios_presentacion, productoEditando.precios_presentacion);
      }

      // El costo base es el de la unidad base (kilo o unidad)
      const unidadBase = form.unidad_stock || "unidad";
      const precioBasePC = form.precios_calculados.find((pc) => pc.unidad === unidadBase)
        || form.precios_calculados[0];
      const precioBase = precioBasePC?.precio_venta
        || (productoEditando ? Number(productoEditando.precio_venta || 0) : 0);
      const costoBase = precioBasePC?.costo
        || Number(form.costo_compra)
        || (productoEditando ? Number(productoEditando.costo || 0) : 0);

      // Obtener equivalencias de la categoría + overrides
      const cfg = configCategoria;
      const equiv = {};
      if (cfg) {
        const convCompra = cfg.conversiones?.[form.unidad_compra] || {};
        if (convCompra.kg) equiv.kg_por_empaque = convCompra.kg;
        if (convCompra.unidades) equiv.unidades_por_empaque = convCompra.unidades;
        if (convCompra.nivel2_cantidad) equiv.nivel2_por_empaque = convCompra.nivel2_cantidad;
        // Aplicar overrides
        if (form.factor_override?.[form.unidad_compra]) {
          Object.assign(equiv, form.factor_override[form.unidad_compra]);
        }
      }

      const payload = {
        nombre: form.nombre.trim(),
        categoria: form.categoria || null,
        proveedor: form.proveedor?.trim() || null,
        laboratorio: form.proveedor?.trim() || null,
        fecha_vencimiento: fechaDDMMAAAAaISO(form.fecha_vencimiento),
        costo: costoBase,
        precio_venta: precioBase,
        utilidad: precioBase - costoBase,
        iva: false,
        // Convertir stock ingresado a unidades base si el usuario eligió una unidad mayor
        stock_actual: (() => {
          const raw = Number(form.stock_actual) || 0;
          const factor = Number(form._stock_factor) || 1;
          const entrada = form._stock_unidad_entrada;
          if (entrada && entrada !== form.unidad_stock && factor > 1) return raw * factor;
          return raw;
        })(),
        stock_minimo: (() => {
          const raw = Number(form.stock_minimo) || 0;
          const factor = Number(form._stockmin_factor) || 1;
          const entrada = form._stockmin_unidad_entrada;
          if (entrada && entrada !== form.unidad_stock && factor > 1) return raw * factor;
          return raw;
        })(),
        unidad_base: form.unidad_stock || "unidad",
        precios_presentacion,
        tipo_flujo: cfg?.tipo_flujo_default || null,
        nombre_empaque_mayor: cfg?.empaque_mayor_default || null,
        nombre_unidad_menor: cfg?.unidad_menor_default || null,
        nombre_nivel2: cfg?.nivel2_nombre_default || null,
        margen_ganancia_default: Number(form.margen_ganancia) || 20,
        equivalencias: equiv,
      };

      await onGuardar(payload);
    } catch (err) {
      setMensaje(err.message || "Error al guardar.");
    } finally {
      setGuardando(false);
    }
  };

  const unidadesCompra = configCategoria?.unidades_compra || [];
  const unidadesVenta = configCategoria?.unidades_venta || [];
  const conversiones = configCategoria?.conversiones || {};

  // Determinar qué campos de factor necesita mostrar según la unidad de compra seleccionada
  const convCompraActual = conversiones[form.unidad_compra] || {};
  const necesitaFactor = convCompraActual.tipo === "peso" || convCompraActual.tipo === "conteo" || convCompraActual.tipo === "multinivel";
  const factorActual = form.factor_override?.[form.unidad_compra] || {};

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onCancelar()}>
      <div className="modal-box" style={{ maxWidth: "860px" }}>
        <div className="modal-header">
          <h2>{productoEditando ? "✏️ Editar producto" : "➕ Nuevo producto"}</h2>
          <button type="button" className="btn-cerrar" onClick={onCancelar}>✕</button>
        </div>

        <div className="formulario-grid">
          {/* ── PASO 1: Categoría ── */}
          <div className="campo-full">
            <label style={{ fontWeight: 700, color: "#334155" }}>1. Categoría del producto *</label>
            {cargandoCategorias ? (
              <p style={{ color: "#94a3b8", fontSize: "0.85rem" }}>Cargando categorías...</p>
            ) : (
              <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginTop: "6px" }}>
                {categorias.map((cat) => (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => set("categoria", cat.nombre)}
                    style={{
                      display: "flex", flexDirection: "column", alignItems: "center",
                      padding: "8px 14px", borderRadius: "10px", cursor: "pointer",
                      border: form.categoria === cat.nombre ? `2px solid ${cat.color || "#0f6df2"}` : "1px solid #e2e8f0",
                      background: form.categoria === cat.nombre ? `${cat.color}18` : "#fff",
                      fontWeight: form.categoria === cat.nombre ? 700 : 400,
                      fontSize: "0.82rem", minWidth: "90px",
                      transition: "all 0.15s",
                    }}
                  >
                    <span style={{ fontSize: "1.4rem" }}>{cat.icono}</span>
                    <span>{cat.nombre}</span>
                  </button>
                ))}
              </div>
            )}
            {form.categoria && !configCategoria && (
              <p style={{ color: "#f59e0b", fontSize: "0.8rem", marginTop: "6px" }}>
                ⚠️ Esta categoría no tiene configuración de unidades. Se usarán unidades genéricas.
              </p>
            )}
            {configCategoria && (
              <div style={{ marginTop: "8px", background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: "8px", padding: "8px 12px", fontSize: "0.8rem", color: "#166534" }}>
                ✅ <strong>{form.categoria}</strong>:
                Compra en <strong>{unidadesCompra.map(etiqueta).join(", ")}</strong> →
                Vende en <strong>{unidadesVenta.map(etiqueta).join(", ")}</strong>
              </div>
            )}
          </div>

          {/* ── PASO 2: Datos básicos ── */}
          <div className="campo">
            <label>Nombre *</label>
            <input value={form.nombre} onChange={(e) => set("nombre", e.target.value)} required placeholder="Ej: Aceite Vegetal 1L" />
          </div>
          <div className="campo">
            <label>Proveedor</label>
            <input value={form.proveedor} onChange={(e) => set("proveedor", e.target.value)} placeholder="Nombre del proveedor" />
          </div>
          <div className="campo">
            <label>Fecha vencimiento</label>
            <input
              type="text"
              inputMode="numeric"
              placeholder="dd/mm/aaaa"
              maxLength={10}
              value={form.fecha_vencimiento}
              onChange={(e) => set("fecha_vencimiento", formatFechaEscritura(e.target.value))}
            />
          </div>

          {/* ── PASO 3: Compra (solo si hay categoría con config) ── */}
          {configCategoria && (
            <div className="campo-full" style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "12px", padding: "16px" }}>
              <div style={{ fontWeight: 700, color: "#334155", marginBottom: "12px" }}>2. Datos de compra</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "14px" }}>
                {/* Unidad de compra */}
                <div className="campo" style={{ flex: "1 1 160px", margin: 0 }}>
                  <label>Unidad de compra</label>
                  <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginTop: "4px" }}>
                    {unidadesCompra.map((u) => (
                      <button
                        key={u}
                        type="button"
                        onClick={() => set("unidad_compra", u)}
                        style={{
                          padding: "5px 12px", borderRadius: "20px", cursor: "pointer",
                          border: form.unidad_compra === u ? "2px solid #0f6df2" : "1px solid #cbd5e1",
                          background: form.unidad_compra === u ? "#eff6ff" : "#fff",
                          fontWeight: form.unidad_compra === u ? 700 : 400,
                          fontSize: "0.85rem",
                        }}
                      >
                        {etiqueta(u)}
                      </button>
                    ))}
                  </div>
                  {convCompraActual.descripcion && (
                    <span style={{ fontSize: "0.72rem", color: "#6b7280", marginTop: "3px", display: "block" }}>
                      {convCompraActual.descripcion}
                    </span>
                  )}
                </div>

                {/* Costo de compra */}
                <div className="campo" style={{ flex: "1 1 160px", margin: 0 }}>
                  <label>Costo de compra (S/)</label>
                  <input
                    type="number" min="0" step="0.01"
                    value={form.costo_compra}
                    onChange={(e) => set("costo_compra", e.target.value)}
                    placeholder="0.00"
                    style={{ fontSize: "1.1rem", fontWeight: 600 }}
                  />
                  {form.unidad_compra && (
                    <span style={{ fontSize: "0.72rem", color: "#6b7280" }}>
                      Precio pagado por 1 {etiqueta(form.unidad_compra)}
                    </span>
                  )}
                </div>

                {/* Cantidad comprada */}
                <div className="campo" style={{ flex: "1 1 120px", margin: 0 }}>
                  <label>Cantidad comprada</label>
                  <input
                    type="number" min="0.01" step="0.01"
                    value={form.cantidad_comprada}
                    onChange={(e) => set("cantidad_comprada", e.target.value)}
                  />
                </div>

                {/* Margen de ganancia */}
                <div className="campo" style={{ flex: "1 1 120px", margin: 0 }}>
                  <label>% Ganancia</label>
                  <input
                    type="number" min="0" max="999" step="0.5"
                    value={form.margen_ganancia}
                    onChange={(e) => set("margen_ganancia", e.target.value)}
                  />
                </div>
              </div>

              {/* Factor de conversión sobreescribible */}
              {necesitaFactor && (
                <div style={{ marginTop: "12px" }}>
                  <div style={{ fontSize: "0.8rem", fontWeight: 600, color: "#374151", marginBottom: "6px" }}>
                    📐 Factor de conversión
                    <span style={{ fontWeight: 400, color: "#9ca3af", marginLeft: "6px" }}>
                      (predeterminado de la categoría — editable)
                    </span>
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "10px" }}>
                    {convCompraActual.tipo === "peso" && (
                      <div className="campo" style={{ flex: "1 1 160px", margin: 0 }}>
                        <label>Kg por {etiqueta(form.unidad_compra)}</label>
                        <input
                          type="number" min="0.01" step="0.01"
                          defaultValue={convCompraActual.kg || ""}
                          placeholder={`Predeterminado: ${convCompraActual.kg ?? "?"}`}
                          onChange={(e) => setFactorOverride(form.unidad_compra, "kg", e.target.value)}
                        />
                      </div>
                    )}
                    {convCompraActual.tipo === "conteo" && (
                      <div className="campo" style={{ flex: "1 1 160px", margin: 0 }}>
                        <label>Unidades por {etiqueta(form.unidad_compra)}</label>
                        <input
                          type="number" min="1" step="1"
                          defaultValue={convCompraActual.unidades || ""}
                          placeholder={`Predeterminado: ${convCompraActual.unidades ?? "?"}`}
                          onChange={(e) => setFactorOverride(form.unidad_compra, "unidades", e.target.value)}
                        />
                      </div>
                    )}
                    {convCompraActual.tipo === "multinivel" && (
                      <>
                        <div className="campo" style={{ flex: "1 1 150px", margin: 0 }}>
                          <label>{etiqueta(convCompraActual.nivel2 || "nivel2")}s por {etiqueta(form.unidad_compra)}</label>
                          <input
                            type="number" min="1" step="1"
                            defaultValue={convCompraActual.nivel2_cantidad || ""}
                            placeholder={`Predeterminado: ${convCompraActual.nivel2_cantidad ?? "?"}`}
                            onChange={(e) => setFactorOverride(form.unidad_compra, "nivel2_cantidad", e.target.value)}
                          />
                        </div>
                        <div className="campo" style={{ flex: "1 1 150px", margin: 0 }}>
                          <label>Kg por {etiqueta(form.unidad_compra)}</label>
                          <input
                            type="number" min="0" step="0.01"
                            defaultValue={convCompraActual.kg_por_empaque || ""}
                            placeholder={`Predeterminado: ${convCompraActual.kg_por_empaque ?? "?"}`}
                            onChange={(e) => setFactorOverride(form.unidad_compra, "kg_por_empaque", e.target.value)}
                          />
                        </div>
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── EDICIÓN DIRECTA: costo y precios cuando no hay recálculo activo ── */}
          {productoEditando && (
            <div className="campo-full" style={{ background: "#fff7ed", border: "1px solid #fed7aa", borderRadius: "12px", padding: "16px" }}>
              <div style={{ fontWeight: 700, color: "#92400e", marginBottom: "12px" }}>
                💰 Costo y precio base
                <span style={{ fontWeight: 400, fontSize: "0.78rem", color: "#b45309", marginLeft: "8px" }}>
                  — edita directamente o usa la sección de compra para recalcular
                </span>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "14px" }}>
                <div className="campo" style={{ flex: "1 1 160px", margin: 0 }}>
                  <label>Costo (S/)</label>
                  <input
                    type="number" min="0" step="0.01"
                    value={form.costo_compra}
                    onChange={(e) => {
                      const costo = Number(e.target.value);
                      setForm((p) => ({
                        ...p,
                        costo_compra: e.target.value,
                        precios_calculados: p.precios_calculados.map((pc) => ({ ...pc, costo })),
                      }));
                    }}
                    placeholder="0.00"
                    style={{ fontSize: "1.1rem", fontWeight: 600 }}
                  />
                </div>
                <div className="campo" style={{ flex: "1 1 160px", margin: 0 }}>
                  <label>Precio base ({form.unidad_stock}) (S/)</label>
                  <input
                    type="number" min="0" step="0.01"
                    value={
                      form.precios_calculados.find((pc) => pc.unidad === form.unidad_stock)?.precio_venta
                      ?? form.precios_calculados[0]?.precio_venta
                      ?? ""
                    }
                    onChange={(e) => {
                      const nuevo = Number(e.target.value);
                      setForm((p) => {
                        const unidadBase = p.unidad_stock;
                        const existe = p.precios_calculados.find((pc) => pc.unidad === unidadBase);
                        if (existe) {
                          return {
                            ...p,
                            precios_calculados: p.precios_calculados.map((pc) =>
                              pc.unidad === unidadBase ? { ...pc, precio_venta: nuevo } : pc
                            ),
                          };
                        }
                        // Si no hay entrada para unidad base, actualizar la primera
                        return {
                          ...p,
                          precios_calculados: p.precios_calculados.length > 0
                            ? [{ ...p.precios_calculados[0], precio_venta: nuevo }, ...p.precios_calculados.slice(1)]
                            : [{ unidad: unidadBase, costo: Number(p.costo_compra) || 0, precio_venta: nuevo, descripcion: null }],
                        };
                      });
                    }}
                    placeholder="0.00"
                    style={{ fontSize: "1.1rem", fontWeight: 600, border: "2px solid #bfdbfe", background: "#eff6ff" }}
                  />
                </div>
                <div className="campo" style={{ flex: "1 1 120px", margin: 0 }}>
                  <label>% Ganancia</label>
                  <input
                    type="number" min="0" max="999" step="0.5"
                    value={form.margen_ganancia}
                    onChange={(e) => set("margen_ganancia", e.target.value)}
                  />
                </div>
              </div>
            </div>
          )}

          {/* ── PASO 4: Precios calculados (editables) ── */}
          {form.precios_calculados.length > 0 && (
            <div className="campo-full">
              <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "10px" }}>
                <span style={{ fontWeight: 700, color: "#334155" }}>3. Precios de venta</span>
                {calculando && <span style={{ color: "#9ca3af", fontSize: "0.8rem" }}>⏳ recalculando...</span>}
                {!calculando && form.costo_compra > 0 && (
                  <span style={{ fontSize: "0.75rem", color: "#64748b" }}>
                    Sugeridos con {form.margen_ganancia}% ganancia — editá el precio que quieras
                  </span>
                )}
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "10px" }}>
                {form.precios_calculados.map(({ unidad, costo, precio_venta, descripcion }) => {
                  // Calcular desglose para mostrar equivalencia de precio
                  const conv = conversiones[unidad] || {};
                  let desglose = null;
                  if (conv.tipo === "conteo" && conv.unidades > 0) {
                    const precioUnidad = precio_venta / conv.unidades;
                    desglose = `${etiqueta(unidad)} ÷ ${conv.unidades} ${etiqueta(form.unidad_stock || "unidad")} = S/ ${precioUnidad.toFixed(2)}/${etiqueta(form.unidad_stock || "unidad")}`;
                  } else if (conv.tipo === "peso" && conv.kg > 0) {
                    const precioKilo = precio_venta / conv.kg;
                    desglose = `${etiqueta(unidad)} ÷ ${conv.kg} kg = S/ ${precioKilo.toFixed(2)}/kg`;
                  } else if (conv.tipo === "fraccion" && conv.factor) {
                    const baseName = conv.base || "saco";
                    const baseConv = conversiones[baseName] || {};
                    const kgBase = baseConv.kg || 0;
                    if (kgBase > 0) {
                      const kgTotal = kgBase * conv.factor;
                      desglose = `${etiqueta(unidad)} = ${kgTotal} kg`;
                    }
                  } else if (conv.tipo === "multinivel" && conv.kg_por_empaque > 0) {
                    const precioKilo = precio_venta / conv.kg_por_empaque;
                    desglose = `${etiqueta(unidad)} ÷ ${conv.kg_por_empaque} kg = S/ ${precioKilo.toFixed(2)}/kg`;
                  }

                  return (
                  <div
                    key={unidad}
                    style={{
                      flex: "1 1 160px", background: "#fff", border: "1px solid #e2e8f0",
                      borderRadius: "12px", padding: "12px 16px",
                      borderTop: "3px solid #0f6df2",
                    }}
                  >
                    <div style={{ fontWeight: 700, fontSize: "0.95rem", color: "#1e293b", marginBottom: "2px" }}>
                      {etiqueta(unidad)}
                    </div>
                    {descripcion && (
                      <div style={{ fontSize: "0.7rem", color: "#94a3b8", marginBottom: "4px" }}>{descripcion}</div>
                    )}
                    <div style={{ fontSize: "0.75rem", color: "#64748b", marginBottom: "4px" }}>
                      Costo: {formatSol(costo)}
                    </div>
                    {/* Precio editable */}
                    <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                      <span style={{ fontSize: "0.8rem", color: "#475569", fontWeight: 600 }}>S/</span>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={precio_venta}
                        onChange={(e) => {
                          const nuevo = Number(e.target.value);
                          setForm((p) => ({
                            ...p,
                            precios_calculados: p.precios_calculados.map((pc) =>
                              pc.unidad === unidad ? { ...pc, precio_venta: nuevo } : pc
                            ),
                          }));
                        }}
                        style={{
                          width: "90px", padding: "4px 6px", borderRadius: "6px",
                          border: "1px solid #bfdbfe", background: "#eff6ff",
                          fontSize: "1rem", fontWeight: 700, color: "#1d4ed8",
                          textAlign: "right",
                        }}
                      />
                    </div>
                    {/* Desglose de precio por unidad mínima */}
                    {desglose && (
                      <div style={{ fontSize: "0.68rem", marginTop: "5px", color: "#7c3aed", background: "#f5f3ff", borderRadius: "5px", padding: "3px 6px" }}>
                        💡 {desglose}
                      </div>
                    )}
                    {/* Ganancia real sobre el precio editado */}
                    {costo > 0 && precio_venta > 0 && (
                      <div style={{
                        fontSize: "0.7rem", marginTop: "4px",
                        color: precio_venta >= costo * 1.1 ? "#16a34a" : "#dc2626",
                        fontWeight: 600,
                      }}>
                        {(((precio_venta - costo) / costo) * 100).toFixed(1)}% ganancia
                      </div>
                    )}
                  </div>
                  );
                })}
              </div>
              {form.stock_ingresado > 0 && (
                <div style={{ marginTop: "8px", fontSize: "0.8rem", color: "#475569" }}>
                  📊 Stock a ingresar: <strong>{form.stock_ingresado} {form.unidad_stock}</strong>
                </div>
              )}
            </div>
          )}

          {/* Stock actual (editable) */}
          <div className="campo">
            <label>Stock actual</label>
            <div className="campo-flex-row">
              <input
                type="number" min="0" step="0.01"
                value={form.stock_actual}
                onChange={(e) => set("stock_actual", e.target.value)}
                placeholder="0"
              />
              {/* Selector de unidad para ingresar stock */}
              {configCategoria && (() => {
                const unidades = [form.unidad_stock, ...configCategoria.unidades_compra].filter(Boolean);
                const uniqueUnidades = [...new Set(unidades)];
                if (uniqueUnidades.length <= 1) return null;
                return (
                  <select
                    value={form._stock_unidad_entrada || form.unidad_stock}
                    onChange={(e) => {
                      const unidadEntrada = e.target.value;
                      const conv = configCategoria.conversiones?.[unidadEntrada] || {};
                      let factor = 1;
                      if (conv.tipo === "conteo" && conv.unidades > 0) factor = conv.unidades;
                      else if (conv.tipo === "peso" && conv.kg > 0) factor = conv.kg;
                      setForm((p) => ({
                        ...p,
                        _stock_unidad_entrada: unidadEntrada,
                        _stock_factor: factor,
                      }));
                    }}
                  >
                    {uniqueUnidades.map((u) => (
                      <option key={u} value={u}>{etiqueta(u)}</option>
                    ))}
                  </select>
                );
              })()}
            </div>
            {form.unidad_stock && (
              <span style={{ fontSize: "0.72rem", color: "#9ca3af" }}>
                {form._stock_unidad_entrada && form._stock_unidad_entrada !== form.unidad_stock && form._stock_factor > 1
                  ? `= ${Number(form.stock_actual || 0) * form._stock_factor} ${form.unidad_stock}`
                  : `en ${form.unidad_stock}`}
                {form.unidad_stock === "unidad" && configCategoria?.conversiones?.caja?.unidades > 0 &&
                  ` · ${Math.floor(Number(form.stock_actual || 0) / configCategoria.conversiones.caja.unidades)} cajas + ${Number(form.stock_actual || 0) % configCategoria.conversiones.caja.unidades} und`}
                {form.unidad_stock === "kilo" && configCategoria?.conversiones?.saco?.kg > 0 &&
                  ` · ${Math.floor(Number(form.stock_actual || 0) / configCategoria.conversiones.saco.kg)} sacos + ${(Number(form.stock_actual || 0) % configCategoria.conversiones.saco.kg).toFixed(1)} kg`}
              </span>
            )}
          </div>
          <div className="campo">
            <label>Stock mínimo</label>
            <div className="campo-flex-row">
              <input
                type="number" min="0" step="0.01"
                value={form.stock_minimo}
                onChange={(e) => set("stock_minimo", e.target.value)}
                placeholder="0"
                style={{ flex: 1 }}
              />
              {configCategoria && (() => {
                const unidades = [form.unidad_stock, ...configCategoria.unidades_compra].filter(Boolean);
                const uniqueUnidades = [...new Set(unidades)];
                if (uniqueUnidades.length <= 1) return null;
                return (
                  <select
                    value={form._stockmin_unidad_entrada || form.unidad_stock}
                    onChange={(e) => {
                      const unidadEntrada = e.target.value;
                      const conv = configCategoria.conversiones?.[unidadEntrada] || {};
                      let factor = 1;
                      if (conv.tipo === "conteo" && conv.unidades > 0) factor = conv.unidades;
                      else if (conv.tipo === "peso" && conv.kg > 0) factor = conv.kg;
                      setForm((p) => ({
                        ...p,
                        _stockmin_unidad_entrada: unidadEntrada,
                        _stockmin_factor: factor,
                      }));
                    }}
                  >
                    {uniqueUnidades.map((u) => (
                      <option key={u} value={u}>{etiqueta(u)}</option>
                    ))}
                  </select>
                );
              })()}
            </div>
            {form.unidad_stock && (
              <span style={{ fontSize: "0.72rem", color: "#9ca3af" }}>
                {form._stockmin_unidad_entrada && form._stockmin_unidad_entrada !== form.unidad_stock && form._stockmin_factor > 1
                  ? `= ${Number(form.stock_minimo || 0) * form._stockmin_factor} ${form.unidad_stock}`
                  : `mínimo en ${form.unidad_stock}`}
                {form.unidad_stock === "unidad" && configCategoria?.conversiones?.caja?.unidades > 0 &&
                  ` (= ${(Number(form.stock_minimo || 0) / configCategoria.conversiones.caja.unidades).toFixed(1)} cajas)`}
                {form.unidad_stock === "kilo" && configCategoria?.conversiones?.saco?.kg > 0 &&
                  ` (= ${(Number(form.stock_minimo || 0) / configCategoria.conversiones.saco.kg).toFixed(2)} sacos)`}
              </span>
            )}
          </div>
        </div>

        {/* Mensajes */}
        {mensaje && (
          <div style={{
            margin: "12px 0", padding: "10px 14px", borderRadius: "8px",
            background: mensaje.startsWith("⚠️") || mensaje.startsWith("❌") ? "#fef2f2" : "#f0fdf4",
            color: mensaje.startsWith("⚠️") || mensaje.startsWith("❌") ? "#991b1b" : "#166534",
            fontSize: "0.85rem",
          }}>
            {mensaje}
          </div>
        )}

        {/* Acciones */}
        <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end", marginTop: "16px" }}>
          <button type="button" className="btn-cancelar" onClick={onCancelar} disabled={guardando}>
            Cancelar
          </button>
          <button
            type="button"
            className="btn-guardar"
            onClick={handleGuardar}
            disabled={guardando || calculando}
            style={{ background: "#0f6df2", color: "#fff", border: "none", padding: "10px 24px", borderRadius: "8px", fontWeight: 700, cursor: "pointer" }}
          >
            {guardando ? "Guardando..." : (productoEditando ? "💾 Actualizar" : "💾 Crear producto")}
          </button>
        </div>
      </div>
    </div>
  );
}
