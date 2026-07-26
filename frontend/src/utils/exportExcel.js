import * as XLSX from "xlsx";

/**
 * Exporta una matriz de filas (array de arrays) a un archivo .xlsx real (no CSV).
 * @param {string} nombreArchivo - sin extensión, ej. "productos"
 * @param {Array<Array<string|number>>} aoa - filas, incluyendo encabezado si corresponde
 * @param {string} nombreHoja
 */
export function exportarExcelAOA(nombreArchivo, aoa, nombreHoja = "Datos") {
  const hoja = XLSX.utils.aoa_to_sheet(aoa);
  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, hoja, nombreHoja);
  XLSX.writeFile(libro, `${nombreArchivo}.xlsx`);
}

/**
 * Exporta encabezados + filas a un archivo .xlsx real (no CSV).
 * @param {string} nombreArchivo - sin extensión, ej. "productos"
 * @param {string[]} encabezados
 * @param {Array<Array<string|number>>} filas
 * @param {string} nombreHoja
 */
export function exportarExcel(nombreArchivo, encabezados, filas, nombreHoja = "Datos") {
  exportarExcelAOA(nombreArchivo, [encabezados, ...filas], nombreHoja);
}
