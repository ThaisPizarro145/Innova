import { useEffect, useMemo, useState, useRef } from "react";
import { crearVenta, getProductos, getVentas, anularVenta, eliminarVenta, getClientes, getCategoriasConfig } from "../services/api";
import { useConsultaDoc } from "../hooks/useConsultaDoc";
import { getEmpresa } from "../services/empresa";
import { cantidadEnUnidadesBase, stockAmigable } from "../utils/stock";
import { imprimirNotaVenta, generarComprobanteHTML, imprimirRawBT } from "../components/NotaVenta";
import { imprimirFactura, descargarFacturaHTML } from "../components/factura/Factura";
import { descargarHTMLComoPDF } from "../utils/pdf";

const esComprobanteA4 = (tipoDocumento) => tipoDocumento === "BOLETA" || tipoDocumento === "FACTURA";

const SERIES = { BOLETA: "B001", FACTURA: "F001", NOTA_VENTA: "NV01" };

/** Descarga el comprobante en PDF: A4 para Boleta/Factura, ticket térmico (80mm) para Nota de Venta. */
function descargarComprobanteDirecto(comp) {
  const tipo = TIPOS_COMPROBANTE.find((t) => t.value === comp.tipo_documento) || TIPOS_COMPROBANTE[0];
  const serie = comp.serie || tipo.serial;
  const numero = comp.numero_documento || String(comp.id || "00000001").padStart(8, "0");
  const numeroCompleto = `${serie}-${numero}`;
  const datos = { ...comp, serie, numero_documento: numero, clienteDoc: comp.clienteDni || "" };
  const esA4 = esComprobanteA4(comp.tipo_documento);
  const html = esA4 ? descargarFacturaHTML(datos) : generarComprobanteHTML(datos);
  descargarHTMLComoPDF(html, `comprobante-${numeroCompleto}`, {
    anchoPx: esA4 ? 800 : 420,
    formato: esA4 ? "a4" : "ticket",
  });
}
/**
 * Único punto de armado del comprobante que reciben imprimirNotaVenta/imprimirRawBT.
 * Acepta tanto el comprobante recién creado (camelCase: clienteNombre, clienteDni,
 * clienteDireccion, items...) como una fila de venta del historial (snake_case:
 * cliente_nombre, cliente_dni...) + sus items ya mapeados. Al ser la única función
 * que arma este objeto, la impresión al vender y la reimpresión desde el historial
 * quedan garantizadas idénticas: mismo componente, mismos nombres de campo.
 */
function comprobanteParaImpresion(datos) {
  return {
    tipo_documento: datos.tipo_documento || "NOTA_VENTA",
    serie: datos.serie || SERIES[datos.tipo_documento] || "NV01",
    numero_documento: datos.numero_documento || String(datos.id || "").padStart(8, "0"),
    fecha: datos.fecha,
    clienteNombre: datos.clienteNombre || datos.cliente_nombre || "Cliente general",
    clienteDoc: datos.clienteDoc || datos.clienteDni || datos.cliente_dni || datos.cliente_ruc || "",
    clienteDireccion: datos.clienteDireccion || "",
    // No se persiste por venta en el backend (es solo config global) — se omite
    // siempre para que la venta y la reimpresión nunca difieran en este campo.
    vendedor: "",
    items: datos.items || [],
    subtotal: datos.subtotal ?? datos.total,
    descuento: datos.descuento || 0,
    total: datos.total,
    forma_pago: datos.forma_pago,
    pagos: datos.pagos || [],
  };
}

const formasPago = ["Efectivo", "Yape", "Plin", "Tarjeta", "Transferencia", "Crédito"];
const fmt = (v) => `S/ ${Number(v || 0).toFixed(2)}`;

const TIPOS_COMPROBANTE = [
  { value: "NOTA_VENTA", label: "Nota de Venta",      icon: "🗒️", serial: "NV01" },
  { value: "BOLETA",     label: "Boleta Electrónica",  icon: "🧾", serial: "B001" },
  { value: "FACTURA",    label: "Factura Electrónica", icon: "📄", serial: "F001", requiereRuc: true },
];

function getPrecioPresent(producto, presentacion, categoriasConfig = []) {
  const pp = producto.precios_presentacion || {};
  // Buscar por clave exacta primero, luego case-insensitive
  if (pp[presentacion] !== undefined && pp[presentacion] !== "" && Number(pp[presentacion]) > 0) {
    return Number(pp[presentacion]);
  }
  const keyLower = presentacion.toLowerCase();
  for (const [k, v] of Object.entries(pp)) {
    if (k.toLowerCase() === keyLower && v !== "" && Number(v) > 0) return Number(v);
  }

  // Intentar calcular el precio desde la config de categoría + precio base
  const precioBase = Number(producto.precio_venta || 0);
  if (precioBase > 0) {
    const cat = producto.categoria
      ? categoriasConfig.find((c) => c.nombre === producto.categoria)
      : null;
    const conv = cat?.conversiones?.[keyLower] || {};
    if (conv.tipo === "conteo" && conv.unidades > 0) {
      return +(precioBase * conv.unidades).toFixed(2);
    }
    if (conv.tipo === "peso" && conv.kg > 0) {
      return +(precioBase * conv.kg).toFixed(2);
    }
  }

  // Fallback: precio_venta solo para presentación base
  return precioBase;
}

function permiteDecimalesPresentacion(producto, presentacion, categoriasConfig = []) {
  const cat = producto.categoria
    ? categoriasConfig.find((c) => c.nombre === producto.categoria)
    : null;
  const conv = cat?.conversiones?.[presentacion] || {};
  return conv.tipo === "peso" || conv.tipo === "fraccion" || conv.tipo === "multinivel";
}

function getPresentacionesDisponibles(producto, categoriasConfig = []) {
  // 1. Buscar la config de categoría del producto
  const cat = producto.categoria
    ? categoriasConfig.find((c) => c.nombre === producto.categoria)
    : null;

  // 2. Si hay config con unidades_venta, esas son las presentaciones de venta
  //    (la unidad de compra NO limita las opciones de venta)
  if (cat && Array.isArray(cat.unidades_venta) && cat.unidades_venta.length > 0) {
    return cat.unidades_venta;
  }

  // 3. Fallback: leer las claves de precios_presentacion con precio válido
  const pp = producto.precios_presentacion || {};
  const disponibles = Object.entries(pp)
    .filter(([, v]) => v !== undefined && v !== "" && v !== null && Number(v) > 0)
    .map(([k]) => k);

  if (disponibles.length === 0) {
    return [producto.unidad_base || "unidad"];
  }
  return disponibles;
}

