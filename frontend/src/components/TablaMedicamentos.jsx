import { stockAmigable } from "../utils/stock";
import "../styles/TablaMedicamentos.css";

function TablaMedicamentos({
  medicamentos,
  eliminarMedicamento,
  editarMedicamento,
  categoriasConfig = [],
}) {
  // Enriquecer cada producto con equivalencias de su categoría si no las tiene
  function getEquiv(med) {
    if (med.equivalencias && Object.values(med.equivalencias).some(Boolean)) return med;
    const cat = categoriasConfig.find((c) => c.nombre === med.categoria);
    if (!cat) return med;
    const conv = cat.conversiones?.[med.nombre_empaque_mayor?.toLowerCase()] ||
                 cat.conversiones?.[cat.empaque_mayor_default?.toLowerCase()] || {};
    return {
      ...med,
      tipo_flujo: med.tipo_flujo || cat.tipo_flujo_default,
      nombre_empaque_mayor: med.nombre_empaque_mayor || cat.empaque_mayor_default,
      nombre_unidad_menor: med.nombre_unidad_menor || cat.unidad_menor_default,
      equivalencias: {
        unidades_por_empaque: conv.unidades || null,
        kg_por_empaque: conv.kg || null,
        nivel2_por_empaque: conv.nivel2_cantidad || null,
        unidades_por_nivel2: null,
      },
    };
  }

  return (
    <div className="tabla-wrapper" style={{ marginTop: "18px" }}>
      <table className="tabla">
        <thead>
          <tr>
            <th>ID</th>
            <th>Código</th>
            <th>Nombre</th>
            <th>Categoría</th>
            <th>Laboratorio</th>
            <th>Precio base</th>
            <th>Stock</th>
            <th>Vencimiento</th>
            <th>Acciones</th>
          </tr>
        </thead>
        <tbody>
          {medicamentos.length === 0 ? (
            <tr>
              <td colSpan="9">No hay medicamentos registrados</td>
            </tr>
          ) : (
            medicamentos.map((med) => {
              const prodConEquiv = getEquiv(med);
              const stockTexto = stockAmigable(prodConEquiv, med.stock_actual ?? med.stock ?? 0);
              return (
                <tr key={med.id}>
                  <td>{med.id}</td>
                  <td>{med.codigo}</td>
                  <td>{med.nombre}</td>
                  <td>{med.categoria || "-"}</td>
                  <td>{med.laboratorio || med.proveedor || "-"}</td>
                  <td>S/ {Number(med.precio_venta ?? med.precio ?? 0).toFixed(2)}</td>
                  <td style={{ fontSize: "0.82rem", color: "#374151", whiteSpace: "nowrap" }}>
                    {stockTexto}
                  </td>
                  <td>{med.fecha_vencimiento ? new Date(med.fecha_vencimiento).toLocaleDateString() : "Sin fecha"}</td>
                  <td>
                    <button type="button" className="btn-editar" onClick={() => editarMedicamento(med)}>✏️</button>
                    <button type="button" className="btn-eliminar" onClick={() => eliminarMedicamento(med.id)}>🗑️</button>
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}

export default TablaMedicamentos;