import { useEffect, useState } from "react";
import { getCategorias } from "../services/api";

export function useCategorias() {
  const [categorias, setCategorias] = useState([]);

  useEffect(() => {
    getCategorias()
      .then(setCategorias)
      .catch(() => setCategorias([]));
  }, []);

  return categorias;
}
