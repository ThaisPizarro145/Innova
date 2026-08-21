import { useState, useEffect, useCallback } from "react";
import { getProductos, registrarCompra, getCompras, anularCompra, previewCalculoCompra, getProveedores } from "../services/api";
import { normalizarFechaUTC } from "../components/NotaVenta";
import "../styles/Compras.css";

const GANANCIA_DEFAULT = 20;
const TIPOS_COMPROBANTE_COMPRA = ["Factura", "Boleta", "Guía"];

function formatSol(v) {
  return `S/ ${Number(v ?? 0).toFixed(2)}`;
}

/** Presentaciones que un producto tiene habilitadas: Unidad siempre, Caja/Blíster según su ficha. */
function presentacionesDisponibles(producto) {
  if (!producto) return ["Unidad"];
  const lista = ["Unidad"];
  if (producto.unidades_por_caja > 0) lista.push("Caja");
  if (producto.unidades_por_blister > 0) lista.push("Blíster");
  return lista;
}

// ─── Estado inicial de un ítem del formulario ──────────────────────────────────

function itemVacio() {
  return {
    producto_id: "",
    presentacion: "Unidad",
    cantidad_presentacion: 1,
    precio_presentacion: "",
    porcentaje_ganancia: GANANCIA_DEFAULT,
    lote: "",
    fecha_vencimiento: "",
    _preview: null,   // resultado del cálculo en tiempo real
    _loading: false,
  };
}

// ─── Componente FilaDetalle ────────────────────────────────────────────────────

function FilaDetalle({ item, index, productos, onChange, onRemove }) {
  const productoSeleccionado = productos.find((p) => String(p.id) === String(item.producto_id));
  const presentaciones = presentacionesDisponibles(productoSeleccionado);

  // Al cambiar el producto seleccionado, precargar presentación válida
  useEffect(() => {
    if (!productoSeleccionado) return;
    const disponibles = presentacionesDisponibles(productoSeleccionado);
    if (!disponibles.includes(item.presentacion)) {
      onChange(index, "presentacion", disponibles[0]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.producto_id]);

  const preview = item._preview;

  // Recalcular preview cuando cambian los campos relevantes
  useEffect(() => {
    const camposCompletos = Number(item.precio_presentacion) > 0 && item.producto_id;

    if (!camposCompletos) {
      onChange(index, "_preview", null);
      return;
    }

    let cancelled = false;
    onChange(index, "_loading", true);
    const payload = {
      producto_id: Number(item.producto_id),
      presentacion: item.presentacion,
      cantidad_presentacion: Number(item.cantidad_presentacion) || 1,
      precio_presentacion: Number(item.precio_presentacion),
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
    item.producto_id, item.presentacion, item.precio_presentacion,
    item.porcentaje_ganancia, item.cantidad_presentacion,
  ]);

  const set = (campo, valor) => onChange(index, campo, valor);

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
            <option key={p.id} value={p.id}>{p.nombre}{p.marca ? ` (${p.marca})` : ""}</option>
          ))}
        </select>
      </div>

      {/* Presentación + cantidad + precio */}
      <div className="compra-campos-row">
        <div className="compra-campo-grupo">
          <label>Presentación</label>
          <select value={item.presentacion} onChange={(e) => { set("presentacion", e.target.value); set("_preview", null); }}>
            {presentaciones.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
        <div className="compra-campo-grupo">
          <label>Cantidad comprada</label>
          <input type="number" min="1" step="1" value={item.cantidad_presentacion}
            onChange={(e) => set("cantidad_presentacion", e.target.value)} />
        </div>
        <div className="compra-campo-grupo">
          <label>Precio por {item.presentacion} (S/)</label>
          <input type="number" min="0" step="0.01" value={item.precio_presentacion}
            onChange={(e) => set("precio_presentacion", e.target.value)} placeholder="0.00" />
        </div>
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
        <PanelSugerencias preview={preview} item={item} />
      )}
    </div>
  );
}

// ─── Panel de Sugerencias de Precios ─────────────────────────────────────────

const ICONOS_PRESENTACION = { Caja: "📦", Unidad: "🏷️", "Blíster": "💊" };

