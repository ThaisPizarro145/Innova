/**
 * Datos de la empresa: se guardan en el servidor (tabla `empresa_config`,
 * fila única y global) para que apliquen en todos los dispositivos, no solo
 * en el navegador donde se configuraron. `getEmpresa()` sigue siendo
 * síncrona (la usan NotaVenta.jsx/Ventas.jsx durante el render/impresión) y
 * lee de un caché en memoria — `cargarEmpresa()` lo llena desde el servidor
 * al iniciar la app (ver App.jsx). localStorage queda solo como copia de
 * respaldo para poder imprimir si el backend no responde en ese momento.
 */
import { getEmpresaRemota, actualizarEmpresaRemota } from "./api";

const KEY = "bodega_empresa";

const DEFAULT = {
  nombre: "MI BODEGA",
  ruc: "",
  direccion: "",
  distrito: "",
  provincia: "",
  departamento: "",
  telefono: "",
  email: "",
  vendedor: "Administrador",
};

function leerCacheLocal() {
  try {
    const data = localStorage.getItem(KEY);
    return data ? JSON.parse(data) : {};
  } catch { return {}; }
}

function guardarCacheLocal(datos) {
  try { localStorage.setItem(KEY, JSON.stringify(datos)); } catch { /* sin acceso a localStorage */ }
}

let cache = { ...DEFAULT, ...leerCacheLocal() };

/** Lectura síncrona del último dato de empresa conocido (servidor o, si aún no cargó, el caché local). */
export function getEmpresa() {
  return { ...DEFAULT, ...cache };
}

/** Carga los datos de empresa desde el servidor. Llamar una vez al iniciar la app. */
export async function cargarEmpresa() {
  try {
    const datos = await getEmpresaRemota();
    cache = datos;
    guardarCacheLocal(datos);
  } catch {
    // Backend no disponible: se mantiene el último valor conocido.
  }
  return getEmpresa();
}

/** Guarda los datos de empresa en el servidor, compartido entre todos los dispositivos. */
export async function setEmpresa(datos) {
  const guardado = await actualizarEmpresaRemota(datos);
  cache = guardado;
  guardarCacheLocal(guardado);
  return getEmpresa();
}
