/**
 * Datos de la empresa guardados en localStorage.
 * Se configuran en ⚙ Configuración.
 */
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

export function getEmpresa() {
  try {
    const data = localStorage.getItem(KEY);
    return data ? { ...DEFAULT, ...JSON.parse(data) } : { ...DEFAULT };
  } catch { return { ...DEFAULT }; }
}

export function setEmpresa(datos) {
  localStorage.setItem(KEY, JSON.stringify(datos));
}
