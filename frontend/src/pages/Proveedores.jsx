import { useEffect, useState } from "react";
import { crearProveedor, eliminarProveedor, getProveedores, actualizarProveedor } from "../services/api";

const estadoInicial = { nombre: "", ruc: "", telefono: "", direccion: "" };

function Proveedores() {
  const [proveedor, setProveedor] = useState({ ...estadoInicial });
  const [proveedores, setProveedores] = useState([]);
  const [editandoId, setEditandoId] = useState(null);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const [mensaje, setMensaje] = useState("");

  useEffect(() => { cargarProveedores(); }, []);

  const cargarProveedores = async (query = "") => {
    try { setProveedores(await getProveedores(query)); }
    catch (error) { setMensaje(error.message); }
  };

  const cambiarValor = (e) => {
    const { name, value } = e.target;
    setProveedor({ ...proveedor, [name]: value });
  };

  const limpiarFormulario = () => {
    setProveedor({ ...estadoInicial });
    setEditandoId(null);
    setMensaje("");
    setMostrarForm(false);
  };

  const guardar = async () => {
    if (!proveedor.nombre.trim()) {
      setMensaje("El nombre del proveedor es obligatorio.");
      return;
    }
    const payload = {};
    Object.entries(proveedor).forEach(([k, v]) => {
      const limpio = typeof v === "string" ? v.trim() : v;
      payload[k] = limpio === "" ? null : limpio;
    });
    try {
      if (editandoId !== null) { await actualizarProveedor(editandoId, payload); setMensaje("Proveedor actualizado."); }
      else { await crearProveedor(payload); setMensaje("Proveedor registrado."); }
      limpiarFormulario();
      cargarProveedores(busqueda);
    } catch (error) { setMensaje(error.message); }
  };

  const editarProveedor = (p) => {
    setEditandoId(p.id);
    setProveedor({
      nombre: p.nombre || "",
      ruc: p.ruc || "",
      telefono: p.telefono || "",
      direccion: p.direccion || "",
    });
    setMostrarForm(true);
  };

  const eliminar = async (id) => {
    if (!window.confirm("¿Seguro desea eliminar este proveedor?")) return;
    try {
      const resultado = await eliminarProveedor(id);
      setMensaje(
        resultado?.borrado_fisico
          ? "Proveedor eliminado permanentemente."
          : "Proveedor eliminado. Como tiene compras registradas, se conservó su historial."
      );
      cargarProveedores(busqueda);
    } catch (error) { setMensaje(error.message); }
  };

  const proveedoresFiltrados = proveedores.filter((p) => {
    const q = busqueda.toLowerCase();
    return !busqueda ||
      (p.nombre || "").toLowerCase().includes(q) ||
      (p.ruc || "").toLowerCase().includes(q);
  });

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
        <h1>🚚 Proveedores</h1>
        <button type="button" className="btn-nuevo" onClick={() => { limpiarFormulario(); setMostrarForm(true); }}>
          + Nuevo proveedor
        </button>
      </div>

      {mostrarForm && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && limpiarFormulario()}>
          <div className="modal-box">
            <div className="modal-header">
              <h2>{editandoId !== null ? "✏️ Editar proveedor" : "➕ Nuevo proveedor"}</h2>
              <button type="button" className="btn-cerrar" onClick={limpiarFormulario}>✕</button>
            </div>
            <form className="formulario-grid" onSubmit={(e) => { e.preventDefault(); guardar(); }}>
              <div className="campo campo-full"><label>Nombre</label>
                <input name="nombre" value={proveedor.nombre} onChange={cambiarValor} placeholder="Ej: Distribuidora Salud SAC" />
              </div>
              <div className="campo"><label>RUC <span style={{ fontWeight: 400, color: "#94a3b8" }}>(opcional)</span></label>
                <input name="ruc" value={proveedor.ruc} onChange={cambiarValor} placeholder="20123456789" />
              </div>
              <div className="campo"><label>Teléfono <span style={{ fontWeight: 400, color: "#94a3b8" }}>(opcional)</span></label>
                <input name="telefono" value={proveedor.telefono} onChange={cambiarValor} />
              </div>
              <div className="campo campo-full"><label>Dirección <span style={{ fontWeight: 400, color: "#94a3b8" }}>(opcional)</span></label>
                <input name="direccion" value={proveedor.direccion} onChange={cambiarValor} />
              </div>
              {mensaje && <p className="mensaje campo-full">{mensaje}</p>}
              <div className="modal-acciones campo-full">
                <button type="submit">{editandoId !== null ? "✏️ Actualizar" : "💾 Guardar"}</button>
                <button type="button" className="btn-cancelar" onClick={limpiarFormulario}>Cancelar</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {mensaje && !mostrarForm && <p className="mensaje">{mensaje}</p>}

      <div className="header-filtros">
        <input
          className="input-busqueda"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="🔍 Buscar por nombre o RUC"
        />
      </div>

      <div className="tabla-wrapper">
        <table className="tabla">
          <thead>
            <tr>
              <th>Nombre</th><th>RUC</th><th>Teléfono</th><th>Dirección</th><th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {proveedoresFiltrados.length === 0 ? (
              <tr><td colSpan={5} style={{ color: "#64748b", padding: "16px" }}>No hay proveedores registrados</td></tr>
            ) : proveedoresFiltrados.map((p) => (
              <tr key={p.id}>
                <td>{p.nombre}</td>
                <td>{p.ruc || "—"}</td>
                <td>{p.telefono || "—"}</td>
                <td>{p.direccion || "—"}</td>
                <td>
                  <button type="button" onClick={() => editarProveedor(p)}>✏️</button>{" "}
                  <button type="button" className="btn-danger" onClick={() => eliminar(p.id)}>🗑️</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default Proveedores;
