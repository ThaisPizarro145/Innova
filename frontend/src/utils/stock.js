/**
 * Utilidades de stock: conversión de presentación (Caja/Unidad/Blíster) a
 * unidades base y formato amigable de stock.
 */

/**
 * Calcula cuántas unidades base equivale una cantidad de una presentación dada.
 */
export function cantidadEnUnidadesBase(producto, presentacion, cantidad) {
  const pres = (presentacion || "Unidad").trim();
  if (pres === "Caja" && producto.unidades_por_caja > 0) {
    return cantidad * Number(producto.unidades_por_caja);
  }
  if (pres === "Blíster" && producto.unidades_por_blister > 0) {
    return cantidad * Number(producto.unidades_por_blister);
  }
  return cantidad;
}

/**
 * Formatea el stock de forma amigable mostrando cajas completas + residuo
 * en unidades cuando el producto vende por Caja.
 *
 * Ejemplos:
 *   stockAmigable(producto, 126) → "10 cajas + 6 unidad(es) (126 unidad(es))"
 *   stockAmigable(producto, 30)  → "30 unidad(es)" (si no vende por caja)
 */
export function stockAmigable(producto, stockActual) {
  const stock = Number(stockActual ?? producto.stock_actual ?? 0);
  const stockFmt = stock % 1 === 0 ? stock : stock.toFixed(2);

  const factor = Number(producto.unidades_por_caja || 0);
  if (factor > 0) {
    const enteros = Math.floor(stock / factor);
    const residuo = +(stock % factor).toFixed(4);
    if (enteros > 0) {
      const etiquetaCaja = enteros === 1 ? "caja" : "cajas";
      return residuo === 0
        ? `${enteros} ${etiquetaCaja} (${stockFmt} unidad(es))`
        : `${enteros} ${etiquetaCaja} + ${residuo} unidad(es) (${stockFmt} unidad(es))`;
    }
  }

  return `${stockFmt} unidad(es)`;
}