/* ── Modal presentación ── */
function ModalPresentacion({ producto, categoriasConfig, onConfirmar, onCerrar }) {
  const presentaciones = getPresentacionesDisponibles(producto, categoriasConfig);
  const [presentacion, setPresentacion] = useState(presentaciones[0]);
  const [cantidad, setCantidad] = useState(1);
  const [precio, setPrecio] = useState(() => getPrecioPresent(producto, presentaciones[0], categoriasConfig));

  // Actualizar precio cuando cambia la presentación
  const handlePresentacion = (p) => {
    setPresentacion(p);
    setPrecio(getPrecioPresent(producto, p, categoriasConfig));
    if (!permiteDecimalesPresentacion(producto, p, categoriasConfig)) {
      setCantidad((c) => Math.max(1, Math.round(c)));
    }
  };

  const subtotal = Number(precio || 0) * Number(cantidad || 0);

  // Calcular stock disponible en la presentación seleccionada
  const stockBase = Number(producto.stock_actual || 0);
  const basesPorUno = cantidadEnUnidadesBase(producto, presentacion, 1);
  const stockEnPresentacion = basesPorUno > 0 ? stockBase / basesPorUno : stockBase;
  const cantidadEnBase = cantidadEnUnidadesBase(producto, presentacion, Number(cantidad || 0));
  const sinStock = cantidadEnBase > stockBase;

  // Calcular precio unitario mínimo para mostrar desglose
  const cat = producto.categoria
    ? categoriasConfig.find((c) => c.nombre === producto.categoria)
    : null;
  const convPres = cat?.conversiones?.[presentacion] || {};
  const permiteDecimales = convPres.tipo === "peso" || convPres.tipo === "fraccion" || convPres.tipo === "multinivel";

  let desglosePrecio = null;
  if (convPres.tipo === "conteo" && convPres.unidades > 0) {
    const precioUnit = Number(precio || 0) / convPres.unidades;
    desglosePrecio = `S/ ${precioUnit.toFixed(2)} por unidad`;
  } else if (convPres.tipo === "peso" && convPres.kg > 0) {
    const precioKg = Number(precio || 0) / convPres.kg;
    desglosePrecio = `S/ ${precioKg.toFixed(2)} por kg`;
  } else if (convPres.tipo === "fraccion" && convPres.factor) {
    const baseName = convPres.base || "saco";
    const baseConv = cat?.conversiones?.[baseName] || {};
    const kgTotal = (baseConv.kg || 0) * convPres.factor;
    if (kgTotal > 0) {
      const precioKg = Number(precio || 0) / kgTotal;
      desglosePrecio = `= ${kgTotal} kg → S/ ${precioKg.toFixed(2)}/kg`;
    }
  } else if (convPres.tipo === "multinivel" && convPres.kg_por_empaque > 0) {
    const precioKg = Number(precio || 0) / convPres.kg_por_empaque;
    desglosePrecio = `S/ ${precioKg.toFixed(2)} por kg`;
  }

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onCerrar()}>
      <div className="modal-box" style={{ maxWidth: "380px" }}>
        <div className="modal-header">
          <h2>🛒 Agregar al carrito</h2>
          <button type="button" className="btn-cerrar" onClick={onCerrar}>✕</button>
        </div>
        <div style={{ marginBottom: "8px" }}>
          <strong>{producto.nombre}</strong>
          <span style={{ color: "#64748b", fontSize: "0.85rem", marginLeft: "8px" }}>{producto.codigo}</span>
        </div>
        <div className="formulario-grid">
          <div className="campo"><label>Presentación</label>
            <select value={presentacion} onChange={(e) => handlePresentacion(e.target.value)}>
              {presentaciones.map((p) => (
                <option key={p} value={p}>
                  {p.charAt(0).toUpperCase() + p.slice(1)} — {fmt(getPrecioPresent(producto, p, categoriasConfig))}
                </option>
              ))}
            </select>
          </div>
          <div className="campo"><label>Cantidad</label>
            <input type="number" min={permiteDecimales ? "0.01" : "1"} step={permiteDecimales ? "0.01" : "1"} value={cantidad}
              onChange={(e) => {
                const val = Number(e.target.value);
                setCantidad(permiteDecimales ? val : Math.round(val));
              }} />
            <span style={{ fontSize: "0.72rem", color: sinStock ? "#dc2626" : "#64748b" }}>
              {sinStock ? "⚠️ Stock insuficiente" : `Disponible: ${stockEnPresentacion % 1 === 0 ? stockEnPresentacion : stockEnPresentacion.toFixed(2)} ${presentacion}`}
            </span>
          </div>
          <div className="campo campo-full">
            <label>Precio de venta <span style={{ fontWeight: 400, color: "#94a3b8", fontSize: "0.78rem" }}>(editable — mayor/menor)</span></label>
            <input
              type="number" min="0" step="0.01" value={precio}
              onChange={(e) => setPrecio(Number(e.target.value))}
              style={{ fontWeight: 700, color: "#0f6df2", fontSize: "1.1rem", border: "2px solid #bfdbfe", background: "#eff6ff" }}
            />
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "4px", flexWrap: "wrap", gap: "4px" }}>
              <span style={{ fontSize: "0.72rem", color: "#94a3b8" }}>
                Sugerido: {fmt(getPrecioPresent(producto, presentacion, categoriasConfig))} / {presentacion}
              </span>
              {desglosePrecio && (
                <span style={{ fontSize: "0.72rem", color: "#7c3aed", background: "#f5f3ff", borderRadius: "4px", padding: "2px 6px" }}>
                  💡 {desglosePrecio}
                </span>
              )}
            </div>
          </div>
          <div className="campo campo-full"><label>Subtotal</label>
            <div style={{ padding: "10px 12px", background: "#f0fdf4", borderRadius: "9px", border: "1px solid #bbf7d0", fontWeight: "700", fontSize: "1.1rem", color: "#166534" }}>
              {fmt(subtotal)}
            </div>
          </div>
        </div>
        <div className="modal-acciones" style={{ marginTop: "16px" }}>
          <button type="button" className="btn-nuevo"
            onClick={() => onConfirmar({ presentacion, cantidad, precio_unitario: Number(precio) })}
            disabled={sinStock}
            style={sinStock ? { opacity: 0.5, cursor: "not-allowed" } : {}}>
            ✅ Agregar
          </button>
          <button type="button" className="btn-cancelar"
            style={{ background: "#f1f5f9", border: "none", borderRadius: "10px", padding: "10px 18px", cursor: "pointer" }}
            onClick={onCerrar}>Cancelar</button>
        </div>
      </div>
    </div>
  );
}

