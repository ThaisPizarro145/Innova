import { useState, useEffect, useCallback } from "react";
import { getProductos, registrarCompra, getCompras, anularCompra, previewCalculoCompra } from "../services/api";
import { normalizarFechaUTC } from "../components/NotaVenta";
import "../styles/Compras.css";

// ─── Constantes ────────────────────────────────────────────────────────────────

const TIPOS = [
  {
    value: "caja_unidad",
    label: "Caja / Unidad",
    icono: "📦",
    descripcion: "Aceite, conservas, bebidas",
    empaque: "Caja",
    camposExtra: ["unidades_por_empaque"],
    sugerencias: ["empaque", "unitario"],
  },
  {
    value: "saco_kilo",
    label: "Saco / Kilo",
    icono: "⚖️",
    descripcion: "Menestras, arroz, azúcar",
    empaque: "Saco",
    camposExtra: ["kg_por_empaque"],
    sugerencias: ["empaque", "kilo"],
  },
  {
    value: "saco_unidad",
    label: "Saco / Unidad",
    icono: "🧂",
    descripcion: "Sal, detergente en bolsas",
    empaque: "Saco",
    camposExtra: ["unidades_por_empaque"],
    sugerencias: ["empaque", "unitario"],
  },
  {
    value: "multinivel",
    label: "Multinivel",
    icono: "🥚",
    descripcion: "Huevos (Paquete → Maple → Kg)",
    empaque: "Paquete",
    camposExtra: ["nivel2_cantidad", "unidades_por_nivel2", "kg_por_empaque"],
    sugerencias: ["empaque", "nivel2", "kilo"],
  },
];

const ETIQUETAS = {
  caja_unidad: {
    empaque: (n) => n || "Caja",
    unitario: "Unidad",
    campoUnidades: "Unidades por caja",
  },
  saco_kilo: {
    empaque: (n) => n || "Saco",
    kilo: "Kilo",
    campoKg: "Peso del saco (kg)",
  },
  saco_unidad: {
    empaque: (n) => n || "Saco",
    unitario: "Bolsa / Unidad",
    campoUnidades: "Bolsas por saco",
  },
  multinivel: {
    empaque: (n) => n || "Paquete",
    nivel2: "Maple",
    kilo: "Kilo",
    campoNivel2: "Maples por paquete",
    campoHuevos: "Huevos por maple",
    campoKg: "Kg totales por paquete",
  },
};

const GANANCIA_DEFAULT = 20;

function formatSol(v) {
  return `S/ ${Number(v ?? 0).toFixed(2)}`;
}

// ─── Estado inicial de un ítem del formulario ──────────────────────────────────

function itemVacio() {
  return {
    producto_id: "",
    tipo_presentacion: "caja_unidad",
    nombre_empaque: "Caja",
    cantidad_empaque: 1,
    precio_empaque: "",
    unidades_por_empaque: "",
    kg_por_empaque: "",
    nivel2_cantidad: "",
    nivel2_nombre: "Maple",
    unidades_por_nivel2: "",
    porcentaje_ganancia: GANANCIA_DEFAULT,
    lote: "",
    fecha_vencimiento: "",
    _preview: null,   // resultado del cálculo en tiempo real
    _loading: false,
  };
}

// ─── Componente FilaDetalle ────────────────────────────────────────────────────

