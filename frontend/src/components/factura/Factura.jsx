/**
 * Factura.jsx — Comprobante electrónico A4 (Boleta / Factura)
 * Diseño propio inspirado en la distribución de un ERP: encabezado con
 * recuadro de documento, datos del cliente, tabla de ítems y totales.
 * Solo HTML + CSS puro (sin librerías), pensado para window.print() y
 * para descargarse como un único archivo HTML autocontenido.
 */
import { EMPRESA, normalizarFechaUTC } from "../NotaVenta";
import facturaCss from "./Factura.css?raw";

const f2 = (v) => Number(v || 0).toFixed(2);

// ── Conversor de montos a letras (formato de comprobante peruano) ─────────
const UNIDADES = ["", "UNO", "DOS", "TRES", "CUATRO", "CINCO", "SEIS", "SIETE", "OCHO", "NUEVE",
  "DIEZ", "ONCE", "DOCE", "TRECE", "CATORCE", "QUINCE", "DIECISÉIS", "DIECISIETE", "DIECIOCHO", "DIECINUEVE"];
const VEINTIS = ["VEINTE", "VEINTIUNO", "VEINTIDÓS", "VEINTITRÉS", "VEINTICUATRO", "VEINTICINCO",
  "VEINTISÉIS", "VEINTISIETE", "VEINTIOCHO", "VEINTINUEVE"];
const DECENAS = ["", "", "", "TREINTA", "CUARENTA", "CINCUENTA", "SESENTA", "SETENTA", "OCHENTA", "NOVENTA"];
const CENTENAS = ["", "CIENTO", "DOSCIENTOS", "TRESCIENTOS", "CUATROCIENTOS", "QUINIENTOS",
  "SEISCIENTOS", "SETECIENTOS", "OCHOCIENTOS", "NOVECIENTOS"];

function convertirGrupo(n) {
  if (n === 0) return "";
  if (n === 100) return "CIEN";
  let out = "";
  const c = Math.floor(n / 100);
  const resto = n % 100;
  if (c > 0) out += CENTENAS[c];
  if (resto > 0) {
    if (out) out += " ";
    if (resto < 20) out += UNIDADES[resto];
    else if (resto < 30) out += VEINTIS[resto - 20];
    else {
      const d = Math.floor(resto / 10);
      const u = resto % 10;
      out += DECENAS[d];
      if (u > 0) out += " Y " + UNIDADES[u];
    }
  }
  return out;
}

function apocope(texto) {
  if (texto === "UNO") return "UN";
  if (texto.endsWith(" UNO")) return texto.slice(0, -4) + " UN";
  if (texto === "VEINTIUNO") return "VEINTIÚN";
  if (texto.endsWith(" VEINTIUNO")) return texto.slice(0, -10) + " VEINTIÚN";
  return texto;
}

function enteroALetras(n) {
  n = Math.trunc(n);
  if (n === 0) return "CERO";
  const millones = Math.floor(n / 1000000);
  const miles = Math.floor((n % 1000000) / 1000);
  const resto = n % 1000;
  const partes = [];
  if (millones > 0) {
    partes.push(millones === 1 ? "UN MILLÓN" : apocope(convertirGrupo(millones)) + " MILLONES");
  }
  if (miles > 0) {
    partes.push(miles === 1 ? "MIL" : apocope(convertirGrupo(miles)) + " MIL");
  }
  if (resto > 0) partes.push(convertirGrupo(resto));
  return partes.join(" ").trim();
}

/** "SON: DOSCIENTOS CINCUENTA CON 40/100 SOLES" */
function montoEnLetras(monto, moneda = "SOLES") {
  const num = Math.abs(Number(monto) || 0);
  const entero = Math.trunc(num);
  const centavos = Math.round((num - entero) * 100);
  return `SON: ${enteroALetras(entero)} CON ${String(centavos).padStart(2, "0")}/100 ${moneda}`;
}

// ── Fecha ──────────────────────────────────────────────────────────────────
const pad2 = (n) => String(n).padStart(2, "0");

function parsarFecha(f) {
  if (!f) return new Date();
  if (f instanceof Date) return isNaN(f) ? new Date() : f;
  const matchLocal = String(f).match(/(\d{1,2})\/(\d{1,2})\/(\d{4})[,\s]+(\d{1,2}):(\d{2})/);
  if (matchLocal) {
    const [, dia, mes, anio, h, m] = matchLocal;
    return new Date(Number(anio), Number(mes) - 1, Number(dia), Number(h), Number(m));
  }
  return normalizarFechaUTC(f);
}

