import { useEffect, useState, useMemo } from "react";
import { getReporteResumen } from "../services/api";
import { exportarExcelAOA } from "../utils/exportExcel";

const fmt = (v) => `S/ ${Number(v || 0).toFixed(2)}`;

const PERIODOS = [
  { value: "dia", label: "Hoy" },
  { value: "semana", label: "Esta semana" },
  { value: "mes", label: "Este mes" },
  { value: "año", label: "Este año" },
  { value: "custom", label: "Personalizado" },
];

function exportarExcelReporte(datos, periodo) {
  const rows = [
    ["Período", periodo],
    [],
    ["VENTAS", ""],
    ["Total vendido", datos.totalVentas],
    ["Nº de ventas", datos.numVentas],
    ["Ticket promedio", datos.ticketPromedio],
    [],
    ["COMPRAS", ""],
    ["Total en compras", datos.totalCompras],
    ["Nº de compras", datos.numCompras],
    [],
    ["RESULTADO", ""],
    ["Ganancia bruta", datos.gananciaBruta],
    ["Margen (%)", datos.margen],
    [],
    ["VENTAS POR DÍA", ""],
    ["Fecha", "Total"],
    ...datos.ventasPorDia.map((r) => [r.fecha, r.total]),
  ];
  exportarExcelAOA(`reporte_${periodo}`, rows, "Reporte");
}

function exportarPDFReporte(datos, periodo) {
  const filasDia = datos.ventasPorDia.map((r) =>
    `<tr><td>${r.fecha}</td><td style="text-align:right">S/ ${Number(r.total).toFixed(2)}</td><td style="text-align:right">S/ ${Number(r.costo).toFixed(2)}</td><td style="text-align:right">S/ ${Number(r.ganancia).toFixed(2)}</td></tr>`
  ).join("");
  const html = `<html><head><title>Reporte</title>
  <style>
    body{font-family:sans-serif;padding:24px;color:#1f2937}
    h1{color:#0f6df2}
    .cards{display:flex;gap:16px;flex-wrap:wrap;margin:16px 0}
    .card{border:1px solid #e2e8f0;border-radius:10px;padding:14px 20px;min-width:140px}
    .card-label{font-size:11px;color:#64748b;font-weight:600;text-transform:uppercase}
    .card-val{font-size:1.4rem;font-weight:700;color:#0f172a;margin-top:4px}
    .ganancia{color:#16a34a}
    table{width:100%;border-collapse:collapse;margin-top:16px}
    th,td{border:1px solid #e2e8f0;padding:7px 10px;font-size:12px}
    th{background:#0f6df2;color:white}
  </style></head>
  <body>
    <h1>📊 Reporte — ${periodo}</h1>
    <p>Generado el ${new Date().toLocaleString()}</p>
    <div class="cards">
      <div class="card"><div class="card-label">Total Ventas</div><div class="card-val">${fmt(datos.totalVentas)}</div></div>
      <div class="card"><div class="card-label">Total Compras</div><div class="card-val">${fmt(datos.totalCompras)}</div></div>
      <div class="card"><div class="card-label">Ganancia Bruta</div><div class="card-val ganancia">${fmt(datos.gananciaBruta)}</div></div>
      <div class="card"><div class="card-label">Margen</div><div class="card-val">${Number(datos.margen).toFixed(1)}%</div></div>
      <div class="card"><div class="card-label">Nº Ventas</div><div class="card-val">${datos.numVentas}</div></div>
      <div class="card"><div class="card-label">Ticket Promedio</div><div class="card-val">${fmt(datos.ticketPromedio)}</div></div>
    </div>
    <table>
      <thead><tr><th>Fecha</th><th>Ventas</th><th>Costo</th><th>Ganancia</th></tr></thead>
      <tbody>${filasDia}</tbody>
    </table>
  </body></html>`;
  const w = window.open("", "_blank"); w.document.write(html); w.document.close(); w.print();
}

