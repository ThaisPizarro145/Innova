import { useEffect, useState, useMemo } from "react";
import {
  getCajaMovimientos, crearCajaMovimiento, eliminarCajaMovimiento, getVentas, getCompras,
  getAperturaActiva, abrirCaja, cerrarCaja, getCajaAperturas,
} from "../services/api";
import { exportarExcel } from "../utils/exportExcel";

const fmt = (v) => `S/ ${Number(v || 0).toFixed(2)}`;

const TIPOS = [
  { value: "INGRESO", label: "Ingreso", color: "#16a34a", bg: "#dcfce7" },
  { value: "EGRESO", label: "Egreso", color: "#dc2626", bg: "#fee2e2" },
];

// Las ventas y compras registradas en el sistema se suman automáticamente a
// Ingresos/Egresos, por eso no aparecen como categorías manuales aquí.
const CATEGORIAS_CAJA = [
  "Abono de cliente", "Otro ingreso",
  "Alquiler", "Servicios (agua/luz/internet)", "Sueldo / planilla",
  "Transporte / flete", "Mantenimiento",
  "Deuda / préstamo", "Impuestos", "Otro egreso",
];

const estadoInicial = {
  tipo: "INGRESO", categoria: "Abono de cliente",
  descripcion: "", monto: "", fecha: new Date().toISOString().slice(0, 10),
  es_recurrente: false,
};

function exportarExcelCaja(movimientos) {
  const enc = ["Fecha", "Tipo", "Categoria", "Descripcion", "Monto"];
  const filas = movimientos.map((m) => [m.fecha, m.tipo, m.categoria, m.descripcion, Number(m.monto)]);
  exportarExcel("caja", enc, filas, "Caja");
}
function exportarPDFCaja(movimientos, resumen) {
  const filas = movimientos.map((m) => {
    const isIngreso = m.tipo === "INGRESO";
    return `<tr>
      <td>${m.fecha}</td>
      <td style="color:${isIngreso ? "#16a34a" : "#dc2626"};font-weight:600">${m.tipo}</td>
      <td>${m.categoria}</td>
      <td>${m.descripcion || "—"}</td>
      <td style="text-align:right;font-weight:600;color:${isIngreso ? "#16a34a" : "#dc2626"}">${isIngreso ? "+" : "-"}S/ ${Number(m.monto).toFixed(2)}</td>
    </tr>`;
  }).join("");
  const html = `<html><head><title>Caja</title>
  <style>body{font-family:sans-serif;padding:24px}h1{color:#dc2626}
  table{width:100%;border-collapse:collapse;margin-top:16px}
  th,td{border:1px solid #e2e8f0;padding:7px 10px;font-size:12px}
  th{background:#dc2626;color:white}
  .resumen{display:flex;gap:16px;margin:16px 0}
  .res-box{border:1px solid #e2e8f0;border-radius:8px;padding:12px 16px;min-width:130px}
  .res-label{font-size:11px;color:#64748b;text-transform:uppercase;font-weight:600}
  .res-val{font-size:1.3rem;font-weight:700;margin-top:4px}
  </style></head>
  <body>
    <h1>💰 Reporte de Caja</h1>
    <p>Generado el ${new Date().toLocaleString()}</p>
    <div class="resumen">
      <div class="res-box"><div class="res-label">Ingresos</div><div class="res-val" style="color:#16a34a">${fmt(resumen.ingresos)}</div></div>
      <div class="res-box"><div class="res-label">Egresos</div><div class="res-val" style="color:#dc2626">${fmt(resumen.egresos)}</div></div>
      <div class="res-box"><div class="res-label">Saldo</div><div class="res-val" style="color:${resumen.saldo >= 0 ? "#16a34a" : "#dc2626"}">${fmt(resumen.saldo)}</div></div>
    </div>
    <table><thead><tr><th>Fecha</th><th>Tipo</th><th>Categoría</th><th>Descripción</th><th>Monto</th></tr></thead>
    <tbody>${filas}</tbody></table>
  </body></html>`;
  const w = window.open("", "_blank"); w.document.write(html); w.document.close(); w.print();
}

const hoy = () => new Date().toISOString().slice(0, 10);