function FilaDetalle({ item, index, productos, onChange, onRemove }) {
  // Al cambiar el producto seleccionado, autocargar su configuración de empaque
  const productoSeleccionado = productos.find((p) => String(p.id) === String(item.producto_id));

  useEffect(() => {
    if (!productoSeleccionado || !productoSeleccionado.tipo_flujo) return;
    const p = productoSeleccionado;
    const eq = p.equivalencias || {};

    // Solo autocargar si el tipo no fue ya elegido manualmente para este producto
    onChange(index, "tipo_presentacion", p.tipo_flujo);
    onChange(index, "nombre_empaque", p.nombre_empaque_mayor || "");
    onChange(index, "nivel2_nombre", p.nombre_nivel2 || "Maple");
    // Precargar factores desde las equivalencias del catálogo
    if (eq.unidades_por_empaque) onChange(index, "unidades_por_empaque", eq.unidades_por_empaque);
    if (eq.kg_por_empaque) onChange(index, "kg_por_empaque", eq.kg_por_empaque);
    if (eq.nivel2_por_empaque) onChange(index, "nivel2_cantidad", eq.nivel2_por_empaque);
    if (eq.unidades_por_nivel2) onChange(index, "unidades_por_nivel2", eq.unidades_por_nivel2);
    // Margen de ganancia del catálogo
    if (p.margen_ganancia_default) onChange(index, "porcentaje_ganancia", p.margen_ganancia_default);
  // Solo se dispara cuando cambia el producto seleccionado
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.producto_id]);

  const tipo = TIPOS.find((t) => t.value === item.tipo_presentacion) || TIPOS[0];
  const etiq = ETIQUETAS[item.tipo_presentacion] || {};
  const preview = item._preview;
  // Saber si el producto ya tiene flujo configurado (para mostrar badge informativo)
  const tieneConfigCatalogo = productoSeleccionado?.tipo_flujo;

  // Recalcular preview cuando cambian los campos relevantes
  useEffect(() => {
    const precioValido = Number(item.precio_empaque) > 0;
    let camposCompletos = false;
    if (item.tipo_presentacion === "caja_unidad" || item.tipo_presentacion === "saco_unidad") {
      camposCompletos = precioValido && Number(item.unidades_por_empaque) > 0;
    } else if (item.tipo_presentacion === "saco_kilo") {
      camposCompletos = precioValido && Number(item.kg_por_empaque) > 0;
    } else if (item.tipo_presentacion === "multinivel") {
      camposCompletos = precioValido && Number(item.nivel2_cantidad) > 0;
    }

    if (!camposCompletos) {
      onChange(index, "_preview", null);
      return;
    }

    let cancelled = false;
    onChange(index, "_loading", true);
    const payload = {
      producto_id: Number(item.producto_id) || 1,
      tipo_presentacion: item.tipo_presentacion,
      nombre_empaque: item.nombre_empaque,
      cantidad_empaque: Number(item.cantidad_empaque) || 1,
      precio_empaque: Number(item.precio_empaque),
      unidades_por_empaque: Number(item.unidades_por_empaque) || null,
      kg_por_empaque: Number(item.kg_por_empaque) || null,
      nivel2_cantidad: Number(item.nivel2_cantidad) || null,
      nivel2_nombre: item.nivel2_nombre || null,
      unidades_por_nivel2: Number(item.unidades_por_nivel2) || null,
      porcentaje_ganancia: Number(item.porcentaje_ganancia) || GANANCIA_DEFAULT,
    };
    previewCalculoCompra(payload).then((res) => {
      if (!cancelled) {
        onChange(index, "_preview", res);
        onChange(index, "_loading", false);
      }
    }).catch(() => {
      if (!cancelled) onChange(index, "_loading", false);
    });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    item.tipo_presentacion, item.precio_empaque, item.unidades_por_empaque,
    item.kg_por_empaque, item.nivel2_cantidad, item.unidades_por_nivel2,
    item.porcentaje_ganancia, item.cantidad_empaque,
  ]);

  const set = (campo, valor) => onChange(index, campo, valor);

  // Nombres dinámicos según el catálogo o el valor del item
  const labelEmpaque = productoSeleccionado?.nombre_empaque_mayor || item.nombre_empaque || tipo.empaque;
  const labelUnidadMenor = productoSeleccionado?.nombre_unidad_menor || "Unidad";
  const labelNivel2 = productoSeleccionado?.nombre_nivel2 || item.nivel2_nombre || "Maple";

  return (
    <div className="compra-fila-detalle">
      {/* Cabecera de la fila */}
      <div className="compra-fila-header">
        <span className="compra-fila-num">#{index + 1}</span>
        <button className="btn-icon btn-danger" onClick={() => onRemove(index)} title="Eliminar línea">✕</button>
      </div>

      {/* Selector de producto */}
      <div className="compra-campo-grupo">
        <label>Producto</label>
        <select value={item.producto_id} onChange={(e) => {
          set("producto_id", e.target.value);
          set("_preview", null);
        }}>
          <option value="">— Seleccionar —</option>
          {productos.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nombre} ({p.codigo})
              {p.tipo_flujo ? ` · ${TIPOS.find(t => t.value === p.tipo_flujo)?.icono || ""}` : ""}
            </option>
          ))}
        </select>
        {/* Badge: indica si el producto trae configuración de catálogo */}
        {tieneConfigCatalogo && (
          <div style={{
            display: "inline-flex", alignItems: "center", gap: "5px",
            marginTop: "5px", background: "#eff6ff", border: "1px solid #bfdbfe",
            borderRadius: "6px", padding: "3px 10px", fontSize: "0.76rem", color: "#1e40af"
          }}>
            ✅ Configuración cargada desde el catálogo
            {" · "}{TIPOS.find(t => t.value === tieneConfigCatalogo)?.icono}{" "}
            <strong>{TIPOS.find(t => t.value === tieneConfigCatalogo)?.label}</strong>
            {" · "}{productoSeleccionado.margen_ganancia_default}% ganancia
          </div>
        )}
      </div>

      {/* Tipo de presentación — siempre visible para permitir override manual */}
      <div className="compra-campo-grupo">
        <label>
          Tipo de compra
          {tieneConfigCatalogo && <span style={{ fontSize: "0.72rem", color: "#6b7280", marginLeft: "6px" }}>(precargado del catálogo · editable)</span>}
        </label>
        <div className="compra-tipo-grid">
          {TIPOS.map((t) => (
            <button
              key={t.value}
              className={`compra-tipo-btn${item.tipo_presentacion === t.value ? " activo" : ""}`}
              onClick={() => {
                set("tipo_presentacion", t.value);
                set("nombre_empaque", t.empaque);
                set("_preview", null);
              }}
              title={t.descripcion}
              type="button"
            >
              <span className="tipo-icono">{t.icono}</span>
              <span className="tipo-label">{t.label}</span>
              <span className="tipo-desc">{t.descripcion}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Nombre del empaque + cantidad + precio */}
      <div className="compra-campos-row">
        <div className="compra-campo-grupo">
          <label>Nombre empaque</label>
          <input
            type="text"
            value={item.nombre_empaque}
            onChange={(e) => set("nombre_empaque", e.target.value)}
            placeholder={labelEmpaque}
          />
        </div>
        <div className="compra-campo-grupo">
          <label>Cantidad comprada</label>
          <input type="number" min="0.01" step="0.01" value={item.cantidad_empaque}
            onChange={(e) => set("cantidad_empaque", e.target.value)} />
        </div>
        <div className="compra-campo-grupo">
          <label>Precio por {item.nombre_empaque || labelEmpaque} (S/)</label>
          <input type="number" min="0" step="0.01" value={item.precio_empaque}
            onChange={(e) => set("precio_empaque", e.target.value)} placeholder="0.00" />
        </div>
      </div>

      {/* ── Campos de factores de conversión: Smart UI según tipo ── */}
      <div className="compra-campos-row">
        {(item.tipo_presentacion === "caja_unidad" || item.tipo_presentacion === "saco_unidad") && (
          <div className="compra-campo-grupo">
            <label>
              {item.tipo_presentacion === "caja_unidad"
                ? `${labelUnidadMenor}s por ${labelEmpaque}`
                : `Bolsas por ${labelEmpaque}`}
            </label>
            <input type="number" min="1" step="1"
              value={item.unidades_por_empaque}
              onChange={(e) => set("unidades_por_empaque", e.target.value)}
              placeholder="Ej: 12"
            />
            {item.unidades_por_empaque > 0 && (
              <span style={{ fontSize: "0.72rem", color: "#6b7280" }}>
                1 {labelEmpaque} = {item.unidades_por_empaque} {labelUnidadMenor}s
              </span>
            )}
          </div>
        )}

        {item.tipo_presentacion === "saco_kilo" && (
          <div className="compra-campo-grupo">
            <label>Kg por {labelEmpaque}</label>
            <input type="number" min="0.01" step="0.01"
              value={item.kg_por_empaque}
              onChange={(e) => set("kg_por_empaque", e.target.value)}
              placeholder="Ej: 50"
            />
            {item.kg_por_empaque > 0 && (
              <span style={{ fontSize: "0.72rem", color: "#6b7280" }}>
                1 {labelEmpaque} = {item.kg_por_empaque} kg
              </span>
            )}
          </div>
        )}

        {item.tipo_presentacion === "multinivel" && (
          <>
            <div className="compra-campo-grupo">
              <label>{labelNivel2}s por {labelEmpaque}</label>
              <input type="number" min="1" value={item.nivel2_cantidad}
                onChange={(e) => set("nivel2_cantidad", e.target.value)} placeholder="Ej: 8" />
            </div>
            <div className="compra-campo-grupo">
              <label>Nombre nivel 2</label>
              <input type="text" value={item.nivel2_nombre}
                onChange={(e) => set("nivel2_nombre", e.target.value)} placeholder="Maple" />
            </div>
            <div className="compra-campo-grupo">
              <label>{labelUnidadMenor}s por {labelNivel2}</label>
              <input type="number" min="1" value={item.unidades_por_nivel2}
                onChange={(e) => set("unidades_por_nivel2", e.target.value)} placeholder="Ej: 30" />
            </div>
            <div className="compra-campo-grupo">
              <label>Kg por {labelEmpaque} (opcional)</label>
              <input type="number" min="0" step="0.01" value={item.kg_por_empaque}
                onChange={(e) => set("kg_por_empaque", e.target.value)} placeholder="Ej: 16" />
            </div>
          </>
        )}

        <div className="compra-campo-grupo">
          <label>% Ganancia</label>
          <input type="number" min="0" max="999" step="0.5"
            value={item.porcentaje_ganancia}
            onChange={(e) => set("porcentaje_ganancia", e.target.value)} />
        </div>
      </div>

      {/* Trazabilidad */}
      <div className="compra-campos-row">
        <div className="compra-campo-grupo">
          <label>Lote (opcional)</label>
          <input type="text" value={item.lote} onChange={(e) => set("lote", e.target.value)} placeholder="L-001" />
        </div>
        <div className="compra-campo-grupo">
          <label>Vencimiento (opcional)</label>
          <input type="date" value={item.fecha_vencimiento} onChange={(e) => set("fecha_vencimiento", e.target.value)} />
        </div>
      </div>

      {/* Panel de sugerencias */}
      {item._loading && <div className="compra-preview-loading">⏳ Calculando...</div>}
      {preview && !item._loading && (
        <PanelSugerencias
          preview={preview}
          item={item}
          tipo={item.tipo_presentacion}
          labelEmpaque={labelEmpaque}
          labelUnidadMenor={labelUnidadMenor}
          labelNivel2={labelNivel2}
        />
      )}
    </div>
  );
}

