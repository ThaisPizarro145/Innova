/**
 * Utilidades de stock: conversión de presentación → unidades base
 * y formato amigable de stock con equivalencias.
 */

// Etiquetas amigables
const ETIQUETAS = {
  kilo: "kg", saco: "saco", medio_saco: "½ saco", caja: "caja",
  unidad: "und", paquete: "paquete", maple: "maple", bolsa: "bolsa",
  litro: "L", botella: "bot.", docena: "doc.", balde: "balde",
  jaba: "jaba", bidon: "bidón", pack: "pack",
};

function etq(u) {
  return ETIQUETAS[u] || u;
}

/**
 * Calcula cuántas unidades base equivale una cantidad de una presentación dada.
 * Replica la lógica de _cantidad_en_unidades_base del backend.
 */
export function cantidadEnUnidadesBase(producto, presentacion, cantidad) {
  const equiv = producto.equivalencias || {};
  const nombreEmpaque = (producto.nombre_empaque_mayor || "").toLowerCase();
  const nombreUnidad  = (producto.nombre_unidad_menor || "").toLowerCase();
  const nombreNivel2  = (producto.nombre_nivel2 || "").toLowerCase();
  const pres = (presentacion || "").toLowerCase().trim();
  const tipoFlujo = producto.tipo_flujo || "";
  const unidadBase = (producto.unidad_base || "unidad").toLowerCase();

  // Presentación = unidad base → sin conversión
  if (pres === unidadBase || pres === nombreUnidad || pres === "unidad" || pres === "kilo") {
    return cantidad;
  }

  if (tipoFlujo === "caja_unidad" || tipoFlujo === "saco_unidad") {
    if (pres === nombreEmpaque || pres === "caja" || pres === "saco" || pres === "bolsa") {
      const n = Number(equiv.unidades_por_empaque || 1);
      return cantidad * n;
    }
  }

  if (tipoFlujo === "saco_kilo") {
    if (pres === nombreEmpaque || pres === "saco") {
      const kg = Number(equiv.kg_por_empaque || 1);
      return cantidad * kg;
    }
    if (pres.includes("medio")) {
      const kg = Number(equiv.kg_por_empaque || 1);
      return cantidad * kg * 0.5;
    }
  }

  if (tipoFlujo === "multinivel") {
    if (pres === nombreEmpaque || pres === "paquete") {
      const kg = Number(equiv.kg_por_empaque || 0);
      if (kg > 0) return cantidad * kg;
      const maples = Number(equiv.nivel2_por_empaque || 1);
      const huevos = Number(equiv.unidades_por_nivel2 || 1);
      return cantidad * maples * huevos;
    }
    if (pres === nombreNivel2 || pres === "maple") {
      const kgEmpaque = Number(equiv.kg_por_empaque || 0);
      const nivel2 = Number(equiv.nivel2_por_empaque || 1);
      const kgMaple = kgEmpaque > 0 ? kgEmpaque / nivel2 : 0;
      if (kgMaple > 0) return cantidad * kgMaple;
      const huevos = Number(equiv.unidades_por_nivel2 || 1);
      return cantidad * huevos;
    }
  }

  // También manejar productos con categoría config (unidades_venta sin tipo_flujo)
  // usando precios_presentacion como referencia de si existe la presentación
  return cantidad;
}

/**
 * Formatea el stock de forma amigable mostrando la presentación mayor
 * y el residuo en la unidad base.
 *
 * Ejemplos:
 *   stockAmigable(producto, 126) → "10 cajas + 6 und (126 und)"
 *   stockAmigable(producto, 105) → "2 sacos + 5 kg (105 kg)"
 *   stockAmigable(producto, 45)  → "2 bidones + 5 L (45 L)"
 */
export function stockAmigable(producto, stockActual) {
  const stock = Number(stockActual ?? producto.stock_actual ?? 0);
  const unidadBase = etq(producto.unidad_base || "unidad");
  const equiv = producto.equivalencias || {};
  const tipoFlujo = producto.tipo_flujo || "";
  const nombreEmpaque = producto.nombre_empaque_mayor || null;

  // Sin tipo de flujo o sin equivalencias → mostrar plano
  if (!tipoFlujo || (!equiv.unidades_por_empaque && !equiv.kg_por_empaque && !equiv.nivel2_por_empaque)) {
    return `${stock % 1 === 0 ? stock : stock.toFixed(2)} ${unidadBase}`;
  }

  let factorMayor = 0;
  let etqMayor = nombreEmpaque ? etq(nombreEmpaque.toLowerCase()) : null;

  if (tipoFlujo === "caja_unidad" || tipoFlujo === "saco_unidad") {
    factorMayor = Number(equiv.unidades_por_empaque || 0);
    etqMayor = etqMayor || (tipoFlujo === "caja_unidad" ? "caja" : "saco");
  } else if (tipoFlujo === "saco_kilo") {
    factorMayor = Number(equiv.kg_por_empaque || 0);
    etqMayor = etqMayor || "saco";
  } else if (tipoFlujo === "multinivel") {
    const kg = Number(equiv.kg_por_empaque || 0);
    const maples = Number(equiv.nivel2_por_empaque || 0);
    const huevos = Number(equiv.unidades_por_nivel2 || 1);
    factorMayor = kg > 0 ? kg : maples * huevos;
    etqMayor = etqMayor || "paquete";
  }

  if (!factorMayor || factorMayor <= 0) {
    return `${stock % 1 === 0 ? stock : stock.toFixed(2)} ${unidadBase}`;
  }

  const enteros = Math.floor(stock / factorMayor);
  const residuo = +(stock % factorMayor).toFixed(4);
  const stockFmt = stock % 1 === 0 ? stock : stock.toFixed(2);

  if (enteros === 0) {
    return `${residuo % 1 === 0 ? residuo : residuo.toFixed(2)} ${unidadBase} (${stockFmt} ${unidadBase})`;
  }
  if (residuo === 0 || Math.abs(residuo) < 0.0001) {
    return `${enteros} ${enteros === 1 ? etqMayor : etqMayor + "s"} (${stockFmt} ${unidadBase})`;
  }
  return `${enteros} ${enteros === 1 ? etqMayor : etqMayor + "s"} + ${residuo % 1 === 0 ? residuo : residuo.toFixed(2)} ${unidadBase} (${stockFmt} ${unidadBase})`;
}