export default function Caja() {
  const [movimientos, setMovimientos] = useState([]);
  const [ventas, setVentas] = useState([]);
  const [compras, setCompras] = useState([]);
  const [form, setForm] = useState({ ...estadoInicial });
  const [mostrarForm, setMostrarForm] = useState(false);
  const [filtroTipo, setFiltroTipo] = useState("TODOS");
  const [filtroDesde, setFiltroDesde] = useState(hoy());
  const [filtroHasta, setFiltroHasta] = useState(hoy());
  const [mensaje, setMensaje] = useState("");

  // Apertura / cierre de caja
  const [apertura, setApertura] = useState(null);
  const [aperturas, setAperturas] = useState([]);
  const [mostrarApertura, setMostrarApertura] = useState(false);
  const [montoInicial, setMontoInicial] = useState("");
  const [mostrarCierre, setMostrarCierre] = useState(false);
  const [montoContado, setMontoContado] = useState("");
  const [ultimoCierre, setUltimoCierre] = useState(null);

  const cargar = async () => {
    try {
      const [mov, vts, cmp, act, hist] = await Promise.all([
        getCajaMovimientos(), getVentas(), getCompras(), getAperturaActiva(), getCajaAperturas(),
      ]);
      setMovimientos(mov); setVentas(vts); setCompras(cmp);
      setApertura(act); setAperturas(hist);
    } catch (e) { setMensaje(e.message); }
  };

  useEffect(() => { cargar(); }, []);

  const handleAbrirCaja = async () => {
    try {
      await abrirCaja({ monto_inicial: Number(montoInicial) || 0 });
      setMontoInicial(""); setMostrarApertura(false);
      cargar();
    } catch (e) { setMensaje(e.message); }
  };

  const handleCerrarCaja = async () => {
    if (!montoContado) { setMensaje("Ingresa el monto contado en caja."); return; }
    try {
      const resultado = await cerrarCaja({ monto_contado: Number(montoContado) });
      setUltimoCierre(resultado);
      setMontoContado(""); setMostrarCierre(false);
      cargar();
    } catch (e) { setMensaje(e.message); }
  };

  const guardar = async () => {
    if (!form.monto || Number(form.monto) <= 0) { setMensaje("Ingresa un monto válido."); return; }
    if (!form.descripcion.trim() && form.categoria === "") { setMensaje("Ingresa descripción o categoría."); return; }
    try {
      await crearCajaMovimiento({ ...form, monto: Number(form.monto) });
      setMensaje("Movimiento registrado.");
      setForm({ ...estadoInicial, fecha: new Date().toISOString().slice(0, 10) });
      setMostrarForm(false); cargar();
    } catch (e) { setMensaje(e.message); }
  };

  const eliminar = async (id) => {
    if (!window.confirm("¿Eliminar este movimiento?")) return;
    try { await eliminarCajaMovimiento(id); cargar(); }
    catch (e) { setMensaje(e.message); }
  };

  const filtrados = useMemo(() => movimientos.filter((m) => {
    if (filtroTipo !== "TODOS" && m.tipo !== filtroTipo) return false;
    if (filtroDesde && m.fecha < filtroDesde) return false;
    if (filtroHasta && m.fecha > filtroHasta) return false;
    return true;
  }), [movimientos, filtroTipo, filtroDesde, filtroHasta]);

  const enRango = (fechaIso) => {
    const f = String(fechaIso || "").slice(0, 10);
    if (filtroDesde && f < filtroDesde) return false;
    if (filtroHasta && f > filtroHasta) return false;
    return true;
  };

  const ventasFiltradas = useMemo(() =>
    ventas.filter((v) => v.estado !== "ANULADA" && enRango(v.fecha)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ventas, filtroDesde, filtroHasta]);

  const comprasFiltradas = useMemo(() =>
    compras.filter((c) => c.estado !== "ANULADA" && enRango(c.fecha)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [compras, filtroDesde, filtroHasta]);

  const resumen = useMemo(() => {
    const otrosIngresos = filtrados.filter((m) => m.tipo === "INGRESO").reduce((a, m) => a + Number(m.monto), 0);
    const otrosEgresos = filtrados.filter((m) => m.tipo === "EGRESO").reduce((a, m) => a + Number(m.monto), 0);
    const totalVentas = ventasFiltradas.reduce((a, v) => a + Number(v.total || 0), 0);
    const totalCompras = comprasFiltradas.reduce((a, c) => a + Number(c.total || 0), 0);
    const ingresos = totalVentas + otrosIngresos;
    const egresos = totalCompras + otrosEgresos;
    return { ingresos, egresos, saldo: ingresos - egresos, totalVentas, totalCompras, otrosIngresos, otrosEgresos };
  }, [filtrados, ventasFiltradas, comprasFiltradas]);

  // Agrupar egresos por categoría para mostrar cuentas por pagar
  const egresoPorCategoria = useMemo(() => {
    const mapa = {};
    if (resumen.totalCompras > 0) mapa["Compras"] = resumen.totalCompras;
    filtrados.filter((m) => m.tipo === "EGRESO").forEach((m) => {
      mapa[m.categoria] = (mapa[m.categoria] || 0) + Number(m.monto);
    });
    return Object.entries(mapa).sort((a, b) => b[1] - a[1]);
  }, [filtrados, resumen.totalCompras]);

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px", flexWrap: "wrap", gap: "10px" }}>
        <h1>💰 Caja</h1>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          <button type="button" className="btn-export" onClick={() => exportarExcelCaja(filtrados)}>⬇ Excel</button>
          <button type="button" className="btn-export" onClick={() => exportarPDFCaja(filtrados, resumen)}>🖨 PDF</button>
          <button type="button" className="btn-nuevo" onClick={() => { setForm({ ...estadoInicial, fecha: new Date().toISOString().slice(0, 10) }); setMostrarForm(true); }}>
            + Nuevo movimiento
          </button>
        </div>
      </div>

      {/* Apertura / cierre de turno */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "10px",
        background: apertura ? "#f0fdf4" : "#fef2f2", border: `1px solid ${apertura ? "#bbf7d0" : "#fecaca"}`,
        borderRadius: "10px", padding: "12px 16px", marginBottom: "16px",
      }}>
        {apertura ? (
          <span style={{ color: "#16a34a", fontWeight: 600, fontSize: "0.88rem" }}>
            🟢 Caja abierta desde {new Date(apertura.fecha).toLocaleString()} · Monto inicial: {fmt(apertura.monto_inicial)}
          </span>
        ) : (
          <span style={{ color: "#dc2626", fontWeight: 600, fontSize: "0.88rem" }}>🔴 Caja cerrada</span>
        )}
        {apertura ? (
          <button type="button" className="btn-nuevo" onClick={() => setMostrarCierre(true)}>🔒 Cerrar caja</button>
        ) : (
          <button type="button" className="btn-nuevo" onClick={() => setMostrarApertura(true)}>🔓 Abrir caja</button>
        )}
      </div>

      {ultimoCierre && (
        <div style={{ background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: "10px", padding: "14px 16px", marginBottom: "16px" }}>
          <div style={{ fontWeight: 700, color: "#b91c1c", marginBottom: "8px" }}>📄 Resumen del último cierre</div>
          <div style={{ display: "flex", gap: "16px", flexWrap: "wrap", fontSize: "0.85rem" }}>
            <span>Total ventas: <strong>{fmt(ultimoCierre.total_ventas)}</strong></span>
            <span>Efectivo: <strong>{fmt(ultimoCierre.total_efectivo)}</strong></span>
            <span>Tarjeta: <strong>{fmt(ultimoCierre.total_tarjeta)}</strong></span>
            <span>Yape/Plin: <strong>{fmt(ultimoCierre.total_yape_plin)}</strong></span>
            <span>Gastos: <strong>{fmt(ultimoCierre.total_gastos)}</strong></span>
            <span>Saldo final esperado: <strong>{fmt(ultimoCierre.saldo_final)}</strong></span>
            <span style={{ color: Number(ultimoCierre.diferencia) === 0 ? "#16a34a" : "#dc2626" }}>
              Diferencia: <strong>{fmt(ultimoCierre.diferencia)}</strong>
            </span>
          </div>
        </div>
      )}

      {/* Modal abrir caja */}
      {mostrarApertura && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setMostrarApertura(false)}>
          <div className="modal-box" style={{ maxWidth: "400px" }}>
            <div className="modal-header">
              <h2>🔓 Abrir caja</h2>
              <button type="button" className="btn-cerrar" onClick={() => setMostrarApertura(false)}>✕</button>
            </div>
            <form className="formulario-grid" style={{ gridTemplateColumns: "1fr" }} onSubmit={(e) => { e.preventDefault(); handleAbrirCaja(); }}>
              <div className="campo">
                <label>Monto inicial (S/)</label>
                <input type="number" min="0" step="0.01" value={montoInicial}
                  onChange={(e) => setMontoInicial(e.target.value)} placeholder="0.00" autoFocus />
              </div>
              {mensaje && <p className="mensaje">{mensaje}</p>}
              <div className="modal-acciones">
                <button type="submit" className="btn-nuevo">💾 Abrir</button>
                <button type="button" className="btn-cancelar" style={{ background: "#f1f5f9", border: "none", borderRadius: "10px", padding: "10px 18px", cursor: "pointer" }} onClick={() => setMostrarApertura(false)}>Cancelar</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal cerrar caja */}
      {mostrarCierre && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setMostrarCierre(false)}>
          <div className="modal-box" style={{ maxWidth: "400px" }}>
            <div className="modal-header">
              <h2>🔒 Cerrar caja</h2>
              <button type="button" className="btn-cerrar" onClick={() => setMostrarCierre(false)}>✕</button>
            </div>
            <form className="formulario-grid" style={{ gridTemplateColumns: "1fr" }} onSubmit={(e) => { e.preventDefault(); handleCerrarCaja(); }}>
              <div className="campo">
                <label>Monto contado en caja (S/)</label>
                <input type="number" min="0" step="0.01" value={montoContado}
                  onChange={(e) => setMontoContado(e.target.value)} placeholder="0.00" autoFocus />
              </div>
              {mensaje && <p className="mensaje">{mensaje}</p>}
              <div className="modal-acciones">
                <button type="submit" className="btn-nuevo">💾 Cerrar caja</button>
                <button type="button" className="btn-cancelar" style={{ background: "#f1f5f9", border: "none", borderRadius: "10px", padding: "10px 18px", cursor: "pointer" }} onClick={() => setMostrarCierre(false)}>Cancelar</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Cards de resumen */}
      <div className="caja-resumen-cards">
        <div className="caja-card caja-ingreso">
          <div className="caja-card-icon">📥</div>
          <div className="caja-card-val">{fmt(resumen.ingresos)}</div>
          <div className="caja-card-label">Total ingresos</div>
          <div style={{ fontSize: "0.72rem", color: "#64748b", marginTop: "2px" }}>
            Ventas {fmt(resumen.totalVentas)} · Otros {fmt(resumen.otrosIngresos)}
          </div>
        </div>
        <div className="caja-card caja-egreso">
          <div className="caja-card-icon">📤</div>
          <div className="caja-card-val">{fmt(resumen.egresos)}</div>
          <div className="caja-card-label">Total egresos</div>
          <div style={{ fontSize: "0.72rem", color: "#64748b", marginTop: "2px" }}>
            Compras {fmt(resumen.totalCompras)} · Otros {fmt(resumen.otrosEgresos)}
          </div>
        </div>
        <div className={`caja-card ${resumen.saldo >= 0 ? "caja-positivo" : "caja-negativo"}`}>
          <div className="caja-card-icon">{resumen.saldo >= 0 ? "✅" : "⚠️"}</div>
          <div className="caja-card-val">{fmt(resumen.saldo)}</div>
          <div className="caja-card-label">Saldo neto</div>
        </div>
        <div className="caja-card" style={{ background: "#f8fafc" }}>
          <div className="caja-card-icon">📋</div>
          <div className="caja-card-val">{filtrados.length}</div>
          <div className="caja-card-label">Movimientos</div>
        </div>
      </div>

      {/* Desglose de egresos */}
      {egresoPorCategoria.length > 0 && (
        <div style={{ marginTop: "20px", marginBottom: "8px" }}>
          <h2 style={{ marginBottom: "12px" }}>📤 Egresos por categoría</h2>
          <div className="egresos-grid">
            {egresoPorCategoria.map(([cat, total]) => (
              <div key={cat} className="egreso-item">
                <span className="egreso-cat">{cat}</span>
                <span className="egreso-monto">{fmt(total)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {mensaje && <p className="mensaje" style={{ marginTop: "12px" }}>{mensaje}</p>}

      {/* Filtros */}
      <div className="header-filtros" style={{ marginTop: "20px" }}>
        <div style={{ display: "flex", gap: "8px" }}>
          {["TODOS", "INGRESO", "EGRESO"].map((t) => (
            <button key={t} type="button"
              className={`btn-periodo ${filtroTipo === t ? "btn-periodo-activo" : ""}`}
              onClick={() => setFiltroTipo(t)}>
              {t === "TODOS" ? "Todos" : t === "INGRESO" ? "📥 Ingresos" : "📤 Egresos"}
            </button>
          ))}
        </div>
        <div className="filtros-grupo"><label>Desde</label><input type="date" value={filtroDesde} onChange={(e) => setFiltroDesde(e.target.value)} /></div>
        <div className="filtros-grupo"><label>Hasta</label><input type="date" value={filtroHasta} onChange={(e) => setFiltroHasta(e.target.value)} /></div>
        <button type="button" className="btn-periodo" onClick={() => { setFiltroDesde(""); setFiltroHasta(""); }}>Ver todos</button>
      </div>

      {/* Tabla movimientos */}
      <div className="tabla-wrapper" style={{ marginTop: "12px" }}>
        <table className="tabla">
          <thead>
            <tr><th>Fecha</th><th>Tipo</th><th>Categoría</th><th>Descripción</th><th>Monto</th><th></th></tr>
          </thead>
          <tbody>
            {filtrados.length === 0
              ? <tr><td colSpan="6" style={{ textAlign: "center", color: "#94a3b8", padding: "24px" }}>Sin movimientos</td></tr>
              : filtrados.slice().reverse().map((m) => {
                const isIng = m.tipo === "INGRESO";
                return (
                  <tr key={m.id}>
                    <td>{m.fecha}</td>
                    <td>
                      <span className="estado-badge" style={{ background: isIng ? "#dcfce7" : "#fee2e2", color: isIng ? "#16a34a" : "#dc2626" }}>
                        {isIng ? "📥 Ingreso" : "📤 Egreso"}
                      </span>
                    </td>
                    <td>{m.categoria}</td>
                    <td>{m.descripcion || "—"}</td>
                    <td style={{ fontWeight: 700, color: isIng ? "#16a34a" : "#dc2626" }}>
                      {isIng ? "+" : "-"}{fmt(m.monto)}
                    </td>
                    <td>
                      <button type="button" style={{ background: "#ef4444", color: "white", border: "none", borderRadius: "6px", padding: "4px 8px", cursor: "pointer", fontSize: "0.8rem" }}
                        onClick={() => eliminar(m.id)}>🗑️</button>
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>

      {/* Historial de aperturas y cierres */}
      {aperturas.length > 0 && (
        <>
          <h2 style={{ marginTop: "24px", marginBottom: "10px" }}>Historial de aperturas y cierres</h2>
          <div className="tabla-wrapper">
            <table className="tabla">
              <thead>
                <tr>
                  <th>Apertura</th><th>Monto inicial</th><th>Cierre</th><th>Total ventas</th>
                  <th>Efectivo</th><th>Tarjeta</th><th>Yape/Plin</th><th>Gastos</th><th>Diferencia</th><th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {aperturas.map((a) => (
                  <tr key={a.id}>
                    <td>{new Date(a.fecha).toLocaleString()}</td>
                    <td>{fmt(a.monto_inicial)}</td>
                    <td>{a.fecha_cierre ? new Date(a.fecha_cierre).toLocaleString() : "—"}</td>
                    <td>{a.total_ventas != null ? fmt(a.total_ventas) : "—"}</td>
                    <td>{a.total_efectivo != null ? fmt(a.total_efectivo) : "—"}</td>
                    <td>{a.total_tarjeta != null ? fmt(a.total_tarjeta) : "—"}</td>
                    <td>{a.total_yape_plin != null ? fmt(a.total_yape_plin) : "—"}</td>
                    <td>{a.total_gastos != null ? fmt(a.total_gastos) : "—"}</td>
                    <td style={{ color: a.diferencia == null ? undefined : (Number(a.diferencia) === 0 ? "#16a34a" : "#dc2626") }}>
                      {a.diferencia != null ? fmt(a.diferencia) : "—"}
                    </td>
                    <td>
                      <span className="estado-badge" style={{ background: a.estado === "ABIERTA" ? "#dcfce7" : "#f1f5f9", color: a.estado === "ABIERTA" ? "#16a34a" : "#64748b" }}>
                        {a.estado}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Modal nuevo movimiento */}
      {mostrarForm && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setMostrarForm(false)}>
          <div className="modal-box" style={{ maxWidth: "480px" }}>
            <div className="modal-header">
              <h2>➕ Nuevo movimiento de caja</h2>
              <button type="button" className="btn-cerrar" onClick={() => setMostrarForm(false)}>✕</button>
            </div>
            <form className="formulario-grid" onSubmit={(e) => { e.preventDefault(); guardar(); }}>
              {/* Tipo: Ingreso / Egreso */}
              <div className="campo campo-full">
                <label>Tipo</label>
                <div style={{ display: "flex", gap: "8px" }}>
                  {TIPOS.map((t) => (
                    <button key={t.value} type="button"
                      style={{
                        flex: 1, padding: "10px", border: "2px solid",
                        borderColor: form.tipo === t.value ? t.color : "#e2e8f0",
                        borderRadius: "10px", background: form.tipo === t.value ? t.bg : "white",
                        color: form.tipo === t.value ? t.color : "#64748b",
                        fontWeight: 700, cursor: "pointer", transition: "all 0.15s",
                      }}
                      onClick={() => setForm({ ...form, tipo: t.value, categoria: t.value === "INGRESO" ? "Abono de cliente" : "Alquiler" })}>
                      {t.value === "INGRESO" ? "📥 Ingreso" : "📤 Egreso"}
                    </button>
                  ))}
                </div>
              </div>
              <div className="campo">
                <label>Categoría</label>
                <select value={form.categoria} onChange={(e) => setForm({ ...form, categoria: e.target.value })}>
                  {CATEGORIAS_CAJA.filter((c) => {
                    const ingresos = ["Abono de cliente", "Otro ingreso"];
                    return form.tipo === "INGRESO" ? ingresos.includes(c) : !ingresos.includes(c);
                  }).map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div className="campo">
                <label>Fecha</label>
                <input type="date" value={form.fecha} onChange={(e) => setForm({ ...form, fecha: e.target.value })} />
              </div>
              <div className="campo campo-full">
                <label>Descripción</label>
                <input value={form.descripcion} onChange={(e) => setForm({ ...form, descripcion: e.target.value })} placeholder="Ej: Alquiler mes de julio, Pago planilla..." />
              </div>
              <div className="campo campo-full">
                <label>Monto (S/)</label>
                <input type="number" min="0.01" step="0.01" value={form.monto} onChange={(e) => setForm({ ...form, monto: e.target.value })} placeholder="0.00" style={{ fontSize: "1.2rem", fontWeight: 700 }} />
              </div>
              <div className="campo campo-full" style={{ flexDirection: "row", alignItems: "center", gap: "8px" }}>
                <input type="checkbox" id="recurrente" checked={form.es_recurrente}
                  onChange={(e) => setForm({ ...form, es_recurrente: e.target.checked })} />
                <label htmlFor="recurrente" style={{ fontSize: "0.88rem" }}>Gasto recurrente (mensual)</label>
              </div>
              {mensaje && <p className="mensaje campo-full">{mensaje}</p>}
              <div className="modal-acciones campo-full">
                <button type="submit" className="btn-nuevo">💾 Guardar</button>
                <button type="button" className="btn-cancelar" style={{ background: "#f1f5f9", border: "none", borderRadius: "10px", padding: "10px 18px", cursor: "pointer" }} onClick={() => setMostrarForm(false)}>Cancelar</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
