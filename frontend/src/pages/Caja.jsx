import { useEffect, useState, useMemo } from "react";
import { getCajaMovimientos, crearCajaMovimiento, eliminarCajaMovimiento } from "../services/api";

const fmt = (v) => `S/ ${Number(v || 0).toFixed(2)}`;

const TIPOS = [
  { value: "INGRESO", label: "Ingreso", color: "#16a34a", bg: "#dcfce7" },
  { value: "EGRESO", label: "Egreso", color: "#dc2626", bg: "#fee2e2" },
];

const CATEGORIAS_CAJA = [
  "Ventas del día", "Abono de cliente", "Otro ingreso",
  "Alquiler", "Servicios (agua/luz/internet)", "Sueldo / planilla",
  "Compra de mercadería", "Transporte / flete", "Mantenimiento",
  "Deuda / préstamo", "Impuestos", "Otro egreso",
];

const estadoInicial = {
  tipo: "INGRESO", categoria: "Ventas del día",
  descripcion: "", monto: "", fecha: new Date().toISOString().slice(0, 10),
  es_recurrente: false,
};

function exportarExcelCaja(movimientos) {
  const rows = [
    ["Fecha", "Tipo", "Categoría", "Descripción", "Monto"],
    ...movimientos.map((m) => [m.fecha, m.tipo, m.categoria, m.descripcion, Number(m.monto).toFixed(2)]),
  ];
  const csv = rows.map((r) => r.join(",")).join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob); const a = document.createElement("a");
  a.href = url; a.download = "caja.csv"; a.click(); URL.revokeObjectURL(url);
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
  <style>body{font-family:sans-serif;padding:24px}h1{color:#0f6df2}
  table{width:100%;border-collapse:collapse;margin-top:16px}
  th,td{border:1px solid #e2e8f0;padding:7px 10px;font-size:12px}
  th{background:#0f6df2;color:white}
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

export default function Caja() {
  const [movimientos, setMovimientos] = useState([]);
  const [form, setForm] = useState({ ...estadoInicial });
  const [mostrarForm, setMostrarForm] = useState(false);
  const [filtroTipo, setFiltroTipo] = useState("TODOS");
  const [filtroDesde, setFiltroDesde] = useState("");
  const [filtroHasta, setFiltroHasta] = useState("");
  const [mensaje, setMensaje] = useState("");

  useEffect(() => { cargar(); }, []);

  const cargar = async () => {
    try { setMovimientos(await getCajaMovimientos()); }
    catch (e) { setMensaje(e.message); }
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

  const resumen = useMemo(() => {
    const ingresos = filtrados.filter((m) => m.tipo === "INGRESO").reduce((a, m) => a + Number(m.monto), 0);
    const egresos = filtrados.filter((m) => m.tipo === "EGRESO").reduce((a, m) => a + Number(m.monto), 0);
    return { ingresos, egresos, saldo: ingresos - egresos };
  }, [filtrados]);

  // Agrupar egresos por categoría para mostrar cuentas por pagar
  const egresoPorCategoria = useMemo(() => {
    const mapa = {};
    filtrados.filter((m) => m.tipo === "EGRESO").forEach((m) => {
      mapa[m.categoria] = (mapa[m.categoria] || 0) + Number(m.monto);
    });
    return Object.entries(mapa).sort((a, b) => b[1] - a[1]);
  }, [filtrados]);

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

      {/* Cards de resumen */}
      <div className="caja-resumen-cards">
        <div className="caja-card caja-ingreso">
          <div className="caja-card-icon">📥</div>
          <div className="caja-card-val">{fmt(resumen.ingresos)}</div>
          <div className="caja-card-label">Total ingresos</div>
        </div>
        <div className="caja-card caja-egreso">
          <div className="caja-card-icon">📤</div>
          <div className="caja-card-val">{fmt(resumen.egresos)}</div>
          <div className="caja-card-label">Total egresos</div>
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

      {/* Modal nuevo movimiento */}
      {mostrarForm && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setMostrarForm(false)}>
          <div className="modal-box" style={{ maxWidth: "480px" }}>
            <div className="modal-header">
              <h2>➕ Nuevo movimiento de caja</h2>
              <button type="button" className="btn-cerrar" onClick={() => setMostrarForm(false)}>✕</button>
            </div>
            <div className="formulario-grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
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
                      onClick={() => setForm({ ...form, tipo: t.value, categoria: t.value === "INGRESO" ? "Ventas del día" : "Alquiler" })}>
                      {t.value === "INGRESO" ? "📥 Ingreso" : "📤 Egreso"}
                    </button>
                  ))}
                </div>
              </div>
              <div className="campo">
                <label>Categoría</label>
                <select value={form.categoria} onChange={(e) => setForm({ ...form, categoria: e.target.value })}>
                  {CATEGORIAS_CAJA.filter((c) => {
                    const ingresos = ["Ventas del día", "Abono de cliente", "Otro ingreso"];
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
                <button type="button" className="btn-nuevo" onClick={guardar}>💾 Guardar</button>
                <button type="button" className="btn-cancelar" style={{ background: "#f1f5f9", border: "none", borderRadius: "10px", padding: "10px 18px", cursor: "pointer" }} onClick={() => setMostrarForm(false)}>Cancelar</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
