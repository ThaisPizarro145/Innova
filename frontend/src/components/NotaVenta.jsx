/**
 * NotaVenta.jsx — Ticket térmico profesional
 * Compatible: 58mm / 80mm | HTML/CSS (impresión por navegador y RawBT vía imagen)
 * Solo diseño — lógica del sistema intacta.
 */
import html2canvas from "html2canvas";
import { getEmpresa } from "../services/empresa";

/** Datos de la empresa configurados en ⚙ Configuración (localStorage), leídos en cada impresión. */
export function datosEmpresa() {
  const e = getEmpresa();
  return {
    nombre:    e.nombre || "MI BODEGA",
    ruc:       e.ruc || "",
    direccion: e.direccion || "",
    ciudad:    [e.distrito, e.provincia || e.departamento].filter(Boolean).join(" - "),
    correo:    e.email || "",
    celular:   e.telefono || "",
  };
}

const f2 = (v) => Number(v || 0).toFixed(2);

/**
 * Interpreta una fecha devuelta por el backend como Date correcto en hora
 * local del navegador. El backend guarda `fecha` en UTC (datetime.utcnow())
 * y lo serializa SIN sufijo de zona horaria (ej. "2026-07-31T16:40:09.75").
 * Un `new Date(...)` directo sobre ese string lo interpreta como si ya
 * fuera hora LOCAL (no UTC), adelantando la hora mostrada según el huso
 * horario del usuario (en Perú, +5h) — por eso reimprimir desde el
 * historial mostraba una hora distinta a la de la impresión al vender.
 * Forzamos el sufijo "Z" solo en ese caso para que se interprete como UTC
 * y el navegador la convierta a hora local correctamente.
 */
export function normalizarFechaUTC(f) {
  if (!f) return new Date();
  if (f instanceof Date) return isNaN(f) ? new Date() : f;
  const s = String(f);
  const esIsoSinZona = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s) && !/(Z|[+-]\d{2}:?\d{2})$/.test(s);
  const d = new Date(esIsoSinZona ? `${s}Z` : s);
  return isNaN(d.getTime()) ? new Date() : d;
}