/* ── Modal selector de tipo de documento (antes de registrar) ── */
function ModalSelectorDocumento({ carrito, subtotal, igv, total, incluyeIgv, clienteSeleccionado, busquedaCliente, formaPago, onConfirmar, onCerrar }) {
  const [tipoDoc, setTipoDoc] = useState("NOTA_VENTA");
  const [registrando, setRegistrando] = useState(false);
  const tipo = TIPOS_COMPROBANTE.find((t) => t.value === tipoDoc);
  const rucCliente = String(clienteSeleccionado?.ruc || "").trim();
  const rucInvalido = tipo.requiereRuc && rucCliente.length !== 11;

  const handleConfirmar = async (accion) => {
    if (tipo.requiereRuc) {
      const ruc = String(clienteSeleccionado?.ruc || "").trim();
      if (!ruc || ruc.length !== 11) {
        alert("Para emitir Factura se requiere el RUC del cliente (11 dígitos).");
        return;
      }
    }
    setRegistrando(true);
    try {
      await onConfirmar(tipoDoc, accion);
    } finally {
      setRegistrando(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onCerrar()}>
      <div className="modal-box" style={{ maxWidth: "480px" }}>
        <div className="modal-header">
          <h2>🧾 Seleccionar tipo de documento</h2>
          <button type="button" className="btn-cerrar" onClick={onCerrar}>✕</button>
        </div>

        <p style={{ fontSize: "0.88rem", color: "#64748b", marginBottom: "16px" }}>
          Elige el documento a emitir. La venta se registrará con el tipo seleccionado.
        </p>

        {/* Selector visual */}
        <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginBottom: "20px" }}>
          {TIPOS_COMPROBANTE.map((t) => (
            <label key={t.value} style={{
              display: "flex", alignItems: "center", gap: "14px", padding: "14px 16px",
              border: `2px solid ${tipoDoc === t.value ? "#0f6df2" : "#e2e8f0"}`,
              borderRadius: "12px", cursor: "pointer",
              background: tipoDoc === t.value ? "#eff6ff" : "#fafafa",
              transition: "all 0.15s",
            }}>
              <input type="radio" name="tipoDoc" value={t.value}
                checked={tipoDoc === t.value} onChange={() => setTipoDoc(t.value)}
                style={{ accentColor: "#0f6df2", width: "18px", height: "18px" }} />
              <span style={{ fontSize: "1.5rem" }}>{t.icon}</span>
              <div>
                <div style={{ fontWeight: 700, fontSize: "0.95rem", color: "#1e293b" }}>{t.label}</div>
                <div style={{ fontSize: "0.78rem", color: "#64748b" }}>
                  Serie: {t.serial}
                  {t.requiereRuc && " · Requiere RUC del cliente"}
                  {t.value === "NOTA_VENTA" && " · No se envía a SUNAT"}
                  {(t.value === "BOLETA" || t.value === "FACTURA") && " · Se envía a SUNAT"}
                </div>
              </div>
            </label>
          ))}
        </div>

        {/* Resumen rápido */}
        <div style={{ background: "#f8fafc", borderRadius: "10px", padding: "12px 16px", marginBottom: "16px", fontSize: "0.88rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between" }}><span>Productos:</span><span>{carrito.length} ítem(s)</span></div>
          <div style={{ display: "flex", justifyContent: "space-between" }}><span>Cliente:</span><span>{clienteSeleccionado ? (clienteSeleccionado.nombre || clienteSeleccionado.razon_social) : (busquedaCliente || "Cliente general")}</span></div>
          <div style={{ display: "flex", justifyContent: "space-between" }}><span>Pago:</span><span>{formaPago}</span></div>
          <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700, marginTop: "6px", fontSize: "1rem", color: "#0f6df2" }}><span>Total:</span><span>{fmt(total)}</span></div>
        </div>

        {rucInvalido && (
          <p style={{ fontSize: "0.82rem", color: "#d97706", background: "#fef9c3", padding: "8px 12px", borderRadius: "8px", marginBottom: "12px" }}>
            ⚠️ Factura requiere RUC del cliente (11 dígitos).
          </p>
        )}

        <div className="modal-acciones" style={{ flexWrap: "wrap", alignItems: "center" }}>
          <button type="button" className="btn-nuevo" onClick={() => handleConfirmar("imprimir")} disabled={registrando}
            style={{ flex: "1 1 auto" }}>
            {registrando ? "⏳ Registrando..." : "Imprimir"}
          </button>
          <button type="button" className="btn-export" onClick={() => handleConfirmar("descargar")} disabled={registrando}
            style={{ flex: "1 1 auto" }}>
            {registrando ? "⏳..." : "Descargar"}
          </button>
          <button type="button" className="btn-cancelar" onClick={onCerrar}
            style={{ flex: "1 1 auto" }}>
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Modal comprobante (muestra voucher luego de registrar) ── */
function ModalComprobante({ comprobante, onImprimir, onImprimirTermico, onImprimirRawBT, onDescargar, onCerrar }) {
  const tipo = TIPOS_COMPROBANTE.find((t) => t.value === comprobante.tipo_documento) || TIPOS_COMPROBANTE[0];
  const serie = comprobante.serie || tipo.serial;
  const numero = comprobante.numero_documento || "00000001";
  const numeroCompleto = `${serie}-${numero}`;

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onCerrar()}>
      <div className="modal-box" style={{ maxWidth: "560px" }}>
        <div className="modal-header">
          <h2>{tipo.icon} {tipo.label}</h2>
          <button type="button" className="btn-cerrar" onClick={onCerrar}>✕</button>
        </div>

        {/* Preview del comprobante */}
        <div className="voucher-preview">
          <div className="voucher-preview-header">
            <div>
              <div style={{ fontWeight: 800, fontSize: "1rem" }}>CORPORACION SOMOS ALIADOS</div>
              <div style={{ fontSize: "0.78rem", color: "#64748b" }}>RUC: 10739759931</div>
              <div style={{ fontSize: "0.75rem", color: "#94a3b8" }}>AV. LA CULTURA PSJ C PUESTO 59 - SANTA ANITA</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontWeight: 700, color: "#0f6df2" }}>{tipo.label.toUpperCase()}</div>
              <div style={{ fontSize: "0.82rem", color: "#475569" }}>{numeroCompleto}</div>
            </div>
          </div>
          <div style={{ fontSize: "0.82rem", color: "#475569", marginBottom: "8px" }}>
            <span>Fecha: {comprobante.fecha}</span>
            {" | "}
            <span>Cliente: {comprobante.clienteNombre}</span>
            {comprobante.clienteDni && <span> | Doc: {comprobante.clienteDni}</span>}
          </div>
          <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
            <table style={{ width: "100%", minWidth: "420px", borderCollapse: "collapse", fontSize: "0.8rem" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid #e2e8f0" }}>
                  <th style={{ textAlign: "left", padding: "4px" }}>Descripción</th>
                  <th style={{ padding: "4px" }}>Cant.</th>
                  <th style={{ padding: "4px" }}>Unid.</th>
                  <th style={{ padding: "4px", textAlign: "right" }}>P.Unit.</th>
                  <th style={{ padding: "4px", textAlign: "right" }}>Total</th>
                </tr>
              </thead>
              <tbody>
                {comprobante.items.map((item, i) => (
                  <tr key={i} style={{ borderBottom: "1px solid #f1f5f9" }}>
                    <td style={{ padding: "4px" }}>{item.nombre}</td>
                    <td style={{ padding: "4px", textAlign: "center" }}>{item.cantidad}</td>
                    <td style={{ padding: "4px", textAlign: "center" }}>{item.presentacion}</td>
                    <td style={{ padding: "4px", textAlign: "right" }}>{fmt(item.precio)}</td>
                    <td style={{ padding: "4px", textAlign: "right" }}>{fmt(item.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ marginTop: "8px", fontSize: "0.85rem", display: "flex", flexDirection: "column", gap: "3px", alignItems: "flex-end" }}>
            <div style={{ display: "flex", gap: "32px" }}><span>Subtotal:</span><span>{fmt(comprobante.subtotal)}</span></div>
            <div style={{ display: "flex", gap: "32px" }}><span>IGV (18%):</span><span>{fmt(comprobante.igv)}</span></div>
            <div style={{ display: "flex", gap: "32px", fontWeight: 800, fontSize: "1rem" }}><span>TOTAL:</span><span>{fmt(comprobante.total)}</span></div>
          </div>
          <div style={{ marginTop: "8px", fontSize: "0.75rem", color: "#94a3b8" }}>Forma de pago: {comprobante.forma_pago}</div>
        </div>

        <div className="modal-acciones" style={{ marginTop: "16px" }}>
          <button type="button" className="btn-nuevo" onClick={() => {
            if (comprobante.tipo_documento === "NOTA_VENTA") {
              onImprimirTermico(comprobante);
            } else {
              onImprimir(comprobante);
            }
          }}>
            Imprimir
          </button>
          <button type="button" className="btn-export" onClick={() => onDescargar(comprobante)}>
            Descargar
          </button>
          <button type="button" className="btn-export"
            style={{ background: "#f0fdf4", color: "#16a34a", border: "1px solid #bbf7d0" }}
            onClick={() => onImprimirRawBT(comprobante)}
            title="Imprimir en impresora térmica Bluetooth vía la app RawBT">
            📱 Bluetooth (RawBT)
          </button>
          <button type="button" className="btn-cancelar" style={{ background: "#f1f5f9", border: "none", borderRadius: "10px", padding: "10px 18px", cursor: "pointer" }} onClick={onCerrar}>Cerrar</button>
        </div>
      </div>
    </div>
  );
}

/* ── Componente principal ── */
function Ventas() {
  const [productos, setProductos] = useState([]);
  const [ventas, setVentas] = useState([]);
  const [categoriasConfig, setCategoriasConfig] = useState([]);
  const [busqueda, setBusqueda] = useState("");
  const [formaPago, setFormaPago] = useState("Efectivo");
  const [carrito, setCarrito] = useState([]);
  const [descuento, setDescuento] = useState(0);
  const [incluyeIgv, setIncluyeIgv] = useState(true);
  const [mensaje, setMensaje] = useState("");
  const [comprobante, setComprobante] = useState(null);

  // Búsqueda de cliente
  const [busquedaCliente, setBusquedaCliente] = useState("");
  const [clienteSeleccionado, setClienteSeleccionado] = useState(null);
  const [sugerenciasCliente, setSugerenciasCliente] = useState([]);
  const [buscandoCliente, setBuscandoCliente] = useState(false);
  const debounceRef = useRef(null);

  const [mostrarCarrito, setMostrarCarrito] = useState(false);
  const [mostrarHistorial, setMostrarHistorial] = useState(false);
  const [mostrarSelectorDoc, setMostrarSelectorDoc] = useState(false);
  const [mostrarVoucher, setMostrarVoucher] = useState(false);
  const [productoParaAgregar, setProductoParaAgregar] = useState(null);

  // Filtros historial
  // Fecha local (no UTC) para que "hoy" no se adelante un día por la diferencia horaria
  const fechaLocal = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const hoy = fechaLocal(new Date());
  const [filtroFechaDesde, setFiltroFechaDesde] = useState(hoy);
  const [filtroFechaHasta, setFiltroFechaHasta] = useState(hoy);

  // Callback cuando ApiInti devuelve datos
  const alRecibirDatosDoc = (data, tipo) => {
    if (tipo === "ruc") {
      setBusquedaCliente(data.razon_social || data.nombre || "");
      setClienteSeleccionado({
        id: null,
        nombre: data.razon_social || data.nombre || "",
        apellidos: "",
        razon_social: data.razon_social || "",
        ruc: data.ruc || busquedaCliente.trim(),
        dni: "",
        direccion: data.direccion || "",
        distrito: data.distrito || "",
        _externo: true,
        _extra: `${data.estado || ""} — ${data.condicion || ""}`,
      });
    } else {
      const nombre = data.nombres || "";
      const apellidos = `${data.apellido_paterno || ""} ${data.apellido_materno || ""}`.trim();
      setBusquedaCliente(`${nombre} ${apellidos}`.trim());
      setClienteSeleccionado({
        id: null,
        nombre,
        apellidos,
        razon_social: "",
        dni: data.dni || busquedaCliente.trim(),
        ruc: "",
        _externo: true,
      });
    }
    setSugerenciasCliente([]);
  };

  const { consultando, errorConsulta, consultarDoc, limpiarConsulta } = useConsultaDoc(alRecibirDatosDoc);

  useEffect(() => { cargarProductos(); cargarVentas(); getCategoriasConfig().then(setCategoriasConfig).catch(() => {}); }, []);
  useEffect(() => { cargarVentas(); }, [filtroFechaDesde, filtroFechaHasta]);

  const cargarProductos = async (q = "") => {
    try { setProductos(await getProductos(q)); } catch (e) { setMensaje(e.message); }
  };
  const cargarVentas = async () => {
    try { setVentas(await getVentas("", filtroFechaDesde, filtroFechaHasta)); } catch (e) { setMensaje(e.message); }
  };
  /* ── Búsqueda de cliente con debounce ── */
  const buscarCliente = (valor) => {
    setBusquedaCliente(valor);
    setClienteSeleccionado(null);
    if (!valor.trim()) { setSugerenciasCliente([]); return; }
    clearTimeout(debounceRef.current);
    setBuscandoCliente(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const lista = await getClientes(valor);
        const termino = valor.trim();
        const exactas = lista.filter((c) => c.dni === termino || c.ruc === termino);
        if (exactas.length === 1) {
          elegirCliente(exactas[0]);
        } else {
          setSugerenciasCliente(lista.slice(0, 6));
        }
      } catch { setSugerenciasCliente([]); }
      finally { setBuscandoCliente(false); }
    }, 300);
  };

  const elegirCliente = (c) => {
    setClienteSeleccionado(c);
    setBusquedaCliente(`${c.nombre || c.razon_social || ""} ${c.apellidos || ""}`.trim());
    setSugerenciasCliente([]);
  };

  const limpiarCliente = () => {
    setClienteSeleccionado(null); setBusquedaCliente(""); setSugerenciasCliente([]);
  };

  /* ── Carrito ── */
  const confirmarAgregarPresent = ({ presentacion, cantidad, precio_unitario }) => {
    const producto = productoParaAgregar;
    const key = `${producto.id}-${presentacion}`;
    setCarrito((prev) => {
      const existe = prev.find((i) => i.key === key);
      if (existe) return prev.map((i) => i.key === key ? { ...i, cantidad: i.cantidad + cantidad } : i);
      return [...prev, { key, producto_id: producto.id, nombre: producto.nombre, presentacion, cantidad, precio_unitario, descuento: 0 }];
    });
    setProductoParaAgregar(null);
  };

  const cambiarCantidad = (key, v) => setCarrito((p) => p.map((i) => i.key === key ? { ...i, cantidad: v } : i));
  const confirmarCantidad = (key) => setCarrito((p) => p.map((i) => {
    if (i.key !== key) return i;
    const n = Number(i.cantidad);
    return { ...i, cantidad: !n || n <= 0 ? 1 : n };
  }));
  const cambiarPrecio  = (key, v) => setCarrito((p) => p.map((i) => i.key === key ? { ...i, precio_unitario: v } : i));
  const cambiarDesc    = (key, v) => { if (v < 0) return; setCarrito((p) => p.map((i) => i.key === key ? { ...i, descuento: v } : i)); };
  const quitarItem     = (key) => setCarrito((p) => p.filter((i) => i.key !== key));

  // El precio ingresado por el usuario es siempre el precio FINAL (con IGV
  // incluido si corresponde): nunca se le suma IGV encima. El subtotal y el
  // IGV se desglosan hacia atrás desde ese total, solo para el comprobante/SUNAT.
  const bruto = useMemo(() => carrito.reduce((a, i) => a + i.precio_unitario * i.cantidad - i.descuento, 0), [carrito]);
  const total = useMemo(() => Number((bruto - descuento).toFixed(2)), [bruto, descuento]);
  const subtotal = useMemo(() => Number((incluyeIgv ? total / 1.18 : total).toFixed(2)), [total, incluyeIgv]);
  const igv = useMemo(() => Number((incluyeIgv ? total - subtotal : 0).toFixed(2)), [total, subtotal, incluyeIgv]);

  /* ── Confirmar venta ── */
  const confirmarVenta = async (tipoDocumento = "NOTA_VENTA", accion = "imprimir") => {
    if (carrito.length === 0) { setMensaje("Agrega productos al carrito antes de confirmar."); return; }
    if (carrito.some((i) => !(Number(i.cantidad) > 0))) { setMensaje("Revisa las cantidades del carrito: no pueden estar vacías o en 0."); return; }
    // Capturar todos los datos ANTES de limpiar
    const itemsCarrito = [...carrito];
    const subtotalActual = subtotal;
    const igvActual = igv;
    const totalActual = total;
    const clienteActual = clienteSeleccionado;
    const busquedaActual = busquedaCliente;
    const formaActual = formaPago;
    const descuentoActual = Number(descuento);

    try {
      const ventaCreada = await crearVenta({
        cliente_id: clienteActual && !clienteActual._externo ? clienteActual.id : null,
        forma_pago: formaActual,
        descuento: descuentoActual,
        incluye_igv: incluyeIgv,
        tipo_documento: tipoDocumento,
        venta_rapida: false,
        cliente_nombre: clienteActual
          ? `${clienteActual.nombre || clienteActual.razon_social || ""} ${clienteActual.apellidos || ""}`.trim()
          : (busquedaActual || null),
        cliente_dni: clienteActual?.dni || null,
        cliente_ruc: clienteActual?.ruc || null,
        detalles: itemsCarrito.map((i) => ({
          producto_id: i.producto_id, cantidad: Number(i.cantidad),
          precio_unitario: Number(i.precio_unitario), descuento: Number(i.descuento),
          presentacion: i.presentacion,
        })),
      });

      // Limpiar carrito y cliente SOLO tras éxito
      setCarrito([]);
      setDescuento(0);
      limpiarCliente();
      setMostrarCarrito(false);
      setMostrarSelectorDoc(false);

      const clienteNombre = clienteActual
        ? `${clienteActual.nombre || clienteActual.razon_social || ""} ${clienteActual.apellidos || ""}`.trim()
        : (busquedaActual || "Cliente general");

      const itemsComprobante = itemsCarrito.map((i) => {
        const prod = productos.find((p) => p.id === i.producto_id);
        return {
          codigo: prod?.codigo || "",
          nombre: i.nombre,
          cantidad: i.cantidad,
          presentacion: i.presentacion,
          lote: prod?.lote || "",
          fecha_vencimiento: prod?.fecha_vencimiento || null,
          precio: Number(i.precio_unitario),
          total: Number(i.precio_unitario * i.cantidad - i.descuento),
        };
      });

      const nuevoComprobante = {
        ...ventaCreada,
        clienteNombre,
        clienteDni: clienteActual?.dni || clienteActual?.ruc || "",
        clienteDireccion: clienteActual?.direccion || "",
        forma_pago: formaActual,
        vendedor: getEmpresa().vendedor || "",
        fecha: new Date().toLocaleString(),
        items: itemsComprobante,
        subtotal: subtotalActual, igv: igvActual, total: totalActual, incluyeIgv,
      };

      setComprobante(nuevoComprobante);
      // Limpiar carrito y cliente ya se hizo arriba tras éxito

      if (accion === "descargar") {
        descargarComprobanteDirecto(nuevoComprobante);
        setMensaje("Venta registrada. Comprobante descargado.");
      } else {
        setMostrarVoucher(true);
        setMensaje("Venta registrada.");
      }
    } catch (e) {
      setMensaje(e.message);
      return;
    }
    cargarVentas().catch(() => {});
  };

  /* ── Imprimir comprobante (Boleta/Factura → A4; ver ModalComprobante) ──
   * serie/numero_documento vienen ya asignados por el backend en `comp`
   * (correlativo real, único e incremental) — no se recalculan aquí. */
  const imprimirComprobante = (comp) => {
    if (!comp) return;
    imprimirFactura({
      ...comp,
      clienteDoc: comp.clienteDni || "",
    });
  };

  /* ── Descargar comprobante como HTML ── */
  const descargarComprobante = (comp) => descargarComprobanteDirecto(comp);

  const anular = async (id) => {
    if (!window.confirm("¿Desea anular esta venta?")) return;
    try { await anularVenta(id); setMensaje("Venta anulada."); cargarVentas(); }
    catch (e) { setMensaje(e.message); }
  };

  const eliminar = async (id) => {
    if (!window.confirm("¿Eliminar esta venta definitivamente?\nSe revertirá el stock de los productos.")) return;
    try { await eliminarVenta(id); setMensaje("Venta eliminada."); cargarVentas(); }
    catch (e) { setMensaje(e.message); }
  };

  const totalItems = carrito.reduce((a, i) => a + i.cantidad, 0);

  return (
    <div>
      {productoParaAgregar && (
        <ModalPresentacion producto={productoParaAgregar}
          categoriasConfig={categoriasConfig}
          onConfirmar={confirmarAgregarPresent}
          onCerrar={() => setProductoParaAgregar(null)} />
      )}
      {mostrarVoucher && comprobante && (
        <ModalComprobante comprobante={comprobante}
          onImprimir={imprimirComprobante}
          onImprimirTermico={(comp) => imprimirNotaVenta(comprobanteParaImpresion(comp))}
          onImprimirRawBT={(comp) => imprimirRawBT(comprobanteParaImpresion(comp))}
          onDescargar={descargarComprobante}
          onCerrar={() => setMostrarVoucher(false)} />
      )}
      {mostrarSelectorDoc && (
        <ModalSelectorDocumento
          carrito={carrito} subtotal={subtotal} igv={igv} total={total}
          incluyeIgv={incluyeIgv} clienteSeleccionado={clienteSeleccionado}
          busquedaCliente={busquedaCliente} formaPago={formaPago}
          onConfirmar={async (tipoDoc, accion) => { await confirmarVenta(tipoDoc, accion); }}
          onCerrar={() => setMostrarSelectorDoc(false)} />
      )}

      {/* Topbar */}
      <div className="ventas-topbar">
        <h1>🛒 Ventas</h1>
        <div className="ventas-topbar-right">
          <div className="ventas-totales">
            <span className="totales-item"><span className="totales-label">Subtotal</span><span className="totales-valor">{fmt(subtotal)}</span></span>
            <span className="totales-sep" />
            <span className="totales-item"><span className="totales-label">IGV</span><span className="totales-valor">{fmt(igv)}</span></span>
            <span className="totales-sep" />
            <span className="totales-item totales-total"><span className="totales-label">Total</span><span className="totales-valor">{fmt(total)}</span></span>
          </div>
          <button type="button" className="btn-carrito" onClick={() => setMostrarCarrito(true)}>
            🛒{totalItems > 0 && <span className="carrito-badge">{Math.round(totalItems * 100) / 100}</span>}
          </button>
          <button type="button" className="btn-nuevo" onClick={() => setMostrarHistorial(true)}>📋 Historial</button>
        </div>
      </div>

      {mensaje && <p className="mensaje">{mensaje}</p>}

      {/* Filtros + búsqueda de cliente */}
      <div className="header-filtros" style={{ marginBottom: "16px" }}>
        <input className="input-busqueda" value={busqueda}
          onChange={(e) => { setBusqueda(e.target.value); cargarProductos(e.target.value); }}
          placeholder="🔍 Buscar producto" />

        {/* Buscador de cliente */}
        <div className="filtros-grupo" style={{ position: "relative", minWidth: "260px" }}>
          <label>Cliente (DNI / RUC / nombre)</label>
          <div style={{ display: "flex", gap: "4px", alignItems: "center" }}>
            <input
              value={busquedaCliente}
              onChange={(e) => { limpiarConsulta(); buscarCliente(e.target.value); }}
              placeholder="DNI, RUC o nombre..."
              style={{ flex: 1, padding: "8px 10px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "0.88rem" }}
            />
            <button type="button" title="Consultar SUNAT/RENIEC"
              disabled={consultando}
              onClick={() => consultarDoc(busquedaCliente)}
              style={{ background: "#0f6df2", color: "white", border: "none", borderRadius: "8px", padding: "8px 10px", cursor: "pointer", fontSize: "0.85rem", whiteSpace: "nowrap" }}>
              {consultando ? "⏳" : "🔍 SUNAT/RENIEC"}
            </button>
            {clienteSeleccionado && (
              <button type="button" onClick={() => { limpiarCliente(); limpiarConsulta(); }}
                style={{ background: "none", border: "none", cursor: "pointer", color: "#ef4444", fontSize: "1rem", padding: "4px" }}>✕</button>
            )}
          </div>
          {errorConsulta && <p style={{ color: "#dc2626", fontSize: "0.78rem", marginTop: "4px" }}>{errorConsulta}</p>}
          {/* Badge cliente seleccionado */}
          {clienteSeleccionado && (
            <div className="cliente-seleccionado-badge">
              <span>✓ {clienteSeleccionado.nombre || clienteSeleccionado.razon_social}</span>
              {(clienteSeleccionado.dni || clienteSeleccionado.ruc) && (
                <span style={{ color: "#166534", marginLeft: "6px" }}>
                  {clienteSeleccionado.dni ? `DNI: ${clienteSeleccionado.dni}` : `RUC: ${clienteSeleccionado.ruc}`}
                </span>
              )}
              {clienteSeleccionado._extra && (
                <span style={{ color: "#64748b", marginLeft: "6px", fontSize: "0.75rem" }}>{clienteSeleccionado._extra}</span>
              )}
            </div>
          )}
          {/* Dropdown sugerencias base local */}
          {sugerenciasCliente.length > 0 && (
            <div className="cliente-dropdown">
              {buscandoCliente && <div className="cliente-dropdown-item" style={{ color: "#94a3b8" }}>Buscando...</div>}
              {sugerenciasCliente.map((c) => (
                <div key={c.id} className="cliente-dropdown-item" onClick={() => elegirCliente(c)}>
                  <span className="cliente-dd-nombre">{c.nombre || c.razon_social || "Sin nombre"} {c.apellidos || ""}</span>
                  <span className="cliente-dd-doc">
                    {c.dni ? `DNI: ${c.dni}` : c.ruc ? `RUC: ${c.ruc}` : ""}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="filtros-grupo"><label>Forma de pago</label>
          <select value={formaPago} onChange={(e) => setFormaPago(e.target.value)}>
            {formasPago.map((f) => <option key={f} value={f}>{f}</option>)}
          </select>
        </div>
        <div className="filtros-grupo" style={{ flexDirection: "row", alignItems: "center", gap: "6px" }}>
          <input type="checkbox" id="igv" checked={incluyeIgv} onChange={(e) => setIncluyeIgv(e.target.checked)} />
          <label htmlFor="igv" style={{ fontSize: "0.88rem", whiteSpace: "nowrap" }}>Incluir IGV</label>
        </div>
      </div>

      {/* Grid productos */}
      <div className="productos-grid">
        {productos.length === 0
          ? <p style={{ gridColumn: "1/-1", color: "#64748b" }}>No hay productos disponibles</p>
          : productos.map((p) => {
            const presentaciones = getPresentacionesDisponibles(p, categoriasConfig);
            const enCarrito = carrito.filter((i) => i.producto_id === p.id);
            return (
              <div key={p.id} className="producto-card" onClick={() => setProductoParaAgregar(p)}>
                <div className="producto-info">
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "6px" }}>
                    <span className="producto-nombre">{p.nombre}</span>
                    {enCarrito.length > 0 && <span className="producto-en-carrito producto-en-carrito-inline">✓ {enCarrito.reduce((a, i) => a + i.cantidad, 0)}</span>}
                  </div>
                  <span className="producto-codigo">{p.codigo}</span>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "3px", marginTop: "4px" }}>
                    {presentaciones.map((pres) => (
                      <span key={pres} className="tag-presentacion" title={`Precio: ${fmt(getPrecioPresent(p, pres, categoriasConfig))}`}>
                        {pres} {fmt(getPrecioPresent(p, pres, categoriasConfig))}
                      </span>
                    ))}
                  </div>
                  <div className="producto-footer">
                    <span className="producto-stock">Stock: {stockAmigable(p, p.stock_actual)}</span>
                  </div>
                </div>
              </div>
            );
          })}
      </div>

      {/* Modal Carrito */}
      {mostrarCarrito && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setMostrarCarrito(false)}>
          <div className="modal-box" style={{ maxWidth: "860px" }}>
            <div className="modal-header">
              <h2>🛒 Carrito de venta</h2>
              <button type="button" className="btn-cerrar" onClick={() => setMostrarCarrito(false)}>✕</button>
            </div>
            {carrito.length === 0
              ? <p style={{ color: "#64748b", padding: "24px 0", textAlign: "center" }}>El carrito está vacío</p>
              : <>
                <div className="tabla-wrapper">
                  <table className="tabla">
                    <thead><tr><th>Producto</th><th>Presentación</th><th>Cant.</th><th>Precio</th><th>Descuento</th><th>Total</th><th></th></tr></thead>
                    <tbody>
                      {carrito.map((item) => (
                        <tr key={item.key}>
                          <td>{item.nombre}</td>
                          <td><span className="tag-presentacion tag-presentacion-lg">{item.presentacion}</span></td>
                          <td><input type="number" className="input-sin-flechas" min="0.01" step="0.01" value={item.cantidad} style={{ width: "70px" }} onChange={(e) => cambiarCantidad(item.key, e.target.value)} onBlur={() => confirmarCantidad(item.key)} /></td>
                          <td><input type="number" min="0" step="0.01" value={item.precio_unitario} style={{ width: "80px" }} onChange={(e) => cambiarPrecio(item.key, Number(e.target.value))} /></td>
                          <td><input type="number" min="0" step="0.01" value={item.descuento} style={{ width: "70px" }} onChange={(e) => cambiarDesc(item.key, Number(e.target.value))} /></td>
                          <td>{fmt(item.precio_unitario * item.cantidad - item.descuento)}</td>
                          <td><button type="button" style={{ background: "#ef4444", color: "white", border: "none", borderRadius: "6px", padding: "5px 9px", cursor: "pointer" }} onClick={() => quitarItem(item.key)}>✕</button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="carrito-resumen">
                  <div className="carrito-resumen-fila"><span>Descuento global:</span>
                    <input type="number" min="0" step="0.01" value={descuento} style={{ width: "90px" }} onChange={(e) => setDescuento(Number(e.target.value))} /></div>
                  <div className="carrito-resumen-fila"><span>Subtotal:</span><strong>{fmt(subtotal)}</strong></div>
                  <div className="carrito-resumen-fila"><span>IGV (18%):</span><strong>{fmt(igv)}</strong></div>
                  <div className="carrito-resumen-fila carrito-total"><span>Total:</span><strong>{fmt(total)}</strong></div>
                </div>
                <div className="modal-acciones" style={{ marginTop: "16px" }}>
                  <button type="button" className="btn-nuevo" onClick={() => { setMostrarCarrito(false); setMensaje(""); setMostrarSelectorDoc(true); }}>✅ Confirmar venta</button>
                  {comprobante && <button type="button" className="btn-export" onClick={() => { setMostrarCarrito(false); setMostrarVoucher(true); }}>🖨️ Ver comprobante</button>}
                  <button type="button" className="btn-cancelar" style={{ background: "#f1f5f9", border: "none", borderRadius: "10px", padding: "10px 18px", cursor: "pointer" }} onClick={() => setMostrarCarrito(false)}>Cerrar</button>
                </div>
              </>}
          </div>
        </div>
      )}

      {/* Modal Historial */}
      {mostrarHistorial && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setMostrarHistorial(false)}>
          <div className="modal-box" style={{ maxWidth: "920px" }}>
            <div className="modal-header">
              <h2>📋 Historial de ventas</h2>
              <button type="button" className="btn-cerrar" onClick={() => setMostrarHistorial(false)}>✕</button>
            </div>
            {/* Filtros de fecha */}
            <div style={{ display: "flex", gap: "12px", alignItems: "flex-end", marginBottom: "14px", flexWrap: "wrap" }}>
              <div className="filtros-grupo" style={{ minWidth: "140px" }}>
                <label>Desde</label>
                <input type="date" value={filtroFechaDesde} onChange={(e) => setFiltroFechaDesde(e.target.value)} />
              </div>
              <div className="filtros-grupo" style={{ minWidth: "140px" }}>
                <label>Hasta</label>
                <input type="date" value={filtroFechaHasta} onChange={(e) => setFiltroFechaHasta(e.target.value)} />
              </div>
              <button type="button" className="btn-export" style={{ padding: "8px 14px", fontSize: "0.85rem" }}
                onClick={() => cargarVentas()}>🔍 Filtrar</button>
              <button type="button" className="btn-cancelar" style={{ background: "#f1f5f9", border: "none", borderRadius: "8px", padding: "8px 12px", fontSize: "0.85rem", cursor: "pointer" }}
                onClick={() => { setFiltroFechaDesde(""); setFiltroFechaHasta(""); }}>Ver todo</button>
              <span style={{ fontSize: "0.82rem", color: "#64748b", alignSelf: "center" }}>{ventas.length} venta(s)</span>
            </div>
            <div className="tabla-wrapper">
              <table className="tabla">
                <thead><tr><th>ID</th><th>Fecha</th><th>Cliente</th><th>Total</th><th>Estado</th><th>Pago</th><th>Acciones</th></tr></thead>
                <tbody>
                  {ventas.length === 0
                    ? <tr><td colSpan="7">No hay ventas en el período seleccionado</td></tr>
                    : ventas.map((v) => (
                      <tr key={v.id}>
                        <td>{v.id}</td>
                        <td>{new Date(v.fecha).toLocaleString()}</td>
                        <td>{v.cliente_nombre || v.cliente_id || "-"}</td>
                        <td>{fmt(v.total)}</td>
                        <td><span className={`estado-badge ${v.estado === "ANULADA" ? "estado-anulada" : "estado-completada"}`}>{v.estado}</span></td>
                        <td>{v.forma_pago}</td>
                        <td style={{ display: "flex", gap: "6px" }}>
                          <button type="button" className="btn-export" style={{ padding: "5px 9px", fontSize: "0.8rem" }} onClick={() => imprimirVentaHistorial(v, productos)}>🖨️</button>
                          {(v.tipo_documento === "NOTA_VENTA" || !v.tipo_documento) && (
                            <button type="button" className="btn-export"
                              style={{ padding: "5px 9px", fontSize: "0.8rem", background: "#f0fdf4", color: "#16a34a", border: "1px solid #bbf7d0" }}
                              title="Imprimir en impresora térmica Bluetooth vía la app RawBT"
                              onClick={() => imprimirVentaHistorialRawBT(v, productos)}>📱</button>
                          )}
                          <button type="button" className="btn-export" style={{ padding: "5px 9px", fontSize: "0.8rem" }} onClick={() => descargarVentaHistorial(v, productos)}>⬇️</button>
                          {v.estado !== "ANULADA" && <button type="button" style={{ background: "#f59e0b", color: "white", border: "none", borderRadius: "6px", padding: "5px 9px", cursor: "pointer", fontSize: "0.8rem" }} onClick={() => anular(v.id)}>Anular</button>}
                          <button type="button" style={{ background: "#ef4444", color: "white", border: "none", borderRadius: "6px", padding: "5px 9px", cursor: "pointer", fontSize: "0.8rem" }} onClick={() => eliminar(v.id)}>🗑️</button>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
            <div style={{ marginTop: "16px", textAlign: "right" }}>
              <button type="button" className="btn-cancelar" style={{ background: "#f1f5f9", border: "none", borderRadius: "10px", padding: "10px 18px", cursor: "pointer" }} onClick={() => setMostrarHistorial(false)}>Cerrar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** Mapea los detalles guardados en backend a los ítems que esperan los comprobantes. */
function itemsDesdeVenta(venta, productos = []) {
  return (venta.detalles || []).map((d) => {
    const prod = productos.find((p) => p.id === d.producto_id);
    return {
      codigo: prod?.codigo || "",
      nombre: d.nombre_producto || d.nombre || `Producto #${d.producto_id}`,
      cantidad: d.cantidad,
      presentacion: d.presentacion || "UND",
      lote: d.lote || "",
      fecha_vencimiento: d.fecha_vencimiento || null,
      precio: d.precio_unitario,
      total: d.total || d.precio_unitario * d.cantidad,
    };
  });
}

function imprimirVentaHistorial(venta, productos = []) {
  if (venta.tipo_documento === "NOTA_VENTA" || !venta.tipo_documento) {
    // Ticket térmico para Nota de Venta — mismo armado que al vender (comprobanteParaImpresion)
    imprimirNotaVenta(comprobanteParaImpresion({ ...venta, items: itemsDesdeVenta(venta, productos) }));
    return;
  }
  // Boleta / Factura → comprobante A4
  imprimirFactura({
    tipo_documento: venta.tipo_documento,
    serie: venta.serie,
    numero_documento: venta.numero_documento || String(venta.id).padStart(8, "0"),
    fecha: venta.fecha,
    clienteNombre: venta.cliente_nombre || "Cliente general",
    clienteDni: venta.cliente_dni || venta.cliente_ruc || "",
    forma_pago: venta.forma_pago,
    subtotal: venta.subtotal,
    igv: venta.igv,
    total: venta.total,
    items: itemsDesdeVenta(venta, productos),
  });
}

function imprimirVentaHistorialRawBT(venta, productos = []) {
  // Mismo armado que al vender (comprobanteParaImpresion) — impresión y reimpresión idénticas.
  imprimirRawBT(comprobanteParaImpresion({ ...venta, items: itemsDesdeVenta(venta, productos) }));
}

function descargarVentaHistorial(venta, productos = []) {
  descargarComprobanteDirecto({
    tipo_documento: venta.tipo_documento || "NOTA_VENTA",
    serie: venta.serie,
    numero_documento: venta.numero_documento || String(venta.id).padStart(8, "0"),
    id: venta.id,
    fecha: new Date(venta.fecha).toLocaleString(),
    clienteNombre: venta.cliente_nombre || "Cliente general",
    clienteDni: venta.cliente_dni || venta.cliente_ruc || "",
    forma_pago: venta.forma_pago,
    subtotal: venta.subtotal,
    igv: venta.igv,
    total: venta.total,
    items: itemsDesdeVenta(venta, productos),
  });
}

export default Ventas;