// ─── Panel de Sugerencias de Precios ─────────────────────────────────────────

const ICONOS_PRESENTACION = {
  kilo: "⚖️", saco: "🌾", "medio saco": "🌾", caja: "📦", unidad: "🏷️",
  maple: "🗂️", paquete: "📦", bolsa: "🧂", litro: "🧴", botella: "🧴",
  docena: "🏷️", balde: "🪣", jaba: "🗂️",
};

function iconoPresentacion(nombre) {
  const key = (nombre || "").toLowerCase();
  for (const [k, v] of Object.entries(ICONOS_PRESENTACION)) {
    if (key.includes(k)) return v;
  }
  return "📦";
}

function PanelSugerencias({ preview, item, tipo, labelEmpaque, labelUnidadMenor, labelNivel2 }) {
  // Usar presentaciones dinámicas si el backend las devuelve
  const presentaciones = preview.presentaciones;

  if (presentaciones && presentaciones.length > 0) {
    return (
      <div className="compra-preview">
        <div className="compra-preview-titulo">
          <span>💡 Costos y precios sugeridos (+{item.porcentaje_ganancia}% ganancia)</span>
        </div>
        <div className="compra-preview-grid">
          {presentaciones.map((p, i) => (
            <div key={i} className="preview-card">
              <span className="preview-card-icon">{iconoPresentacion(p.unidad)}</span>
              <span className="preview-card-label">{p.unidad}</span>
              {p.descripcion && (
                <span style={{ fontSize: "0.72rem", color: "#6b7280" }}>{p.descripcion}</span>
              )}
              <span className="preview-card-costo">Costo: {formatSol(p.costo)}</span>
              <span className="preview-card-precio">Venta: {formatSol(p.precio_venta)}</span>
            </div>
          ))}
          {/* Stock a ingresar */}
          <div className="preview-card preview-card-stock">
            <span className="preview-card-icon">📊</span>
            <span className="preview-card-label">Stock a ingresar</span>
            <span className="preview-card-precio">
              {Number(preview.stock_ingresado).toFixed(2)} {preview.unidad_stock}
            </span>
            <span className="preview-card-costo">
              Total compra: {formatSol(Number(item.precio_empaque) * Number(item.cantidad_empaque))}
            </span>
          </div>
        </div>
      </div>
    );
  }

  // Fallback: layout fijo (cuando no hay presentaciones)
  const nomEmpaque = labelEmpaque || item.nombre_empaque || "Empaque";
  const nomNivel2 = labelNivel2 || item.nivel2_nombre || "Nivel 2";
  const nomUnitario =
    tipo === "saco_kilo" ? "Kilo" :
    tipo === "multinivel" ? "Kilo" :
    (labelUnidadMenor || "Unidad");

  return (
    <div className="compra-preview">
      <div className="compra-preview-titulo">
        <span>💡 Costos y precios sugeridos (+{item.porcentaje_ganancia}% ganancia)</span>
      </div>
      <div className="compra-preview-grid">
        <div className="preview-card">
          <span className="preview-card-icon">📦</span>
          <span className="preview-card-label">Por {nomEmpaque}</span>
          <span className="preview-card-costo">Costo: {formatSol(preview.costo_empaque)}</span>
          <span className="preview-card-precio">Venta: {formatSol(preview.precio_venta_empaque)}</span>
        </div>

        {tipo === "multinivel" && preview.precio_venta_nivel2 != null && (
          <div className="preview-card preview-card-nivel2">
            <span className="preview-card-icon">🗂️</span>
            <span className="preview-card-label">Por {nomNivel2}</span>
            <span className="preview-card-costo">Costo: {formatSol(preview.costo_nivel2)}</span>
            <span className="preview-card-precio">Venta: {formatSol(preview.precio_venta_nivel2)}</span>
          </div>
        )}

        <div className="preview-card preview-card-unitario">
          <span className="preview-card-icon">{tipo === "saco_kilo" || tipo === "multinivel" ? "⚖️" : "🏷️"}</span>
          <span className="preview-card-label">Por {nomUnitario}</span>
          <span className="preview-card-costo">Costo: {formatSol(preview.costo_unitario)}</span>
          <span className="preview-card-precio">Venta: {formatSol(preview.precio_venta_unitario)}</span>
        </div>

        <div className="preview-card preview-card-stock">
          <span className="preview-card-icon">📊</span>
          <span className="preview-card-label">Stock a ingresar</span>
          <span className="preview-card-precio">
            {Number(preview.stock_ingresado).toFixed(2)} {preview.unidad_stock}
          </span>
          <span className="preview-card-costo">
            Total compra: {formatSol(Number(item.precio_empaque) * Number(item.cantidad_empaque))}
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── Componente Principal ─────────────────────────────────────────────────────

export default function Compras() {
  const [tab, setTab] = useState("nueva"); // "nueva" | "historial"
  const [productos, setProductos] = useState([]);
  const [compras, setCompras] = useState([]);
  const [cargando, setCargando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState(null);
  const [exito, setExito] = useState(null);

  // Cabecera de la compra
  const [cabecera, setCabecera] = useState({
    numero: "",
    proveedor: "",
    observaciones: "",
  });

  // Lista de líneas de detalle
  const [detalles, setDetalles] = useState([itemVacio()]);

  // Cargar productos y compras al montar
  useEffect(() => {
    getProductos().then(setProductos).catch(() => {});
    if (tab === "historial") {
      setCargando(true);
      getCompras().then(setCompras).catch(() => {}).finally(() => setCargando(false));
    }
  }, [tab]);

  // Cambiar campo de cabecera
  const setCabField = (campo, valor) =>
    setCabecera((prev) => ({ ...prev, [campo]: valor }));

  // Cambiar campo en una línea
  const handleCampoDetalle = useCallback((index, campo, valor) => {
    setDetalles((prev) => {
      const copia = [...prev];
      copia[index] = { ...copia[index], [campo]: valor };
      return copia;
    });
  }, []);

  const agregarLinea = () => setDetalles((prev) => [...prev, itemVacio()]);
  const eliminarLinea = (i) => setDetalles((prev) => prev.filter((_, idx) => idx !== i));

  // Calcular totales de vista. El precio por empaque ya es lo que se paga
  // al proveedor (con IGV incluido): nunca se le suma IGV encima, se
  // desglosa hacia atrás solo para el registro contable.
  const totalCompra = detalles.reduce(
    (acc, d) => acc + (Number(d.precio_empaque) || 0) * (Number(d.cantidad_empaque) || 0),
    0
  );
  const subtotalCompra = totalCompra / 1.18;
  const igvCompra = totalCompra - subtotalCompra;

  const handleGuardar = async () => {
    setError(null);
    setExito(null);

    // Validaciones básicas
    const invalidas = detalles.filter(
      (d) => !d.producto_id || !d.precio_empaque || Number(d.precio_empaque) <= 0
    );
    if (invalidas.length > 0) {
      setError("Completa todos los campos requeridos (producto y precio) en cada línea.");
      return;
    }

    setGuardando(true);
    try {
      const payload = {
        numero: cabecera.numero || null,
        proveedor: cabecera.proveedor || null,
        observaciones: cabecera.observaciones || null,
        detalles: detalles.map((d) => ({
          producto_id: Number(d.producto_id),
          tipo_presentacion: d.tipo_presentacion,
          nombre_empaque: d.nombre_empaque,
          cantidad_empaque: Number(d.cantidad_empaque) || 1,
          precio_empaque: Number(d.precio_empaque),
          unidades_por_empaque: Number(d.unidades_por_empaque) || null,
          kg_por_empaque: Number(d.kg_por_empaque) || null,
          nivel2_cantidad: Number(d.nivel2_cantidad) || null,
          nivel2_nombre: d.nivel2_nombre || null,
          unidades_por_nivel2: Number(d.unidades_por_nivel2) || null,
          porcentaje_ganancia: Number(d.porcentaje_ganancia) || GANANCIA_DEFAULT,
          lote: d.lote || null,
          fecha_vencimiento: d.fecha_vencimiento || null,
        })),
      };
      await registrarCompra(payload);
      setExito("✅ Compra registrada. Stock e inventario actualizados.");
      setDetalles([itemVacio()]);
      setCabecera({ numero: "", proveedor: "", observaciones: "" });
      // Refrescar productos
      getProductos().then(setProductos).catch(() => {});
    } catch (err) {
      setError(err.message || "Error al registrar la compra.");
    } finally {
      setGuardando(false);
    }
  };

  const handleAnular = async (id) => {
    if (!confirm("¿Anular esta compra? Se revertirá el stock.")) return;
    try {
      await anularCompra(id);
      setCompras((prev) => prev.map((c) => String(c.id) === String(id) ? { ...c, estado: "ANULADA" } : c));
    } catch (err) {
      alert(err.message || "Error al anular.");
    }
  };

  return (
    <div className="compras-page">
      {/* Título */}
      <div className="compras-header">
        <h2>🛒 Entrada de Compras</h2>
        <p className="compras-subtitulo">
          Registra compras mayoristas y minoristas con cálculo automático de costos y precios sugeridos.
        </p>
      </div>

      {/* Tabs */}
      <div className="compras-tabs">
        <button
          className={`compras-tab${tab === "nueva" ? " activo" : ""}`}
          onClick={() => setTab("nueva")}
        >
          ➕ Nueva Compra
        </button>
        <button
          className={`compras-tab${tab === "historial" ? " activo" : ""}`}
          onClick={() => setTab("historial")}
        >
          📋 Historial
        </button>
      </div>

      {/* ── Tab: Nueva Compra ─────────────────────────────────── */}
      {tab === "nueva" && (
        <div className="compras-form">
          {/* Cabecera de la orden */}
          <div className="compras-seccion">
            <h3>Datos del proveedor</h3>
            <div className="compra-campos-row">
              <div className="compra-campo-grupo">
                <label>Nro. Factura / Guía</label>
                <input
                  type="text"
                  value={cabecera.numero}
                  onChange={(e) => setCabField("numero", e.target.value)}
                  placeholder="F001-000123"
                />
              </div>
              <div className="compra-campo-grupo">
                <label>Proveedor</label>
                <input
                  type="text"
                  value={cabecera.proveedor}
                  onChange={(e) => setCabField("proveedor", e.target.value)}
                  placeholder="Nombre del proveedor"
                />
              </div>
              <div className="compra-campo-grupo compra-campo-wide">
                <label>Observaciones</label>
                <input
                  type="text"
                  value={cabecera.observaciones}
                  onChange={(e) => setCabField("observaciones", e.target.value)}
                  placeholder="Notas adicionales..."
                />
              </div>
            </div>
          </div>

          {/* Líneas de productos */}
          <div className="compras-seccion">
            <div className="compras-seccion-header">
              <h3>Productos comprados</h3>
              <button className="btn-agregar-linea" onClick={agregarLinea} type="button">
                + Agregar producto
              </button>
            </div>

            {detalles.map((item, i) => (
              <FilaDetalle
                key={i}
                index={i}
                item={item}
                productos={productos}
                onChange={handleCampoDetalle}
                onRemove={eliminarLinea}
              />
            ))}
          </div>

          {/* Resumen de totales */}
          <div className="compras-totales">
            <div className="compra-total-row">
              <span>Subtotal</span>
              <span>{formatSol(subtotalCompra)}</span>
            </div>
            <div className="compra-total-row">
              <span>IGV (18%)</span>
              <span>{formatSol(igvCompra)}</span>
            </div>
            <div className="compra-total-row compra-total-final">
              <span>Total</span>
              <span>{formatSol(totalCompra)}</span>
            </div>
          </div>

          {/* Mensajes */}
          {error && <div className="compra-error">{error}</div>}
          {exito && <div className="compra-exito">{exito}</div>}

          {/* Botón guardar */}
          <button
            className="btn-guardar-compra"
            onClick={handleGuardar}
            disabled={guardando || detalles.length === 0}
          >
            {guardando ? "Guardando..." : "💾 Registrar Compra"}
          </button>
        </div>
      )}

      {/* ── Tab: Historial ───────────────────────────────────── */}
      {tab === "historial" && (
        <div className="compras-historial">
          {cargando ? (
            <div className="compra-loading">Cargando historial...</div>
          ) : compras.length === 0 ? (
            <div className="compra-vacio">No hay compras registradas aún.</div>
          ) : (
            <table className="compras-tabla">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Fecha</th>
                  <th>Factura</th>
                  <th>Proveedor</th>
                  <th>Total</th>
                  <th>Estado</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {compras.map((c) => (
                  <tr key={c.id} className={c.estado === "ANULADA" ? "fila-anulada" : ""}>
                    <td>{c.id}</td>
                    <td>{normalizarFechaUTC(c.fecha).toLocaleDateString("es-PE")}</td>
                    <td>{c.numero || "—"}</td>
                    <td>{c.proveedor || "—"}</td>
                    <td>{formatSol(c.total)}</td>
                    <td>
                      <span className={`badge-estado badge-${c.estado?.toLowerCase()}`}>
                        {c.estado}
                      </span>
                    </td>
                    <td>
                      {c.estado !== "ANULADA" && (
                        <button
                          className="btn-icon btn-danger"
                          onClick={() => handleAnular(c.id)}
                          title="Anular compra"
                        >
                          ✕
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
