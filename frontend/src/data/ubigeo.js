/**
 * Datos de ubigeo Perú: distrito → { provincia, departamento }
 * Lista resumida de los distritos más comunes por departamento.
 */
export const UBIGEO = [
  // Lima
  { distrito: "Miraflores", provincia: "Lima", departamento: "Lima" },
  { distrito: "San Isidro", provincia: "Lima", departamento: "Lima" },
  { distrito: "Surco", provincia: "Lima", departamento: "Lima" },
  { distrito: "San Borja", provincia: "Lima", departamento: "Lima" },
  { distrito: "La Molina", provincia: "Lima", departamento: "Lima" },
  { distrito: "Barranco", provincia: "Lima", departamento: "Lima" },
  { distrito: "Chorrillos", provincia: "Lima", departamento: "Lima" },
  { distrito: "San Miguel", provincia: "Lima", departamento: "Lima" },
  { distrito: "Pueblo Libre", provincia: "Lima", departamento: "Lima" },
  { distrito: "Lince", provincia: "Lima", departamento: "Lima" },
  { distrito: "Jesús María", provincia: "Lima", departamento: "Lima" },
  { distrito: "Magdalena del Mar", provincia: "Lima", departamento: "Lima" },
  { distrito: "Breña", provincia: "Lima", departamento: "Lima" },
  { distrito: "Rímac", provincia: "Lima", departamento: "Lima" },
  { distrito: "Lima", provincia: "Lima", departamento: "Lima" },
  { distrito: "La Victoria", provincia: "Lima", departamento: "Lima" },
  { distrito: "El Agustino", provincia: "Lima", departamento: "Lima" },
  { distrito: "San Luis", provincia: "Lima", departamento: "Lima" },
  { distrito: "Santa Anita", provincia: "Lima", departamento: "Lima" },
  { distrito: "Ate", provincia: "Lima", departamento: "Lima" },
  { distrito: "Lurigancho", provincia: "Lima", departamento: "Lima" },
  { distrito: "San Juan de Lurigancho", provincia: "Lima", departamento: "Lima" },
  { distrito: "Independencia", provincia: "Lima", departamento: "Lima" },
  { distrito: "Los Olivos", provincia: "Lima", departamento: "Lima" },
  { distrito: "San Martín de Porres", provincia: "Lima", departamento: "Lima" },
  { distrito: "Comas", provincia: "Lima", departamento: "Lima" },
  { distrito: "Carabayllo", provincia: "Lima", departamento: "Lima" },
  { distrito: "Puente Piedra", provincia: "Lima", departamento: "Lima" },
  { distrito: "Ventanilla", provincia: "Callao", departamento: "Callao" },
  { distrito: "Callao", provincia: "Callao", departamento: "Callao" },
  { distrito: "Bellavista", provincia: "Callao", departamento: "Callao" },
  { distrito: "La Perla", provincia: "Callao", departamento: "Callao" },
  { distrito: "Carmen de la Legua", provincia: "Callao", departamento: "Callao" },
  { distrito: "Villa El Salvador", provincia: "Lima", departamento: "Lima" },
  { distrito: "Villa María del Triunfo", provincia: "Lima", departamento: "Lima" },
  { distrito: "San Juan de Miraflores", provincia: "Lima", departamento: "Lima" },
  { distrito: "Lurín", provincia: "Lima", departamento: "Lima" },
  { distrito: "Pachacámac", provincia: "Lima", departamento: "Lima" },
  // Arequipa
  { distrito: "Arequipa", provincia: "Arequipa", departamento: "Arequipa" },
  { distrito: "Cayma", provincia: "Arequipa", departamento: "Arequipa" },
  { distrito: "Cerro Colorado", provincia: "Arequipa", departamento: "Arequipa" },
  { distrito: "Sachaca", provincia: "Arequipa", departamento: "Arequipa" },
  { distrito: "Yanahuara", provincia: "Arequipa", departamento: "Arequipa" },
  { distrito: "Paucarpata", provincia: "Arequipa", departamento: "Arequipa" },
  { distrito: "Mariano Melgar", provincia: "Arequipa", departamento: "Arequipa" },
  { distrito: "Miraflores", provincia: "Arequipa", departamento: "Arequipa" },
  { distrito: "Socabaya", provincia: "Arequipa", departamento: "Arequipa" },
  { distrito: "José Luis Bustamante y Rivero", provincia: "Arequipa", departamento: "Arequipa" },
  // Trujillo
  { distrito: "Trujillo", provincia: "Trujillo", departamento: "La Libertad" },
  { distrito: "Víctor Larco Herrera", provincia: "Trujillo", departamento: "La Libertad" },
  { distrito: "El Porvenir", provincia: "Trujillo", departamento: "La Libertad" },
  { distrito: "Florencia de Mora", provincia: "Trujillo", departamento: "La Libertad" },
  { distrito: "Huanchaco", provincia: "Trujillo", departamento: "La Libertad" },
  { distrito: "La Esperanza", provincia: "Trujillo", departamento: "La Libertad" },
  { distrito: "Laredo", provincia: "Trujillo", departamento: "La Libertad" },
  { distrito: "Moche", provincia: "Trujillo", departamento: "La Libertad" },
  { distrito: "Salaverry", provincia: "Trujillo", departamento: "La Libertad" },
  // Piura
  { distrito: "Piura", provincia: "Piura", departamento: "Piura" },
  { distrito: "Castilla", provincia: "Piura", departamento: "Piura" },
  { distrito: "Catacaos", provincia: "Piura", departamento: "Piura" },
  { distrito: "Sullana", provincia: "Sullana", departamento: "Piura" },
  { distrito: "Talara", provincia: "Talara", departamento: "Piura" },
  { distrito: "Paita", provincia: "Paita", departamento: "Piura" },
  // Chiclayo
  { distrito: "Chiclayo", provincia: "Chiclayo", departamento: "Lambayeque" },
  { distrito: "José Leonardo Ortiz", provincia: "Chiclayo", departamento: "Lambayeque" },
  { distrito: "La Victoria", provincia: "Chiclayo", departamento: "Lambayeque" },
  { distrito: "Pimentel", provincia: "Chiclayo", departamento: "Lambayeque" },
  { distrito: "Lambayeque", provincia: "Lambayeque", departamento: "Lambayeque" },
  // Cusco
  { distrito: "Cusco", provincia: "Cusco", departamento: "Cusco" },
  { distrito: "San Sebastián", provincia: "Cusco", departamento: "Cusco" },
  { distrito: "Santiago", provincia: "Cusco", departamento: "Cusco" },
  { distrito: "Wanchaq", provincia: "Cusco", departamento: "Cusco" },
  { distrito: "San Jerónimo", provincia: "Cusco", departamento: "Cusco" },
  // Iquitos
  { distrito: "Iquitos", provincia: "Maynas", departamento: "Loreto" },
  { distrito: "Punchana", provincia: "Maynas", departamento: "Loreto" },
  { distrito: "Belén", provincia: "Maynas", departamento: "Loreto" },
  { distrito: "San Juan Bautista", provincia: "Maynas", departamento: "Loreto" },
  // Huancayo
  { distrito: "Huancayo", provincia: "Huancayo", departamento: "Junín" },
  { distrito: "El Tambo", provincia: "Huancayo", departamento: "Junín" },
  { distrito: "Chilca", provincia: "Huancayo", departamento: "Junín" },
  // Tacna
  { distrito: "Tacna", provincia: "Tacna", departamento: "Tacna" },
  { distrito: "Alto de la Alianza", provincia: "Tacna", departamento: "Tacna" },
  { distrito: "Ciudad Nueva", provincia: "Tacna", departamento: "Tacna" },
  // Puno
  { distrito: "Puno", provincia: "Puno", departamento: "Puno" },
  { distrito: "Juliaca", provincia: "San Román", departamento: "Puno" },
];

export function buscarUbigeo(texto) {
  const t = texto.toLowerCase().trim();
  if (!t) return [];
  return UBIGEO.filter((u) =>
    u.distrito.toLowerCase().includes(t) ||
    u.provincia.toLowerCase().includes(t) ||
    u.departamento.toLowerCase().includes(t)
  ).slice(0, 8);
}

export function autocompletarDistrito(distrito) {
  const encontrado = UBIGEO.find(
    (u) => u.distrito.toLowerCase() === distrito.toLowerCase().trim()
  );
  return encontrado || null;
}
