/**
 * pdf.js — Convierte un documento HTML autocontenido en un PDF descargable.
 * Renderiza el HTML en un iframe aislado, lo rasteriza con html2canvas
 * (mismo enfoque que ya se usa para el ticket RawBT) y arma el PDF con jsPDF.
 */
import html2canvas from "html2canvas";
import jsPDF from "jspdf";

/**
 * @param {string} html - HTML completo (con <html>, <style>, etc.)
 * @param {string} nombreArchivo - nombre del archivo, sin extensión
 * @param {object} opciones
 * @param {number} [opciones.anchoPx=800] - ancho de renderizado en px
 * @param {"a4"|"ticket"} [opciones.formato="a4"] - "a4" pagina en hojas A4;
 *   "ticket" genera una única página angosta (80mm) ajustada al alto del contenido
 */
export async function descargarHTMLComoPDF(html, nombreArchivo, { anchoPx = 800, formato = "a4" } = {}) {
  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.left = "-9999px";
  iframe.style.top = "0";
  iframe.style.width = `${anchoPx}px`;
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
      width: anchoPx,
      windowWidth: anchoPx,
    });

    const imgData = canvas.toDataURL("image/png");

    if (formato === "ticket") {
      const pageWmm = 80;
      const pageHmm = (canvas.height * pageWmm) / canvas.width;
      const pdf = new jsPDF({ unit: "mm", format: [pageWmm, pageHmm] });
      pdf.addImage(imgData, "PNG", 0, 0, pageWmm, pageHmm);
      pdf.save(`${nombreArchivo}.pdf`);
      return;
    }

    const pdf = new jsPDF({ unit: "mm", format: "a4" });
    const pageWmm = pdf.internal.pageSize.getWidth();
    const pageHmm = pdf.internal.pageSize.getHeight();
    const imgHmm = (canvas.height * pageWmm) / canvas.width;

    let renderedHmm = 0;
    let primeraPagina = true;
    while (renderedHmm < imgHmm) {
      if (!primeraPagina) pdf.addPage();
      primeraPagina = false;
      pdf.addImage(imgData, "PNG", 0, -renderedHmm, pageWmm, imgHmm);
      renderedHmm += pageHmm;
    }

    pdf.save(`${nombreArchivo}.pdf`);
  } finally {
    document.body.removeChild(iframe);
  }
}
