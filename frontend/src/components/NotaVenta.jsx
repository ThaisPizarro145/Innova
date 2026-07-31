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
    vendedor:  e.vendedor || "",
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
    fontFamily = "Arial, Helvetica, sans-serif",
    escala     = 1,   // multiplicador de todos los font-size del ticket
    pesoBase   = 400, // font-weight del cuerpo del ticket
  } = opciones;
  const t = (px) => `${Math.round(px * escala * 10) / 10}px`;
  const EMPRESA = datosEmpresa();
  const {
    tipo_documento   = "NOTA_VENTA",
    serie            = "NV01",
    numero_documento = "00000001",
    fecha,
    clienteNombre    = "Cliente general",
    clienteDireccion = "",
    vendedor         = EMPRESA.vendedor || "",
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
  const fechaStr = `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`;

  // ── Pagos ─────────────────────────────────────────────────
  const listaPagos  = pagos.length > 0 ? pagos : [{ tipo: forma_pago, monto: total }];
  const totalPagado = listaPagos.reduce((a, p) => a + Number(p.monto || 0), 0);
  const vuelto      = Math.max(0, totalPagado - Number(total));

  // ── Datos del comprobante (mismo formato/orden que el voucher físico) ─
  const camposCliente = [
    ["F. Emisión", fechaStr],
    ["Cliente", clienteNombre || "Cliente general"],
    ["Dirección", clienteDireccion],
    ["Vendedor", vendedor],
    caja             ? ["Caja", caja]                  : null,
    numero_operacion ? ["Operación", numero_operacion] : null,
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
    const desc    = item.nombre || "";
    return `
      <tr class="det-row">
        <td class="d-cant">${cantStr}</td>
        <td class="d-und">${und}</td>
        <td class="d-desc">${desc}</td>
        <td class="d-punit">${f2(precio)}</td>
        <td class="d-tot">${f2(tot)}</td>
      </tr>`;
  }).join("");

  // ── Totales ───────────────────────────────────────────────
  const hayDescuento = Number(descuento) > 0;
  const hayIgv       = !esNota && Number(igv) > 0;
  const hayDesglose  = hayDescuento || hayIgv;

  const totalesRows = [
    hayDesglose  ? `<tr class="t-row"><td>Subtotal</td><td>S/ ${f2(subtotal)}</td></tr>`     : "",
    hayDescuento ? `<tr class="t-row"><td>Descuento</td><td>- S/ ${f2(descuento)}</td></tr>` : "",
    hayIgv       ? `<tr class="t-row"><td>IGV (18%)</td><td>S/ ${f2(igv)}</td></tr>`         : "",
  ].join("");

  // ── Pagos ─────────────────────────────────────────────────
  const pagosHTML = listaPagos.map((p) =>
    `<div class="pago-item">${fechaStr} - ${p.tipo || forma_pago} - S/ ${f2(p.monto)}</div>`
  ).join("");

  const vueltoHTML = vuelto > 0
    ? `<div class="pago-item">Vuelto - S/ ${f2(vuelto)}</div>`
    : "";

  const estilos = `
    /* ── Reset ───────────────────────────────────────── */
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    /* ── Página de impresión (papel térmico 80mm) ─────── */
    @page {
      size: 80mm auto;
      margin: 0;
    }

    /* ── Body / contenedor principal ──────────────────── */
    body {
      font-family: ${fontFamily};
      font-size: ${t(18)};
      font-weight: ${pesoBase};
      line-height: 1.4;
      color: #000;
      background: #fff;
      width: 80mm;
      max-width: 80mm;
      margin: 0 auto;
      padding: 4mm;
      box-sizing: border-box;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    /* ── Encabezado empresa (todo centrado) ───────────── */
    .emp-nombre {
      font-size: ${t(22)};
      font-weight: 700;
      text-align: center;
      line-height: 1.25;
      margin-bottom: 2px;
    }
    .emp-linea {
      font-size: ${t(18)};
      text-align: center;
      line-height: 1.35;
    }
    .emp-correo { font-size: ${t(17)}; }

    /* ── Separadores (línea fina, como el voucher físico) ─ */
    .sep { border: none; border-top: 1px solid #000; margin: 4px 0; }

    /* ── Tipo de comprobante (centrado) ───────────────── */
    .comp-titulo {
      font-size: ${t(26)};
      font-weight: 700;
      text-align: center;
      margin: 6px 0 2px 0;
    }
    .comp-numero {
      font-size: ${t(24)};
      text-align: center;
    }

    /* ── Datos del comprobante (F. Emisión, Cliente, etc.) ─ */
    .tbl-cliente {
      width: 100%;
      border-collapse: collapse;
      font-size: ${t(18)};
      line-height: 1.5;
      margin-top: 6px;
      table-layout: fixed;
    }
    .c-etq { width: 46%; padding-right: 4px; vertical-align: top; overflow-wrap: anywhere; }
    .c-sep { width: 4%;  padding: 0 2px; vertical-align: top; }
    .c-val { width: 50%; vertical-align: top; overflow-wrap: anywhere; }

    /* ── Tabla detalle productos ───────────────────────── */
    .tbl-det {
      width: 100%;
      border-collapse: collapse;
      font-size: ${t(12)};
      table-layout: fixed;
    }
    .det-thead th {
      font-weight: 700;
      font-size: ${t(12)};
      text-align: left;
      padding: 2px 1px 4px 1px;
      border-bottom: 1px solid #000;
      white-space: nowrap;
    }
    .d-cant  { width: 12%; }
    .d-und   { width: 14%; }
    .d-desc  { width: 36%; }
    .d-punit { width: 19%; }
    .d-tot   { width: 19%; }
    th.d-punit, th.d-tot, td.d-punit, td.d-tot { text-align: right; }
    .det-row td {
      padding: 3px 1px;
      vertical-align: top;
      overflow-wrap: anywhere;
    }
    td.d-cant, td.d-und, td.d-punit, td.d-tot { white-space: nowrap; }
    td.d-punit, td.d-tot { font-variant-numeric: tabular-nums; }

    /* ── Tabla totales (subtotal / descuento / igv) ────── */
    .tbl-tot {
      width: 100%;
      border-collapse: collapse;
      font-size: ${t(18)};
    }
    .t-row td { padding: 2px; line-height: 1.5; }
    .t-row td:first-child { text-align: left; }
    .t-row td:last-child  { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }

    /* ── Total a pagar (destacado) ─────────────────────── */
    .total-final {
      display: flex;
      justify-content: space-between;
      font-size: ${t(22)};
      font-weight: 700;
      padding: 3px 2px;
    }

    /* ── Sección Pagos ──────────────────────────────────── */
    .pagos-titulo {
      font-size: ${t(18)};
      margin: 5px 0 2px 0;
    }
    .pago-item {
      font-size: ${t(14)};
      line-height: 1.5;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    /* ── Pie ────────────────────────────────────────────── */
    .pie {
      text-align: center;
      font-size: ${t(18)};
      line-height: 1.5;
      margin-top: 6px;
    }
    .pie-electronico {
      font-size: ${t(14)};
      font-style: italic;
      margin-top: 4px;
    }
  `;

  const cuerpo = `
  <!-- ═══ ENCABEZADO (todo centrado) ═══════════════════ -->
  <div class="emp-nombre">${EMPRESA.nombre}</div>
  <div class="emp-linea">RUC: ${EMPRESA.ruc}</div>
  <div class="emp-linea">Dirección: ${EMPRESA.direccion}${EMPRESA.ciudad ? `, ${EMPRESA.ciudad}` : ""}</div>
  <div class="emp-linea emp-correo">Correo: ${EMPRESA.correo}</div>
  <div class="emp-linea">Teléfono: ${EMPRESA.celular}</div>

  <!-- ═══ TIPO DE COMPROBANTE ══════════════════════════ -->
  <div class="comp-titulo">${titulo}</div>
  <div class="comp-numero">${numeroCompleto}</div>

  <!-- ═══ DATOS DEL COMPROBANTE ════════════════════════ -->
  <table class="tbl-cliente">
    <tbody>${datosClienteHTML}</tbody>
  </table>

  <hr class="sep">

  <!-- ═══ DETALLE DE PRODUCTOS ═════════════════════════ -->
  <table class="tbl-det">
    <thead class="det-thead">
      <tr>
        <th class="d-cant">Cant.</th>
        <th class="d-und">Und.</th>
        <th class="d-desc">Descripción</th>
        <th class="d-punit">P.Unit</th>
        <th class="d-tot">Total</th>
      </tr>
    </thead>
    <tbody>${filasProductos}</tbody>
  </table>

  <hr class="sep">

  <!-- ═══ TOTAL A PAGAR ═════════════════════════════════ -->
  ${totalesRows ? `<table class="tbl-tot"><tbody>${totalesRows}</tbody></table>` : ""}
  <div class="total-final">
    <span>Total a pagar:</span>
    <span>S/ ${f2(total)}</span>
  </div>

  <!-- ═══ PAGOS ════════════════════════════════════════ -->
  <div class="pagos-titulo">Pagos:</div>
  ${pagosHTML}
  ${vueltoHTML}

  ${observaciones
    ? `<hr class="sep"><div class="pago-item">${observaciones}</div>`
    : ""}

  <hr class="sep">

  <!-- ═══ PIE ══════════════════════════════════════════ -->
  <div class="pie">
    <div>¡Gracias por su compra!</div>
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

// Ancho de renderizado del ticket en px — 80mm convertidos a px CSS (1mm ≈ 3.7795px),
// igual al `width: 80mm` del body para que la imagen no quede con márgenes en blanco.
// RawBT escala la imagen recibida al ancho físico del papel (58mm u 80mm).
const RAWBT_ANCHO_PX = 302;

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