/** Arma los estilos y el cuerpo HTML del ticket, sin el envoltorio <html>/<head>/<body>. */
function construirTicket(comprobante, opciones = {}) {
  const {
    fontFamily = "'Courier New', Courier, monospace",
    escala     = 1,   // multiplicador de todos los font-size del ticket
    pesoBase   = 700, // font-weight del cuerpo del ticket
  } = opciones;
  const t = (px) => `${Math.round(px * escala * 10) / 10}px`;
  const EMPRESA = datosEmpresa();
  const {
    tipo_documento   = "NOTA_VENTA",
    serie            = "NV01",
    numero_documento = "00000001",
    fecha,
    clienteNombre    = "CLIENTES VARIOS",
    clienteDoc       = "",
    clienteDireccion = "",
    vendedor         = "",
    caja             = "",
    items            = [],
    subtotal         = 0,
    descuento        = 0,
    igv              = 0,
    total            = 0,
    pagos            = [],
    forma_pago       = "Efectivo",
    observaciones    = "",
    numero_operacion = "",
  } = comprobante;

  const esNota        = tipo_documento === "NOTA_VENTA";
  const esBoleta      = tipo_documento === "BOLETA";
  const esFactura     = tipo_documento === "FACTURA";
  const esElectronico = esBoleta || esFactura;

  const titulo = esNota
    ? "NOTA DE VENTA"
    : esBoleta
    ? "BOLETA DE VENTA"
    : "FACTURA ELECTRÓNICA";

  const numeroCompleto = `${serie}-${String(numero_documento).padStart(8, "0")}`;

  // ── Fecha / hora ──────────────────────────────────────────
  const pad2 = (n) => String(n).padStart(2, "0");

  // fecha puede ser: ISO string, string localizado, Date, o null
  function parsarFecha(f) {
    if (!f) return new Date();
    if (f instanceof Date) return isNaN(f) ? new Date() : f;
    // Si ya es string localizado tipo "24/7/2026, 14:32:00" — extraer directamente
    const matchLocal = String(f).match(/(\d{1,2})\/(\d{1,2})\/(\d{4})[,\s]+(\d{1,2}):(\d{2})/);
    if (matchLocal) {
      const [, dia, mes, anio, h, m] = matchLocal;
      return new Date(Number(anio), Number(mes)-1, Number(dia), Number(h), Number(m));
    }
    // ISO u otro formato estándar (fecha del backend, en UTC)
    return normalizarFechaUTC(f);
  }

  const d = parsarFecha(fecha);
  const fechaStr = `${pad2(d.getDate())}/${pad2(d.getMonth()+1)}/${d.getFullYear()}`;
  const horaStr  = `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;

  // ── Pagos ─────────────────────────────────────────────────
  const listaPagos  = pagos.length > 0 ? pagos : [{ tipo: forma_pago, monto: total }];
  const totalPagado = listaPagos.reduce((a, p) => a + Number(p.monto || 0), 0);
  const vuelto      = Math.max(0, totalPagado - Number(total));

  // ── Datos del cliente ─────────────────────────────────────
  const camposCliente = [
    ["Fecha",      fechaStr],
    ["Hora",       horaStr],
    ["Cliente",    (clienteNombre || "CLIENTES VARIOS").toUpperCase()],
    clienteDoc       ? ["Documento",  clienteDoc]       : null,
    clienteDireccion ? ["Dirección",  clienteDireccion] : null,
    vendedor         ? ["Vendedor",   vendedor]          : null,
    caja             ? ["Caja",       caja]              : null,
    numero_operacion ? ["Operación",  numero_operacion]  : null,
  ].filter(Boolean);

  const datosClienteHTML = camposCliente.map(([etq, val]) => `
    <tr>
      <td class="c-etq">${etq}</td>
      <td class="c-sep">:</td>
      <td class="c-val">${val}</td>
    </tr>`).join("");

  // ── Detalle de productos ──────────────────────────────────
  const filasProductos = items.map((item) => {
    const cant    = Number(item.cantidad || 0);
    const precio  = Number(item.precio || 0);
    const tot     = Number(item.total ?? cant * precio);
    const cantStr = cant % 1 === 0 ? String(cant) : cant.toFixed(2);
    const und     = (item.presentacion || "UND").toUpperCase();
    const desc    = (item.nombre || "").toUpperCase();
    const undTag  = und !== "UND" ? ` <span class="d-und-tag">(${und})</span>` : "";
    return `
      <tr class="det-row">
        <td class="d-cant">${cantStr}</td>
        <td class="d-desc">${desc}${undTag}</td>
        <td class="d-tot">S/${f2(tot)}</td>
      </tr>`;
  }).join("");

  // ── Totales ───────────────────────────────────────────────
  const hayDescuento = Number(descuento) > 0;
  const hayIgv       = !esNota && Number(igv) > 0;

  const totalesRows = [
    `<tr class="t-row"><td>Subtotal</td><td>S/ ${f2(subtotal)}</td></tr>`,
    hayDescuento ? `<tr class="t-row"><td>Descuento</td><td>- S/ ${f2(descuento)}</td></tr>` : "",
    hayIgv       ? `<tr class="t-row"><td>IGV (18%)</td><td>S/ ${f2(igv)}</td></tr>`        : "",
  ].join("");

  // ── Pagos ─────────────────────────────────────────────────
  const pagosRows = listaPagos.map((p) =>
    `<tr class="t-row"><td>${p.tipo || forma_pago}</td><td>S/ ${f2(p.monto)}</td></tr>`
  ).join("");

  const vueltoRow = vuelto > 0
    ? `<tr class="t-row t-vuelto"><td>Vuelto</td><td>S/ ${f2(vuelto)}</td></tr>`
    : "";

  const estilos = `
    /* ── Reset ───────────────────────────────────────── */
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    /* ── Página de impresión ─────────────────────────── */
    @page {
      size: 80mm auto;
      margin: 3mm 1.5mm;
    }

    /* ── Body ────────────────────────────────────────── */
    body {
      font-family: ${fontFamily};
      font-size: ${t(18)};
      font-weight: ${pesoBase};
      line-height: 1.55;
      color: #000;
      background: #fff;
      width: 100%;
      max-width: 420px;
      margin: 0 auto;
      padding: 4px 3px 14px 3px;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
      -webkit-font-smoothing: none;
    }

    /* ── Encabezado empresa ──────────────────────────── */
    .emp-nombre {
      font-size: ${t(19)};
      font-weight: 900;
      text-align: center;
      letter-spacing: 0.4px;
      line-height: 1.3;
    }
    .emp-info {
      font-size: ${t(14.5)};
      font-weight: 700;
      text-align: center;
      line-height: 1.6;
      margin-top: 3px;
    }

    /* ── Separadores ─────────────────────────────────── */
    .sep       { border: none; border-top: 1.5px dashed #000; margin: 6px 0; }
    .sep-fuerte{ border: none; border-top: 3px solid  #000; margin: 6px 0; }

    /* ── Tipo de comprobante ─────────────────────────── */
    .comp-titulo {
      font-size: ${t(21)};
      font-weight: 900;
      text-align: center;
      letter-spacing: 2.5px;
      margin: 5px 0 3px 0;
    }
    .comp-numero {
      font-size: ${t(18)};
      font-weight: 800;
      text-align: center;
      letter-spacing: 0.5px;
    }

    /* ── Tabla datos cliente ─────────────────────────── */
    .tbl-cliente {
      width: 100%;
      border-collapse: collapse;
      font-size: ${t(15.5)};
      line-height: 1.7;
    }
    .c-etq { font-weight: 900; white-space: nowrap; padding-right: 4px; width: 92px; }
    .c-sep { padding: 0 2px; width: 8px; }
    .c-val { font-weight: 700; word-break: break-word; }

    /* ── Tabla detalle productos ─────────────────────── */
    .tbl-det {
      width: 100%;
      border-collapse: collapse;
      font-size: ${t(16)};
    }
    .det-thead th {
      font-weight: 900;
      font-size: ${t(15)};
      padding: 2px 2px 4px 2px;
      border-bottom: 2px solid #000;
    }
    .d-cant { text-align: left;  width: 32px;  padding-right: 6px; white-space: nowrap; }
    .d-desc { text-align: left;  word-break: break-word; padding-right: 6px; font-weight: 800; }
    .d-tot  { text-align: right; width: 96px;  white-space: nowrap; font-variant-numeric: tabular-nums; }

    .det-row td { padding: 4px 2px; vertical-align: top; }
    .d-und-tag { font-weight: 600; font-size: 0.72em; }

    /* ── Tabla totales ───────────────────────────────── */
    .tbl-tot {
      width: 100%;
      border-collapse: collapse;
      font-size: ${t(15)};
    }
    .t-row td { padding: 2px 2px; line-height: 1.65; font-weight: 700; }
    .t-row td:first-child { text-align: left; }
    .t-row td:last-child  { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }

    /* Vuelto */
    .t-vuelto td { font-weight: 900; }

    /* ── Bloque TOTAL A PAGAR (destacado) ────────────── */
    .total-block {
      text-align: center;
      padding: 4px 0 2px 0;
    }
    .total-label {
      font-size: ${t(17)};
      font-weight: 900;
      letter-spacing: 1.5px;
      margin-bottom: 3px;
    }
    .total-monto {
      font-size: ${t(30)};
      font-weight: 900;
      letter-spacing: 0.5px;
    }

    /* ── Sección forma de pago ───────────────────────── */
    .pagos-titulo {
      font-size: ${t(17)};
      font-weight: 900;
      text-align: center;
      margin: 4px 0 2px 0;
      letter-spacing: 0.5px;
    }
    .pagos-fecha {
      font-size: ${t(14)};
      font-weight: 700;
      text-align: center;
      margin-bottom: 3px;
    }

    /* ── Pie ─────────────────────────────────────────── */
    .pie {
      text-align: center;
      font-size: ${t(14.5)};
      font-weight: 700;
      line-height: 1.75;
      margin-top: 4px;
    }
    .pie-gracias {
      font-size: ${t(19)};
      font-weight: 900;
    }
    .pie-electronico {
      font-size: ${t(13)};
      font-style: italic;
      margin-top: 4px;
    }
  `;

  const cuerpo = `
  <!-- ═══ ENCABEZADO ═══════════════════════════════════ -->
  <div class="emp-nombre">${EMPRESA.nombre}</div>
  <div class="emp-info">
    RUC: ${EMPRESA.ruc}<br>
    Dirección: ${EMPRESA.direccion}, ${EMPRESA.ciudad}<br>
    Correo: ${EMPRESA.correo}<br>
    Teléfono: ${EMPRESA.celular}
  </div>

  <hr class="sep">

  <!-- ═══ TIPO DE COMPROBANTE ══════════════════════════ -->
  <div class="comp-titulo">${titulo}</div>
  <div class="comp-numero">${numeroCompleto}</div>

  <hr class="sep">

  <!-- ═══ DATOS DEL CLIENTE ════════════════════════════ -->
  <table class="tbl-cliente">
    <tbody>${datosClienteHTML}</tbody>
  </table>

  <hr class="sep">

  <!-- ═══ DETALLE DE PRODUCTOS ═════════════════════════ -->
  <table class="tbl-det">
    <thead class="det-thead">
      <tr>
        <th class="d-cant">Cant</th>
        <th class="d-desc">Descripción</th>
        <th class="d-tot">Total</th>
      </tr>
    </thead>
    <tbody>${filasProductos}</tbody>
  </table>

  <hr class="sep">

  <!-- ═══ RESUMEN DE TOTALES ════════════════════════════ -->
  <table class="tbl-tot">
    <tbody>
      ${totalesRows}
    </tbody>
  </table>
  <hr class="sep-fuerte">
  <div class="total-block">
    <div class="total-label">TOTAL A PAGAR</div>
    <div class="total-monto">S/ ${f2(total)}</div>
  </div>
  <hr class="sep-fuerte">

  <!-- ═══ PAGOS ════════════════════════════════════════ -->
  <div class="pagos-titulo">Forma de Pago</div>
  <div class="pagos-fecha">${fechaStr} ${horaStr}</div>
  <table class="tbl-tot">
    <tbody>
      ${pagosRows}
      ${vueltoRow}
    </tbody>
  </table>

  <hr class="sep">

  ${observaciones
    ? `<div style="font-size:${t(14)};font-weight:700;margin:3px 0;">${observaciones}</div><hr class="sep">`
    : ""}

  <!-- ═══ PIE ══════════════════════════════════════════ -->
  <div class="pie">
    <div class="pie-gracias">¡Gracias por su compra!</div>
    <div>${EMPRESA.nombre}</div>
    <div>Vuelva pronto.</div>
    ${esElectronico
      ? `<div class="pie-electronico">Representación impresa del<br>comprobante electrónico</div>`
      : ""}
  </div>
  `;

  return { estilos, cuerpo, titulo, numeroCompleto };
}

function generarTicketHTML(comprobante, opciones = {}) {
  const { estilos, cuerpo, titulo, numeroCompleto } = construirTicket(comprobante, opciones);
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8"/>
  <title>${titulo} ${numeroCompleto}</title>
  <style>${estilos}</style>
</head>
<body>${cuerpo}</body>
</html>`;
}

// Ancho de renderizado del ticket en px (coincide con el max-width del CSS).
// RawBT escala la imagen recibida al ancho físico del papel (58mm u 80mm).
const RAWBT_ANCHO_PX = 420;

/**
 * Imprime el comprobante en una impresora térmica Bluetooth vía la app
 * RawBT (Android). RawBT no soporta imprimir HTML directamente (con
 * type=text/html solo lo abre en el navegador), así que el ticket se
 * renderiza a una imagen PNG con html2canvas (manteniendo tabla,
 * tipografía y negritas del diseño HTML) y se envía como imagen —
 * formato que RawBT sí imprime tal cual se ve. Si RawBT no está
 * instalada, Android ofrece instalarla desde Play Store automáticamente.
 */
export async function imprimirRawBT(comprobante) {
  const html = generarTicketHTML(comprobante, {
    fontFamily: "Arial, Helvetica, sans-serif",
    escala: 1.5,
    pesoBase: 900,
  });

  // Se renderiza dentro de un iframe aislado (no un <div> del documento
  // principal) para que los estilos del ticket no se filtren a la app.
  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.left = "-9999px";
  iframe.style.top = "0";
  iframe.style.width = `${RAWBT_ANCHO_PX}px`;
  iframe.style.height = "1px";
  iframe.style.border = "none";
  document.body.appendChild(iframe);

  try {
    await new Promise((resolve) => {
      iframe.onload = resolve;
      iframe.srcdoc = html;
    });

    const canvas = await html2canvas(iframe.contentDocument.body, {
      backgroundColor: "#ffffff",
      scale: 2,
      width: RAWBT_ANCHO_PX,
      windowWidth: RAWBT_ANCHO_PX,
    });
    const base64 = canvas.toDataURL("image/png").split(",")[1];
    const intentUrl = `intent:data:image/png;base64,${base64}#Intent;scheme=rawbt;package=ru.a402d.rawbtprinter;end;`;
    window.location.href = intentUrl;
  } finally {
    document.body.removeChild(iframe);
  }
}

/** Abre ventana emergente e imprime el ticket. */
export function imprimirNotaVenta(comprobante) {
  const html = generarTicketHTML(comprobante);
  const ventana = window.open("", "_blank", "width=480,height=740");
  if (!ventana) {
    alert("El navegador bloqueó la ventana emergente. Permita pop-ups para imprimir.");
    return;
  }
  ventana.document.write(html);
  ventana.document.close();
  ventana.focus();
  setTimeout(() => ventana.print(), 400);
}

/** HTML del comprobante para descarga. */
export function generarComprobanteHTML(comprobante) {
  return generarTicketHTML(comprobante);
}

export default imprimirNotaVenta;
