/**
 * Consulta RUC/DNI a través del backend de FarmaSys, que hace de proxy
 * hacia PeruAPI (peruapi.com). No se llama a peruapi.com directo desde el
 * navegador porque su API no responde el preflight CORS y el navegador
 * bloquea la petición.
 */
import { BASE_URL } from "./api";

const STORAGE_TOKEN_KEY = "bodega_apiinti_token";

export function getToken() {
  return localStorage.getItem(STORAGE_TOKEN_KEY) || "";
}

export function setToken(token) {
  localStorage.setItem(STORAGE_TOKEN_KEY, token.trim());
}

async function consultar(path) {
  const headers = {};
  const token = getToken();
  if (token) headers["X-API-KEY"] = token;

  const res = await fetch(`${BASE_URL}/consulta/${path}`, { method: "GET", headers });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || err.message || `Error ${res.status} al consultar.`);
  }
  return res.json();
}

/**
 * Consulta RUC en SUNAT.
 * Respuesta PeruAPI: { ruc, razon_social, estado, condicion, direccion, ... }
 */
export async function consultarRUC(ruc) {
  if (!/^\d{11}$/.test(ruc.trim())) throw new Error("El RUC debe tener exactamente 11 dígitos.");
  return consultar(`ruc/${ruc.trim()}`);
}

/**
 * Consulta DNI en RENIEC.
 * Respuesta PeruAPI: { dni, nombres, apellido_paterno, apellido_materno, nombre_completo, ... }
 */
export async function consultarDNI(dni) {
  if (!/^\d{8}$/.test(dni.trim())) throw new Error("El DNI debe tener exactamente 8 dígitos.");
  return consultar(`dni/${dni.trim()}`);
}