function PanelSugerencias({ preview, item }) {
  const presentaciones = preview.presentaciones || [];

  return (
    <div className="compra-preview">
      <div className="compra-preview-titulo">
        <span>💡 Costos y precios sugeridos (+{item.porcentaje_ganancia}% ganancia)</span>
      </div>
      <div className="compra-preview-grid">
        {presentaciones.map((p, i) => (
          <div key={i} className="preview-card">
            <span className="preview-card-icon">{ICONOS_PRESENTACION[p.unidad] || "📦"}</span>
            <span className="preview-card-label">{p.unidad}</span>
            <span className="preview-card-costo">Costo: {formatSol(p.costo)}</span>
            <span className="preview-card-precio">Venta: {formatSol(p.precio_venta)}</span>
          </div>
        ))}
        {/* Stock a ingresar */}
        <div className="preview-card preview-card-stock">
          <span className="preview-card-icon">📊</span>
          <span className="preview-card-label">Stock a ingresar</span>
          <span className="preview-card-precio">
            {Number(preview.stock_ingresado).toFixed(2)} unidad(es)
          </span>
          <span className="preview-card-costo">
            Total compra: {formatSol(Number(item.precio_presentacion) * Number(item.cantidad_presentacion))}
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
  const [proveedores, setProveedores] = useState([]);
  const [compras, setCompras] = useState([]);
  const [cargando, setCargando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState(null);
  const [exito, setExito] = useState(null);

  // Cabecera de la compra
  const [cabecera, setCabecera] = useState({
    numero: "",
    tipo_comprobante: "Factura",
    serie: "",
    moneda: "PEN",
    proveedor_nombre: "",
    observaciones: "",
  });

  // Lista de líneas de detalle
  const [detalles, setDetalles] = useState([itemVacio()]);

  // Cargar productos y compras al montar
  useEffect(() => {
    getProductos().then(setProductos).catch(() => {});
    getProveedores().then(setProveedores).catch(() => {});
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

  // Calcular totales de vista. El precio por presentación ya es lo que se paga
  // al proveedor (con IGV incluido): nunca se le suma IGV encima, se
  // desglosa hacia atrás solo para el registro contable.
  const totalCompra = detalles.reduce(
    (acc, d) => acc + (Number(d.precio_presentacion) || 0) * (Number(d.cantidad_presentacion) || 0),
    0
  );
  const subtotalCompra = totalCompra / 1.18;
  const igvCompra = totalCompra - subtotalCompra;

  const handleGuardar = async () => {
    setError(null);
    setExito(null);

    // Validaciones básicas
    const invalidas = detalles.filter(
      (d) => !d.producto_id || !d.precio_presentacion || Number(d.precio_presentacion) <= 0
    );
    if (invalidas.length > 0) {
      setError("Completa todos los campos requeridos (producto y precio) en cada línea.");
      return;
    }

    setGuardando(true);
    try {
      const payload = {
        numero: cabecera.numero || null,
        tipo_comprobante: cabecera.tipo_comprobante || null,
        serie: cabecera.serie || null,
        moneda: cabecera.moneda || "PEN",
        proveedor_nombre: cabecera.proveedor_nombre || null,
        observaciones: cabecera.observaciones || null,
        detalles: detalles.map((d) => ({
          producto_id: Number(d.producto_id),
          presentacion: d.presentacion,
          cantidad_presentacion: Number(d.cantidad_presentacion) || 1,
          precio_presentacion: Number(d.precio_presentacion),
          porcentaje_ganancia: Number(d.porcentaje_ganancia) || GANANCIA_DEFAULT,
          lote: d.lote || null,
          fecha_vencimiento: d.fecha_vencimiento || null,
        })),
      };
      await registrarCompra(payload);
      setExito("✅ Compra registrada. Stock e inventario actualizados.");
      setDetalles([itemVacio()]);
      setCabecera({ numero: "", tipo_comprobante: "Factura", serie: "", moneda: "PEN", proveedor_nombre: "", observaciones: "" });
      // Refrescar productos y proveedores (puede haberse creado uno nuevo)
      getProductos().then(setProductos).catch(() => {});
      getProveedores().then(setProveedores).catch(() => {});
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
            <h3>Datos de la compra</h3>
            <div className="compra-campos-row">
              <div className="compra-campo-grupo">
                <label>Proveedor</label>
                <input
                  type="text"
                  list="lista-proveedores"
                  value={cabecera.proveedor_nombre}
                  onChange={(e) => setCabField("proveedor_nombre", e.target.value)}
                  placeholder="Nombre del proveedor"
                />
                <datalist id="lista-proveedores">
                  {proveedores.map((p) => <option key={p.id} value={p.nombre} />)}
                </datalist>
              </div>
              <div className="compra-campo-grupo">
                <label>Tipo de comprobante</label>
                <select value={cabecera.tipo_comprobante} onChange={(e) => setCabField("tipo_comprobante", e.target.value)}>
                  {TIPOS_COMPROBANTE_COMPRA.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div className="compra-campo-grupo">
                <label>Serie</label>
                <input
                  type="text"
                  value={cabecera.serie}
                  onChange={(e) => setCabField("serie", e.target.value)}
                  placeholder="F001"
                />
              </div>
              <div className="compra-campo-grupo">
                <label>Número</label>
                <input
                  type="text"
                  value={cabecera.numero}
                  onChange={(e) => setCabField("numero", e.target.value)}
                  placeholder="000123"
                />
              </div>
              <div className="compra-campo-grupo">
                <label>Moneda</label>
                <select value={cabecera.moneda} onChange={(e) => setCabField("moneda", e.target.value)}>
                  <option value="PEN">Soles (PEN)</option>
                  <option value="USD">Dólares (USD)</option>
                </select>
              </div>
              <div className="compra-campo-grupo compra-campo-wide">
                <label>Observación</label>
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
                    <td>{c.serie ? `${c.serie}-${c.numero || ""}` : (c.numero || "—")}</td>
                    <td>{c.proveedor_nombre || "—"}</td>
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