export default function Reportes() {
  const [periodo, setPeriodo] = useState("mes");
  const [fechaDesde, setFechaDesde] = useState("");
  const [fechaHasta, setFechaHasta] = useState("");
  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => { cargar(); }, [periodo, fechaDesde, fechaHasta]);

  const cargar = async () => {
    setCargando(true); setError("");
    try {
      const res = await getReporteResumen({ periodo, fechaDesde, fechaHasta });
      setDatos(res);
    } catch (e) { setError(e.message); }
    finally { setCargando(false); }
  };

  const labelPeriodo = PERIODOS.find((p) => p.value === periodo)?.label || periodo;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px", flexWrap: "wrap", gap: "10px" }}>
        <h1>📊 Reportes</h1>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          {datos && <button type="button" className="btn-export" onClick={() => exportarExcelReporte(datos, labelPeriodo)}>⬇ Excel</button>}
          {datos && <button type="button" className="btn-export" onClick={() => exportarPDFReporte(datos, labelPeriodo)}>🖨 PDF</button>}
        </div>
      </div>

      {/* Selector de período */}
      <div className="header-filtros" style={{ marginBottom: "20px" }}>
        {PERIODOS.map((p) => (
          <button key={p.value} type="button"
            className={`btn-periodo ${periodo === p.value ? "btn-periodo-activo" : ""}`}
            onClick={() => setPeriodo(p.value)}>
            {p.label}
          </button>
        ))}
        {periodo === "custom" && (
          <>
            <div className="filtros-grupo">
              <label>Desde</label>
              <input type="date" value={fechaDesde} onChange={(e) => setFechaDesde(e.target.value)} />
            </div>
            <div className="filtros-grupo">
              <label>Hasta</label>
              <input type="date" value={fechaHasta} onChange={(e) => setFechaHasta(e.target.value)} />
            </div>
          </>
        )}
      </div>

      {error && <p className="mensaje" style={{ background: "#fee2e2", color: "#991b1b", borderColor: "#fca5a5" }}>{error}</p>}
      {cargando && <p style={{ color: "#64748b", padding: "24px" }}>Cargando...</p>}

      {datos && (
        <>
          {/* KPI cards */}
          <div className="reporte-cards">
            <div className="reporte-card reporte-ventas">
              <div className="reporte-card-icon">🛒</div>
              <div className="reporte-card-val">{fmt(datos.totalVentas)}</div>
              <div className="reporte-card-label">Total vendido</div>
              <div className="reporte-card-sub">{datos.numVentas} ventas</div>
            </div>
            <div className="reporte-card reporte-compras">
              <div className="reporte-card-icon">🚚</div>
              <div className="reporte-card-val">{fmt(datos.totalCompras)}</div>
              <div className="reporte-card-label">Total en compras</div>
              <div className="reporte-card-sub">{datos.numCompras} movimientos</div>
            </div>
            <div className={`reporte-card ${datos.gananciaBruta >= 0 ? "reporte-ganancia" : "reporte-perdida"}`}>
              <div className="reporte-card-icon">{datos.gananciaBruta >= 0 ? "📈" : "📉"}</div>
              <div className="reporte-card-val">{fmt(datos.gananciaBruta)}</div>
              <div className="reporte-card-label">Ganancia bruta</div>
              <div className="reporte-card-sub">Margen {Number(datos.margen).toFixed(1)}%</div>
            </div>
            <div className="reporte-card reporte-ticket">
              <div className="reporte-card-icon">🧾</div>
              <div className="reporte-card-val">{fmt(datos.ticketPromedio)}</div>
              <div className="reporte-card-label">Ticket promedio</div>
              <div className="reporte-card-sub">por venta</div>
            </div>
          </div>

          {/* Tabla ventas por día */}
          <h2 style={{ marginTop: "28px", marginBottom: "12px" }}>Detalle por día</h2>
          <div className="tabla-wrapper">
            <table className="tabla">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Nº Ventas</th>
                  <th>Total Ventas</th>
                  <th>Costo Compras</th>
                  <th>Ganancia</th>
                  <th>Margen</th>
                </tr>
              </thead>
              <tbody>
                {datos.ventasPorDia.length === 0
                  ? <tr><td colSpan="6" style={{ textAlign: "center", color: "#94a3b8" }}>Sin datos para este período</td></tr>
                  : datos.ventasPorDia.map((r, i) => (
                    <tr key={i}>
                      <td>{r.fecha}</td>
                      <td>{r.numVentas ?? "-"}</td>
                      <td>{fmt(r.total)}</td>
                      <td>{fmt(r.costo)}</td>
                      <td style={{ color: r.ganancia >= 0 ? "#16a34a" : "#dc2626", fontWeight: 600 }}>{fmt(r.ganancia)}</td>
                      <td>{r.total > 0 ? `${((r.ganancia / r.total) * 100).toFixed(1)}%` : "—"}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>

          {/* Top productos */}
          {datos.topProductos?.length > 0 && (
            <>
              <h2 style={{ marginTop: "28px", marginBottom: "12px" }}>Top productos más vendidos</h2>
              <div className="tabla-wrapper">
                <table className="tabla">
                  <thead><tr><th>#</th><th>Producto</th><th>Unidades</th><th>Total vendido</th></tr></thead>
                  <tbody>
                    {datos.topProductos.map((p, i) => (
                      <tr key={i}>
                        <td><span className="rank-badge">#{i + 1}</span></td>
                        <td>{p.nombre}</td>
                        <td>{p.cantidad}</td>
                        <td>{fmt(p.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