function formatearFecha(f) {
  const d = parsarFecha(f);
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`;
}

function esc(v) {
  return String(v ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
}

const TITULOS = {
  BOLETA:  "Boleta Electrónica",
  FACTURA: "Factura Electrónica",
};

/**
 * Genera el documento HTML completo (autocontenido) del comprobante.
 * @param {object} comprobante - ver Ventas.jsx (confirmarVenta / historial)
 */
export function generarFacturaHTML(comprobante) {
  const {
    tipo_documento   = "FACTURA",
    serie            = tipo_documento === "BOLETA" ? "B001" : "F001",
    numero_documento = "00000001",
    fecha,
    clienteNombre    = "CLIENTES VARIOS",
    clienteDni       = "",
    clienteDireccion = "",
    vendedor         = "",
    ordenCompra      = "",
    guiaRemision     = "",
    items            = [],
    subtotal         = 0,
    igv              = 0,
    total            = 0,
    forma_pago       = "Efectivo",
    observaciones    = "",
  } = comprobante;

  const titulo = TITULOS[tipo_documento] || TITULOS.FACTURA;
  const numeroCompleto = `${serie}-${String(numero_documento).padStart(8, "0")}`;
  const fechaStr = formatearFecha(fecha);

  const filas = items.map((item) => {
    const cant = Number(item.cantidad || 0);
    const cantStr = cant % 1 === 0 ? String(cant) : cant.toFixed(2);
    return `
      <tr>
        <td class="col-codigo">${esc(item.codigo || "-")}</td>
        <td class="col-cant">${cantStr}</td>
        <td class="col-und">${esc((item.presentacion || "unidad").toUpperCase())}</td>
        <td class="col-desc">${esc(item.nombre)}</td>
        <td class="col-pu">S/ ${f2(item.precio)}</td>
        <td class="col-imp">S/ ${f2(item.total)}</td>
      </tr>`;
  }).join("");

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8"/>
<title>${titulo} ${numeroCompleto}</title>
<style>${facturaCss}</style>
</head>
<body>
  <div class="factura">

    <!-- ═══ ENCABEZADO ═══ -->
    <header class="f-header">
      <div class="f-empresa">
        <div class="f-empresa-nombre">${esc(EMPRESA.nombre)}</div>
        <div class="f-empresa-linea">RUC ${esc(EMPRESA.ruc)}</div>
        <div class="f-empresa-linea">${esc(EMPRESA.direccion)} — ${esc(EMPRESA.ciudad)}</div>
        <div class="f-empresa-linea">${esc(EMPRESA.correo)} · Cel. ${esc(EMPRESA.celular)}</div>
      </div>
      <div class="f-doc-box">
        <div class="f-doc-tipo">${titulo}</div>
        <div class="f-doc-ruc">RUC ${esc(EMPRESA.ruc)}</div>
        <div class="f-doc-numero">${numeroCompleto}</div>
      </div>
    </header>

    <!-- ═══ DATOS DEL CLIENTE ═══ -->
    <section class="f-cliente">
      <div class="f-cliente-col">
        <div class="f-campo"><span class="f-etq">Señor(es)</span><span class="f-val">${esc(clienteNombre || "CLIENTES VARIOS")}</span></div>
        <div class="f-campo"><span class="f-etq">RUC / DNI</span><span class="f-val">${esc(clienteDni || "-")}</span></div>
        <div class="f-campo"><span class="f-etq">Dirección</span><span class="f-val">${esc(clienteDireccion || "-")}</span></div>
        <div class="f-campo"><span class="f-etq">Orden de compra</span><span class="f-val">${esc(ordenCompra || "-")}</span></div>
      </div>
      <div class="f-cliente-col">
        <div class="f-campo"><span class="f-etq">Fecha de emisión</span><span class="f-val">${fechaStr}</span></div>
        <div class="f-campo"><span class="f-etq">Forma de pago</span><span class="f-val">${esc(forma_pago)}</span></div>
        <div class="f-campo"><span class="f-etq">Vendedor</span><span class="f-val">${esc(vendedor || "-")}</span></div>
        <div class="f-campo"><span class="f-etq">Moneda</span><span class="f-val">Soles (PEN)</span></div>
        <div class="f-campo"><span class="f-etq">Guía de remisión</span><span class="f-val">${esc(guiaRemision || "-")}</span></div>
      </div>
    </section>

    <!-- ═══ TABLA DE PRODUCTOS ═══ -->
    <table class="f-tabla">
      <thead>
        <tr>
          <th class="col-codigo">Código</th>
          <th class="col-cant">Cantidad</th>
          <th class="col-und">Unidad</th>
          <th class="col-desc">Descripción</th>
          <th class="col-pu">Precio Unit.</th>
          <th class="col-imp">Importe</th>
        </tr>
      </thead>
      <tbody>${filas}</tbody>
    </table>

    <!-- ═══ LETRAS + TOTALES ═══ -->
    <section class="f-cierre">
      <div class="f-letras">${montoEnLetras(total)}</div>
      <div class="f-totales">
        <div class="f-tot-row"><span>Operaciones Gravadas</span><span>S/ ${f2(subtotal)}</span></div>
        <div class="f-tot-row"><span>IGV (18%)</span><span>S/ ${f2(igv)}</span></div>
        <div class="f-tot-row f-tot-final"><span>Importe Total</span><span>S/ ${f2(total)}</span></div>
      </div>
    </section>

    ${observaciones ? `
    <section class="f-obs"><strong>Observaciones:</strong> ${esc(observaciones)}</section>` : ""}

    <!-- ═══ PIE ═══ -->
    <footer class="f-footer">
      <div class="f-gracias">Gracias por su preferencia</div>
      <div class="f-legal">
        Representación impresa de la ${titulo.toLowerCase()}.
      </div>
    </footer>

  </div>
</body>
</html>`;
}

/** Abre ventana emergente e imprime el comprobante A4. */
export function imprimirFactura(comprobante) {
  const html = generarFacturaHTML(comprobante);
  const ventana = window.open("", "_blank", "width=900,height=1000");
  if (!ventana) {
    alert("El navegador bloqueó la ventana emergente. Permita pop-ups para imprimir.");
    return;
  }
  ventana.document.write(html);
  ventana.document.close();
  ventana.focus();
  setTimeout(() => ventana.print(), 400);
}

/** HTML del comprobante para descarga como archivo. */
export function descargarFacturaHTML(comprobante) {
  return generarFacturaHTML(comprobante);
}

export default imprimirFactura;
