import { useEffect, useState } from "react";
import {
  getReporteResumen, getComprasPorProveedor, getComprasPorFecha,
  getStockBajo, getStockSinExistencia, getProductosVencidos, getProximosVencer,
  getCajaAperturas, getCajaMovimientos, getGananciaPorProducto,
} from "../services/api";
import { exportarExcelAOA } from "../utils/exportExcel";

const fmt = (v) => `S/ ${Number(v || 0).toFixed(2)}`;

const PERIODOS = [
  { value: "dia", label: "Hoy" },
  { value: "semana", label: "Esta semana" },
  { value: "mes", label: "Este mes" },
  { value: "año", label: "Este año" },
  { value: "custom", label: "Personalizado" },
];

const TABS = [
  { value: "ventas", label: "🛒 Ventas" },
  { value: "compras", label: "🚚 Compras" },
  { value: "inventario", label: "📋 Inventario" },
  { value: "caja", label: "💰 Caja" },
  { value: "utilidades", label: "📈 Utilidades" },
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
  const [tab, setTab] = useState("ventas");
  const [periodo, setPeriodo] = useState("mes");
  const [fechaDesde, setFechaDesde] = useState("");
  const [fechaHasta, setFechaHasta] = useState("");
  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");

  // Datos de las demás pestañas (se cargan una vez, bajo demanda)
  const [comprasPorProveedor, setComprasPorProveedor] = useState(null);
  const [comprasPorFecha, setComprasPorFecha] = useState(null);
  const [stockBajo, setStockBajo] = useState(null);
  const [sinStock, setSinStock] = useState(null);
  const [vencidos, setVencidos] = useState(null);
  const [proxVencer, setProxVencer] = useState(null);
  const [aperturas, setAperturas] = useState(null);
  const [movimientosCaja, setMovimientosCaja] = useState(null);
  const [gananciaProducto, setGananciaProducto] = useState(null);

  useEffect(() => {
    if (tab === "ventas" || tab === "utilidades") cargarResumen();
    if (tab === "compras" && !comprasPorProveedor) cargarCompras();
    if (tab === "inventario" && !stockBajo) cargarInventario();
    if (tab === "caja" && !aperturas) cargarCaja();
    if (tab === "utilidades" && !gananciaProducto) cargarGanancia();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, periodo, fechaDesde, fechaHasta]);

  const cargarResumen = async () => {
    setCargando(true); setError("");
    try { setDatos(await getReporteResumen({ periodo, fechaDesde, fechaHasta })); }
    catch (e) { setError(e.message); }
    finally { setCargando(false); }
  };

  const cargarCompras = async () => {
    try {
      const [porProveedor, porFecha] = await Promise.all([getComprasPorProveedor(), getComprasPorFecha()]);
      setComprasPorProveedor(porProveedor); setComprasPorFecha(porFecha);
    } catch (e) { setError(e.message); }
  };

  const cargarInventario = async () => {
    try {
      const [bajo, sin, venc, prox] = await Promise.all([
        getStockBajo(), getStockSinExistencia(), getProductosVencidos(), getProximosVencer(30),
      ]);
      setStockBajo(bajo); setSinStock(sin); setVencidos(venc); setProxVencer(prox);
    } catch (e) { setError(e.message); }
  };

  const cargarCaja = async () => {
    try {
      const [hist, movs] = await Promise.all([getCajaAperturas(), getCajaMovimientos()]);
      setAperturas(hist); setMovimientosCaja(movs);
    } catch (e) { setError(e.message); }
  };

  const cargarGanancia = async () => {
    try { setGananciaProducto(await getGananciaPorProducto({ fechaDesde, fechaHasta })); }
    catch (e) { setError(e.message); }
  };

  const labelPeriodo = PERIODOS.find((p) => p.value === periodo)?.label || periodo;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px", flexWrap: "wrap", gap: "10px" }}>
        <h1>📊 Reportes</h1>
        {tab === "ventas" && datos && (
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            <button type="button" className="btn-export" onClick={() => exportarExcelReporte(datos, labelPeriodo)}>⬇ Excel</button>
            <button type="button" className="btn-export" onClick={() => exportarPDFReporte(datos, labelPeriodo)}>🖨 PDF</button>
          </div>
        )}
      </div>

      {/* Tabs de módulo */}
      <div className="compras-tabs" style={{ marginBottom: "16px" }}>
        {TABS.map((t) => (
          <button key={t.value} className={`compras-tab${tab === t.value ? " activo" : ""}`} onClick={() => setTab(t.value)}>
            {t.label}
          </button>
        ))}
      </div>

      {(tab === "ventas" || tab === "utilidades") && (
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
      )}

      {error && <p className="mensaje" style={{ background: "#fee2e2", color: "#991b1b", borderColor: "#fca5a5" }}>{error}</p>}
      {cargando && <p style={{ color: "#64748b", padding: "24px" }}>Cargando...</p>}

      {/* ── Ventas ── */}
      {tab === "ventas" && datos && (
        <>
          <div className="reporte-cards">
            <div className="reporte-card reporte-ventas">
              <div className="reporte-card-icon">🛒</div>
              <div className="reporte-card-val">{fmt(datos.totalVentas)}</div>
              <div className="reporte-card-label">Total vendido</div>
              <div className="reporte-card-sub">{datos.numVentas} ventas</div>
            </div>
            <div className="reporte-card reporte-ticket">
              <div className="reporte-card-icon">🧾</div>
              <div className="reporte-card-val">{fmt(datos.ticketPromedio)}</div>
              <div className="reporte-card-label">Ticket promedio</div>
              <div className="reporte-card-sub">por venta</div>
            </div>
          </div>

          <h2 style={{ marginTop: "28px", marginBottom: "12px" }}>Ventas por día</h2>
          <div className="tabla-wrapper">
            <table className="tabla">
              <thead><tr><th>Fecha</th><th>Nº Ventas</th><th>Total Ventas</th></tr></thead>
              <tbody>
                {datos.ventasPorDia.length === 0
                  ? <tr><td colSpan="3" style={{ textAlign: "center", color: "#94a3b8" }}>Sin datos para este período</td></tr>
                  : datos.ventasPorDia.map((r, i) => (
                    <tr key={i}><td>{r.fecha}</td><td>{r.numVentas ?? "-"}</td><td>{fmt(r.total)}</td></tr>
                  ))}
              </tbody>
            </table>
          </div>

          {datos.topProductos?.length > 0 && (
            <>
              <h2 style={{ marginTop: "28px", marginBottom: "12px" }}>Productos más vendidos</h2>
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

      {/* ── Compras ── */}
      {tab === "compras" && (
        <>
          <h2 style={{ marginBottom: "12px" }}>Compras por proveedor</h2>
          <div className="tabla-wrapper">
            <table className="tabla">
              <thead><tr><th>Proveedor</th><th>Nº compras</th><th>Total</th></tr></thead>
              <tbody>
                {!comprasPorProveedor || comprasPorProveedor.length === 0
                  ? <tr><td colSpan="3" style={{ textAlign: "center", color: "#94a3b8" }}>Sin datos</td></tr>
                  : comprasPorProveedor.map((r, i) => (
                    <tr key={i}><td>{r.proveedor}</td><td>{r.num_compras}</td><td>{fmt(r.total)}</td></tr>
                  ))}
              </tbody>
            </table>
          </div>

          <h2 style={{ marginTop: "28px", marginBottom: "12px" }}>Compras por fecha</h2>
          <div className="tabla-wrapper">
            <table className="tabla">
              <thead><tr><th>Fecha</th><th>Total</th></tr></thead>
              <tbody>
                {!comprasPorFecha || comprasPorFecha.length === 0
                  ? <tr><td colSpan="2" style={{ textAlign: "center", color: "#94a3b8" }}>Sin datos</td></tr>
                  : comprasPorFecha.map((r, i) => (
                    <tr key={i}><td>{r.fecha}</td><td>{fmt(r.total)}</td></tr>
                  ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ── Inventario ── */}
      {tab === "inventario" && (
        <>
          <div className="cards" style={{ marginBottom: "20px" }}>
            <div className="info-card"><h2>{stockBajo?.length ?? "—"}</h2><h3>Stock mínimo</h3></div>
            <div className="info-card"><h2>{sinStock?.length ?? "—"}</h2><h3>Sin stock</h3></div>
            <div className="info-card"><h2>{proxVencer?.length ?? "—"}</h2><h3>Próx. a vencer</h3></div>
            <div className="info-card"><h2>{vencidos?.length ?? "—"}</h2><h3>Vencidos</h3></div>
          </div>
          <p style={{ color: "#64748b", fontSize: "0.85rem" }}>
            El detalle de stock, lotes y kardex completo está disponible en el módulo <strong>Inventario</strong>.
          </p>
        </>
      )}

      {/* ── Caja ── */}
      {tab === "caja" && (
        <>
          <h2 style={{ marginBottom: "12px" }}>Aperturas y cierres</h2>
          <div className="tabla-wrapper">
            <table className="tabla">
              <thead><tr><th>Apertura</th><th>Cierre</th><th>Total ventas</th><th>Gastos</th><th>Diferencia</th><th>Estado</th></tr></thead>
              <tbody>
                {!aperturas || aperturas.length === 0
                  ? <tr><td colSpan="6" style={{ textAlign: "center", color: "#94a3b8" }}>Sin registros</td></tr>
                  : aperturas.map((a) => (
                    <tr key={a.id}>
                      <td>{new Date(a.fecha).toLocaleString()}</td>
                      <td>{a.fecha_cierre ? new Date(a.fecha_cierre).toLocaleString() : "—"}</td>
                      <td>{a.total_ventas != null ? fmt(a.total_ventas) : "—"}</td>
                      <td>{a.total_gastos != null ? fmt(a.total_gastos) : "—"}</td>
                      <td>{a.diferencia != null ? fmt(a.diferencia) : "—"}</td>
                      <td>{a.estado}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>

          <h2 style={{ marginTop: "28px", marginBottom: "12px" }}>Ingresos y egresos manuales</h2>
          <div className="tabla-wrapper">
            <table className="tabla">
              <thead><tr><th>Fecha</th><th>Tipo</th><th>Categoría</th><th>Monto</th></tr></thead>
              <tbody>
                {!movimientosCaja || movimientosCaja.length === 0
                  ? <tr><td colSpan="4" style={{ textAlign: "center", color: "#94a3b8" }}>Sin movimientos</td></tr>
                  : movimientosCaja.map((m) => (
                    <tr key={m.id}>
                      <td>{m.fecha}</td>
                      <td style={{ color: m.tipo === "INGRESO" ? "#16a34a" : "#dc2626", fontWeight: 600 }}>{m.tipo}</td>
                      <td>{m.categoria}</td>
                      <td>{fmt(m.monto)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ── Utilidades ── */}
      {tab === "utilidades" && (
        <>
          {datos && (
            <div className="reporte-cards">
              <div className={`reporte-card ${datos.gananciaBruta >= 0 ? "reporte-ganancia" : "reporte-perdida"}`}>
                <div className="reporte-card-icon">{datos.gananciaBruta >= 0 ? "📈" : "📉"}</div>
                <div className="reporte-card-val">{fmt(datos.gananciaBruta)}</div>
                <div className="reporte-card-label">Ganancia bruta del período</div>
                <div className="reporte-card-sub">Margen {Number(datos.margen).toFixed(1)}%</div>
              </div>
            </div>
          )}
          <h2 style={{ marginTop: "28px", marginBottom: "12px" }}>Ganancia por producto</h2>
          <div className="tabla-wrapper">
            <table className="tabla">
              <thead><tr><th>Producto</th><th>Ingreso</th><th>Costo</th><th>Ganancia</th></tr></thead>
              <tbody>
                {!gananciaProducto || gananciaProducto.length === 0
                  ? <tr><td colSpan="4" style={{ textAlign: "center", color: "#94a3b8" }}>Sin datos</td></tr>
                  : gananciaProducto.map((r, i) => (
                    <tr key={i}>
                      <td>{r.nombre}</td>
                      <td>{fmt(r.ingreso)}</td>
                      <td>{fmt(r.costo)}</td>
                      <td style={{ color: r.ganancia >= 0 ? "#16a34a" : "#dc2626", fontWeight: 700 }}>{fmt(r.ganancia)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
