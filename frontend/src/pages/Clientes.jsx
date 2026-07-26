import { useEffect, useState } from "react";
import { crearCliente, eliminarCliente, getClientes, getHistorialCliente, actualizarCliente } from "../services/api";
import { useConsultaDoc } from "../hooks/useConsultaDoc";
import { buscarUbigeo, autocompletarDistrito } from "../data/ubigeo";

function formatearSoles(valor) { return `S/ ${Number(valor || 0).toFixed(2)}`; }

const estadoInicial = {
  dni: "", ruc: "", nombre: "", apellidos: "", razon_social: "",
  direccion: "", distrito: "", provincia: "", departamento: "",
  celular: "", email: "", fecha_nacimiento: "", observaciones: "",
};

function Clientes() {
  const [cliente, setCliente] = useState({ ...estadoInicial });
  const [clientes, setClientes] = useState([]);
  const [editandoId, setEditandoId] = useState(null);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const [filtroDistrito, setFiltroDistrito] = useState("");
  const [historial, setHistorial] = useState([]);
  const [mensaje, setMensaje] = useState("");
  const [sugerenciasUbigeo, setSugerenciasUbigeo] = useState([]);

  // Consulta SUNAT/RENIEC
  const alRecibirDatos = (data, tipo) => {
    if (tipo === "ruc") {
      setCliente((prev) => ({
        ...prev,
        ruc: data.ruc || prev.ruc,
        razon_social: data.razon_social || data.nombre || prev.razon_social,
        direccion: data.direccion || prev.direccion,
        distrito: data.distrito || prev.distrito,
        provincia: data.provincia || prev.provincia,
        departamento: data.departamento || prev.departamento,
      }));
    } else {
      setCliente((prev) => ({
        ...prev,
        dni: data.dni || prev.dni,
        nombre: data.nombres || prev.nombre,
        apellidos: `${data.apellido_paterno || ""} ${data.apellido_materno || ""}`.trim() || prev.apellidos,
      }));
    }
    setMensaje("✓ Datos cargados desde SUNAT/RENIEC.");
  };

  const { consultando, errorConsulta, consultarDoc } = useConsultaDoc(alRecibirDatos);

  useEffect(() => { cargarClientes(); }, []);

  const cargarClientes = async (query = "") => {
    try { setClientes(await getClientes(query)); }
    catch (error) { setMensaje(error.message); }
  };

  const cambiarValor = (e) => {
    const { name, value } = e.target;
    setCliente({ ...cliente, [name]: value });

    // Autocomplete ubigeo al escribir en distrito
    if (name === "distrito") {
      const sugerencias = buscarUbigeo(value);
      setSugerenciasUbigeo(sugerencias);
      // Si coincide exactamente, rellenar provincia y departamento
      const exacto = autocompletarDistrito(value);
      if (exacto) {
        setCliente((prev) => ({
          ...prev,
          distrito: value,
          provincia: exacto.provincia,
          departamento: exacto.departamento,
        }));
        setSugerenciasUbigeo([]);
      }
    } else {
      setSugerenciasUbigeo([]);
    }
  };

  const elegirUbigeo = (u) => {
    setCliente((prev) => ({
      ...prev,
      distrito: u.distrito,
      provincia: u.provincia,
      departamento: u.departamento,
    }));
    setSugerenciasUbigeo([]);
  };

  const limpiarFormulario = () => {
    setCliente({ ...estadoInicial }); setEditandoId(null);
    setHistorial([]); setMensaje(""); setMostrarForm(false);
  };

  const guardar = async () => {
    if (!cliente.dni && !cliente.ruc && !cliente.nombre && !cliente.razon_social) {
      setMensaje("Complete al menos DNI, RUC o nombre/razón social."); return;
    }
    // Limpiar campos vacíos a null (y recortar espacios) para no enviar strings vacíos o con espacios de más
    const payload = {};
    Object.entries(cliente).forEach(([k, v]) => {
      const limpio = typeof v === "string" ? v.trim() : v;
      payload[k] = (limpio === "" || limpio === undefined) ? null : limpio;
    });
    try {
      if (editandoId !== null) { await actualizarCliente(editandoId, payload); setMensaje("Cliente actualizado."); }
      else { await crearCliente(payload); setMensaje("Cliente registrado."); }
      limpiarFormulario(); cargarClientes(busqueda);
    } catch (error) { setMensaje(error.message); }
  };

  const editarCliente = (c) => {
    setEditandoId(c.id);
    setCliente({
      dni: c.dni || "", ruc: c.ruc || "", nombre: c.nombre || "",
      apellidos: c.apellidos || "", razon_social: c.razon_social || "",
      direccion: c.direccion || "", distrito: c.distrito || "",
      provincia: c.provincia || "", departamento: c.departamento || "",
      celular: c.celular || "", email: c.email || "",
      fecha_nacimiento: c.fecha_nacimiento || "", observaciones: c.observaciones || "",
    });
    setMostrarForm(true);
  };

  const eliminar = async (id) => {
    if (!window.confirm("¿Seguro desea eliminar al cliente?")) return;
    try {
      const resultado = await eliminarCliente(id);
      setMensaje(
        resultado?.borrado_fisico
          ? "Cliente eliminado permanentemente de la base de datos."
          : "Cliente eliminado. Como tiene ventas registradas, se conservó su historial (no se borra de la base de datos)."
      );
      cargarClientes(busqueda);
    } catch (error) { setMensaje(error.message); }
  };

  const verHistorial = async (id) => {
    try { setHistorial(await getHistorialCliente(id)); }
    catch (error) { setMensaje(error.message); }
  };

  // Filtro local por nombre, apellido y distrito
  const clientesFiltrados = clientes.filter((c) => {
    const q = busqueda.toLowerCase();
    const matchBusq = !busqueda ||
      (c.nombre || "").toLowerCase().includes(q) ||
      (c.apellidos || "").toLowerCase().includes(q) ||
      (c.dni || "").toLowerCase().includes(q) ||
      (c.ruc || "").toLowerCase().includes(q);
    const matchDistrito = !filtroDistrito ||
      (c.distrito || "").toLowerCase().includes(filtroDistrito.toLowerCase());
    return matchBusq && matchDistrito;
  });

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
        <h1>👥 Clientes</h1>
        <button type="button" className="btn-nuevo" onClick={() => { limpiarFormulario(); setMostrarForm(true); }}>
          + Nuevo cliente
        </button>
      </div>

      {/* Modal formulario */}
      {mostrarForm && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && limpiarFormulario()}>
          <div className="modal-box">
            <div className="modal-header">
              <h2>{editandoId !== null ? "✏️ Editar cliente" : "➕ Nuevo cliente"}</h2>
              <button type="button" className="btn-cerrar" onClick={limpiarFormulario}>✕</button>
            </div>
            <div className="formulario-grid">
              <div className="campo"><label>DNI</label>
                <div style={{ display: "flex", gap: "6px" }}>
                  <input name="dni" value={cliente.dni} onChange={cambiarValor} placeholder="12345678" style={{ flex: 1 }} />
                  <button type="button" title="Consultar RENIEC"
                    disabled={consultando}
                    onClick={() => consultarDoc(cliente.dni)}
                    style={{ background: "#0f6df2", color: "white", border: "none", borderRadius: "8px", padding: "8px 10px", cursor: "pointer", fontSize: "0.8rem", whiteSpace: "nowrap" }}>
                    {consultando ? "⏳" : "🔍 RENIEC"}
                  </button>
                </div>
              </div>
              <div className="campo"><label>RUC</label>
                <div style={{ display: "flex", gap: "6px" }}>
                  <input name="ruc" value={cliente.ruc} onChange={cambiarValor} placeholder="20123456789" style={{ flex: 1 }} />
                  <button type="button" title="Consultar SUNAT"
                    disabled={consultando}
                    onClick={() => consultarDoc(cliente.ruc)}
                    style={{ background: "#10b981", color: "white", border: "none", borderRadius: "8px", padding: "8px 10px", cursor: "pointer", fontSize: "0.8rem", whiteSpace: "nowrap" }}>
                    {consultando ? "⏳" : "🔍 SUNAT"}
                  </button>
                </div>
              </div>
              {errorConsulta && <p className="campo-full" style={{ color: "#dc2626", fontSize: "0.8rem", margin: 0 }}>{errorConsulta}</p>}
              <div className="campo"><label>Nombre</label><input name="nombre" value={cliente.nombre} onChange={cambiarValor} /></div>
              <div className="campo"><label>Apellidos</label><input name="apellidos" value={cliente.apellidos} onChange={cambiarValor} /></div>
              <div className="campo"><label>Razón social</label><input name="razon_social" value={cliente.razon_social} onChange={cambiarValor} /></div>
              <div className="campo"><label>Dirección <span style={{fontWeight:400,color:"#94a3b8"}}>(opcional)</span></label><input name="direccion" value={cliente.direccion} onChange={cambiarValor} /></div>
              <div className="campo" style={{ position: "relative" }}>
                <label>Distrito</label>
                <input name="distrito" value={cliente.distrito} onChange={cambiarValor} placeholder="Ej: Miraflores" autoComplete="off" />
                {sugerenciasUbigeo.length > 0 && (
                  <div className="cliente-dropdown" style={{ top: "100%" }}>
                    {sugerenciasUbigeo.map((u, i) => (
                      <div key={i} className="cliente-dropdown-item" onClick={() => elegirUbigeo(u)}>
                        <span className="cliente-dd-nombre">{u.distrito}</span>
                        <span className="cliente-dd-doc">{u.provincia} — {u.departamento}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="campo"><label>Provincia</label><input name="provincia" value={cliente.provincia} onChange={cambiarValor} readOnly={!!cliente.distrito && !!cliente.provincia} style={cliente.provincia ? { background: "#f0fdf4" } : {}} /></div>
              <div className="campo"><label>Departamento</label><input name="departamento" value={cliente.departamento} onChange={cambiarValor} readOnly={!!cliente.distrito && !!cliente.departamento} style={cliente.departamento ? { background: "#f0fdf4" } : {}} /></div>
              <div className="campo"><label>Celular</label><input name="celular" value={cliente.celular} onChange={cambiarValor} /></div>
              <div className="campo"><label>Email</label><input name="email" value={cliente.email} onChange={cambiarValor} /></div>
              <div className="campo"><label>Fecha de nacimiento <span style={{fontWeight:400,color:"#94a3b8"}}>(opcional)</span></label><input type="date" name="fecha_nacimiento" value={cliente.fecha_nacimiento} onChange={cambiarValor} /></div>
              <div className="campo campo-full"><label>Observaciones</label><input name="observaciones" value={cliente.observaciones} onChange={cambiarValor} /></div>
              {mensaje && <p className="mensaje campo-full">{mensaje}</p>}
              <div className="modal-acciones campo-full">
                <button type="button" onClick={guardar}>{editandoId !== null ? "✏️ Actualizar" : "💾 Guardar"}</button>
                <button type="button" className="btn-cancelar" onClick={limpiarFormulario}>Cancelar</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {mensaje && !mostrarForm && <p className="mensaje">{mensaje}</p>}

      {/* Encabezado con filtros */}
      <div className="header-filtros">
        <input
          className="input-busqueda"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="🔍 Buscar por nombre, apellido, DNI o RUC"
        />
        <div className="filtros-grupo">
          <label>Filtrar por distrito</label>
          <input value={filtroDistrito} onChange={(e) => setFiltroDistrito(e.target.value)} placeholder="Ej: Miraflores" />
        </div>
      </div>

      {/* Tabla de 3 columnas tipo grid */}
      <div className="clientes-grid">
        {clientesFiltrados.length === 0 ? (
          <p style={{ gridColumn: "1/-1", color: "#64748b", padding: "16px" }}>No hay clientes registrados</p>
        ) : clientesFiltrados.map((c) => (
          <div key={c.id} className="cliente-card">
            <div className="cliente-card-header">
              <span className="cliente-nombre">{c.nombre || c.razon_social || "Sin nombre"} {c.apellidos || ""}</span>
              <span className="cliente-id">#{c.id}</span>
            </div>
            <div className="cliente-datos">
              {(c.dni || c.ruc) && <span>🪪 {c.dni || c.ruc}</span>}
              {c.celular && <span>📱 {c.celular}</span>}
              {c.email && <span>✉️ {c.email}</span>}
              {c.distrito && <span>📍 {c.distrito}{c.provincia ? `, ${c.provincia}` : ""}</span>}
            </div>
            <div className="cliente-acciones">
              <button type="button" onClick={() => editarCliente(c)}>✏️ Editar</button>
              <button type="button" onClick={() => verHistorial(c.id)}>📄 Historial</button>
              <button type="button" className="btn-danger" onClick={() => eliminar(c.id)}>🗑️</button>
            </div>
          </div>
        ))}
      </div>

      {historial.length > 0 && (
        <>
          <h2 style={{ marginTop: "24px", marginBottom: "12px" }}>Historial de compras</h2>
          <div className="tabla-wrapper">
            <table className="tabla">
              <thead>
                <tr>
                  <th>ID</th><th>Fecha</th><th>Total</th><th>Forma de pago</th><th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {historial.map((v) => (
                  <tr key={v.id}>
                    <td>{v.id}</td>
                    <td>{new Date(v.fecha).toLocaleString()}</td>
                    <td>{formatearSoles(v.total)}</td>
                    <td>{v.forma_pago}</td>
                    <td>{v.estado}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

export default Clientes;
