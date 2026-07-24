/**
 * Servicio de consulta RUC/DNI usando PeruAPI (peruapi.com)
 * Docs: https://peruapi.com
 */

const STORAGE_TOKEN_KEY = "bodega_apiinti_token";
const BASE = "https://peruapi.com/api";
const TOKEN_DEFAULT = "5cd4393ae49a4fab116f959c083c8180";

export function getToken() {
  return localStorage.getItem(STORAGE_TOKEN_KEY) || TOKEN_DEFAULT;
}

export function setToken(token) {
  localStorage.setItem(STORAGE_TOKEN_KEY, token.trim());
}

/**
 * Consulta RUC en SUNAT.
 * Respuesta PeruAPI: { ruc, razon_social, estado, condicion, direccion, ... }
 */
export async function consultarRUC(ruc) {
  if (!/^\d{11}$/.test(ruc.trim())) throw new Error("El RUC debe tener exactamente 11 dígitos.");
  const res = await fetch(`${BASE}/ruc/${ruc.trim()}`, {
    method: "GET",
    headers: { "X-API-KEY": getToken() },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `Error ${res.status} al consultar RUC.`);
  }
  const data = await res.json();
  if (data.error || data.success === false) throw new Error(data.message || "RUC no encontrado.");
  return data;
}

/**
 * Consulta DNI en RENIEC.
 * Respuesta PeruAPI: { dni, nombres, apellido_paterno, apellido_materno, nombre_completo, ... }
 */
export async function consultarDNI(dni) {
  if (!/^\d{8}$/.test(dni.trim())) throw new Error("El DNI debe tener exactamente 8 dígitos.");
  const res = await fetch(`${BASE}/dni/${dni.trim()}`, {
    method: "GET",
    headers: { "X-API-KEY": getToken() },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `Error ${res.status} al consultar DNI.`);
  }
  const data = await res.json();
  if (data.error || data.success === false) throw new Error(data.message || "DNI no encontrado.");
  return data;
}
