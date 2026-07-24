import { useState, useEffect } from "react";
import { getCategoriasConfig, calcularPreciosPorCategoria } from "../services/api";

/**
 * Hook que retorna la configuración de categorías y una función para calcular
 * precios sugeridos dado una categoría, unidad de compra y costo.
 */
export function useCategoriasConfig() {
  const [categorias, setCategorias] = useState([]);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    getCategoriasConfig()
      .then(setCategorias)
      .catch(() => {})
      .finally(() => setCargando(false));
  }, []);

  /**
   * Retorna el objeto de config para una categoría dado su nombre.
   */
  function getConfig(nombreCategoria) {
    return categorias.find((c) => c.nombre === nombreCategoria) || null;
  }

  /**
   * Calcula precios sugeridos.
   * @returns Promise<CalculoPrecioResponse>
   */
  async function calcularPrecios({ categoria_nombre, unidad_compra, costo_compra, cantidad_comprada = 1, margen_ganancia = 20, factor_override = null }) {
    return calcularPreciosPorCategoria({ categoria_nombre, unidad_compra, costo_compra, cantidad_comprada, margen_ganancia, factor_override });
  }

  return { categorias, cargando, getConfig, calcularPrecios };
}
