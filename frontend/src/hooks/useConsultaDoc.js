import { useState } from "react";
import { consultarRUC, consultarDNI } from "../services/sunat";

/**
 * Hook para consultar RUC o DNI.
 * Detecta automáticamente el tipo por la longitud.
 * Retorna: { consultando, errorConsulta, consultarDoc, limpiarConsulta }
 */
export function useConsultaDoc(onResultado) {
  const [consultando, setConsultando] = useState(false);
  const [errorConsulta, setErrorConsulta] = useState("");

  const consultarDoc = async (valor) => {
    const v = valor.trim().replace(/\D/g, "");
    if (v.length !== 8 && v.length !== 11) {
      setErrorConsulta("Ingresa 8 dígitos (DNI) u 11 dígitos (RUC).");
      return;
    }
    setConsultando(true);
    setErrorConsulta("");
    try {
      const data = v.length === 11 ? await consultarRUC(v) : await consultarDNI(v);
      onResultado(data, v.length === 11 ? "ruc" : "dni");
    } catch (e) {
      setErrorConsulta(e.message);
    } finally {
      setConsultando(false);
    }
  };

  const limpiarConsulta = () => setErrorConsulta("");

  return { consultando, errorConsulta, consultarDoc, limpiarConsulta };
}
