/**
 * NotaVenta.jsx — Ticket térmico profesional
 * Compatible: 58mm / 80mm | HTML/CSS (impresión por navegador y RawBT vía imagen)
 * Solo diseño — lógica del sistema intacta.
 */
import html2canvas from "html2canvas";

export const EMPRESA = {
  nombre:    "CORPORACION SOMOS ALIADOS S.A.C.",
  ruc:       "10739759931",
  direccion: "AV. LA CULTURA PSJ. C - PUESTO 59",
  ciudad:    "SANTA ANITA - LIMA",
  correo:    "admicorporacionaliados@gmail.com",
  celular:   "910501187",
};

const f2 = (v) => Number(v || 0).toFixed(2);

/** Arma los estilos y el cuerpo HTML del ticket, sin el envoltorio <html>/<head>/<body>. */
function construirTicket(comprobante, opciones = {}) {
  const {
    fontFamily = "'Courier New', Courier, monospace",
    escala     = 1,   // multiplicador de todos los font-size del ticket
    pesoBase   = 700, // font-weight del cuerpo del ticket
  } = opciones;
  const t = (px) => `${Math.round(px * escala * 10) / 10}px`;
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
    // ISO u otro formato estándar
    const d = new Date(f);
    return isNaN(d.getTime()) ? new Date() : d;
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
    return `
      <tr class="det-row">
        <td class="d-cant">${cantStr}</td>
        <td class="d-und">${und}</td>
        <td class="d-desc">${desc}</td>
        <td class="d-pu">S/${f2(precio)}</td>
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
      margin: 3mm 2mm;
    }

    /* ── Body ────────────────────────────────────────── */
    body {
      font-family: ${fontFamily};
      font-size: ${t(14)};
      font-weight: ${pesoBase};
      line-height: 1.5;
      color: #000;
      background: #fff;
      width: 100%;
      max-width: 420px;
      margin: 0 auto;
      padding: 4px 6px 12px 6px;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    /* ── Encabezado empresa ──────────────────────────── */
    .emp-nombre {
      font-size: ${t(13.5)};
      font-weight: 900;
      text-align: center;
      letter-spacing: 0.3px;
      line-height: 1.35;
    }
    .emp-info {
      font-size: ${t(11)};
      text-align: center;
      line-height: 1.65;
      margin-top: 1px;
    }

    /* ── Separadores ─────────────────────────────────── */
    .sep  { border: none; border-top: 1px dashed #000; margin: 5px 0; }
    .sep2 { border: none; border-top: 2px solid  #000; margin: 4px 0; }

    /* ── Tipo de comprobante ─────────────────────────── */
    .comp-titulo {
      font-size: ${t(15)};
      font-weight: 900;
      text-align: center;
      letter-spacing: 2px;
      margin: 4px 0 2px 0;
    }
    .comp-numero {
      font-size: ${t(13)};
      font-weight: 700;
      text-align: center;
    }

    /* ── Tabla datos cliente ─────────────────────────── */
    .tbl-cliente {
      width: 100%;
      border-collapse: collapse;
      font-size: ${t(11.5)};
      line-height: 1.6;
    }
    .c-etq { font-weight: 700; white-space: nowrap; padding-right: 3px; width: 74px; }
    .c-sep { padding: 0 2px; width: 8px; }
    .c-val { word-break: break-word; }

    /* ── Tabla detalle productos ─────────────────────── */
    .tbl-det {
      width: 100%;
      border-collapse: collapse;
      font-size: ${t(11.5)};
    }
    .det-thead th {
      font-weight: 700;
      font-size: ${t(11)};
      padding: 1px 2px;
      border-bottom: 1px solid #000;
    }
    .d-cant { text-align: right;  width: 28px;  padding-right: 5px; white-space: nowrap; }
    .d-und  { text-align: left;   width: 36px;  padding-right: 4px; white-space: nowrap; }
    .d-desc { text-align: left;   word-break: break-word; padding-right: 4px; }
    .d-pu   { text-align: right;  width: 70px;  white-space: nowrap; padding-right: 4px; }
    .d-tot  { text-align: right;  width: 72px;  white-space: nowrap; }

    .det-row td { padding: 2px 2px; vertical-align: top; }

    /* ── Tabla totales ───────────────────────────────── */
    .tbl-tot {
      width: 100%;
      border-collapse: collapse;
      font-size: ${t(11.5)};
    }
    .t-row td { padding: 1px 2px; line-height: 1.55; }
    .t-row td:first-child { text-align: left; }
    .t-row td:last-child  { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }

    /* Total final */
    .t-total td {
      font-size: ${t(15)};
      font-weight: 900;
      padding: 2px 2px;
    }
    .t-total td:first-child { text-align: left; }
    .t-total td:last-child  { text-align: right; white-space: nowrap; }

    /* Vuelto */
    .t-vuelto td { font-weight: 700; }

    /* ── Sección pagos ───────────────────────────────── */
    .pagos-titulo {
      font-size: ${t(12)};
      font-weight: 700;
      text-align: center;
      margin: 3px 0 1px 0;
    }
    .pagos-fecha {
      font-size: ${t(11)};
      text-align: center;
      margin-bottom: 2px;
    }

    /* ── Pie ─────────────────────────────────────────── */
    .pie {
      text-align: center;
      font-size: ${t(11)};
      line-height: 1.7;
      margin-top: 3px;
    }
    .pie-gracias {
      font-size: ${t(13.5)};
      font-weight: 900;
    }
    .pie-electronico {
      font-size: ${t(10)};
      font-style: italic;
      margin-top: 3px;
    }
  `;

  const cuerpo = `
  <!-- ═══ MARGEN SUPERIOR ══════════════════════════════ -->
  <br><br><br><br><br><br><br>

  <!-- ═══ ENCABEZADO ═══════════════════════════════════ -->
  <div class="emp-nombre">${EMPRESA.nombre}</div>
  <div class="emp-info">
    RUC: ${EMPRESA.ruc}<br>
    ${EMPRESA.direccion}<br>
    ${EMPRESA.ciudad}<br>
    Correo: ${EMPRESA.correo}<br>
    Cel: ${EMPRESA.celular}
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
        <th class="d-und">Und</th>
        <th class="d-desc">Descripción</th>
        <th class="d-pu">P.Unit</th>
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
  <hr class="sep2">
  <table class="tbl-tot">
    <tbody>
      <tr class="t-total">
        <td>TOTAL A PAGAR</td>
        <td>S/ ${f2(total)}</td>
      </tr>
    </tbody>
  </table>
  <hr class="sep2">

  <!-- ═══ PAGOS ════════════════════════════════════════ -->
  <div class="pagos-titulo">── Pagos ──</div>
  <div class="pagos-fecha">${fechaStr} ${horaStr}</div>
  <table class="tbl-tot">
    <tbody>
      ${pagosRows}
      ${vueltoRow}
    </tbody>
  </table>

  <hr class="sep">

  ${observaciones
    ? `<div style="font-size:11px;margin:2px 0;">${observaciones}</div><hr class="sep">`
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
