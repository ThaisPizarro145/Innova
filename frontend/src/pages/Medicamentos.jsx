/**
 * Productos.jsx — Módulo de Productos (distribuidora mayorista/minorista)
 * Rediseño completo con soporte para:
 *  - Presentaciones múltiples con precios independientes
 *  - Equivalencias configurables
 *  - Stock en doble formato (unidad mínima + empaque mayor)
 *  - Costo por unidad mínima
 *  - UI moderna tipo ERP con tarjetas
 */
import { useEffect, useState, useCallback } from "react";
import FormularioProducto from "../components/FormularioProducto";
import {
  crearProducto, eliminarProducto, getProductos, actualizarProducto,
  getCategoriasConfig, actualizarPreciosPresentacion,
} from "../services/api";
import { useCategorias } from "../hooks/useCategorias";
import { stockAmigable } from "../utils/stock";
import "../styles/Compras.css";

// ─── Etiquetas amigables ───────────────────────────────────────────────────────
const ETIQ = {
  kilo:"Kg", saco:"Saco", medio_saco:"½ Saco", caja:"Caja", unidad:"Unidad",
  paquete:"Paquete", maple:"Maple", bolsa:"Bolsa", litro:"Litro", botella:"Botella",
  docena:"Docena", balde:"Balde", jaba:"Jaba", bidon:"Bidón", pack:"Pack",
  galon:"Galón", costal:"Costal", rollo:"Rollo", par:"Par", gramo:"Gramo",
};
function etiq(u) { return ETIQ[u] || (u ? u.charAt(0).toUpperCase()+u.slice(1) : "—"); }
const fmt = (v) => `S/ ${Number(v || 0).toFixed(2)}`;
const fmtNum = (v, dec=2) => Number(v||0) % 1===0 ? String(Number(v||0)) : Number(v||0).toFixed(dec);

// ─── Colores de categoría ──────────────────────────────────────────────────────
const CAT_COLORS = ["#0f6df2","#10b981","#f59e0b","#ef4444","#8b5cf6","#06b6d4","#ec4899","#84cc16","#f97316","#6366f1"];
function catColor(nombre, cats) {
  const c = cats?.find(c=>c.nombre===nombre);
  return c?.color || CAT_COLORS[Math.abs((nombre||"").charCodeAt(0)) % CAT_COLORS.length];
}

// ─── Modal de precios editables por presentación ───────────────────────────────
function ModalPrecios({ producto, categoriasConfig, onGuardar, onCerrar }) {
  const cat = producto.categoria
    ? categoriasConfig.find(c => c.nombre === producto.categoria)
    : null;
  const presentaciones = cat?.unidades_venta ||
    Object.keys(producto.precios_presentacion || {}).filter(k => Number(producto.precios_presentacion[k]) > 0) ||
    [producto.unidad_base || "unidad"];

  const costoBase = Number(producto.costo || 0);
  const [precios, setPrecios] = useState(() => {
    const pp = producto.precios_presentacion || {};
    const init = {};
    presentaciones.forEach(p => { init[p] = Number(pp[p] || 0); });
    return init;
  });
  const [guardando, setGuardando] = useState(false);

  const handleGuardar = async () => {
    setGuardando(true);
    try { await onGuardar(precios); } finally { setGuardando(false); }
  };

  const ganancia = (precio, costo) => {
    if (!costo || !precio) return null;
    return (((precio - costo) / costo) * 100).toFixed(1);
  };

  return (
    <div className="modal-overlay" onClick={e => e.target===e.currentTarget && onCerrar()}>
      <div className="modal-box" style={{ maxWidth:"560px" }}>
        <div className="modal-header">
          <h2>💰 Precios por presentación</h2>
          <button type="button" className="btn-cerrar" onClick={onCerrar}>✕</button>
        </div>
        <div style={{ marginBottom:"12px", fontSize:"0.85rem", color:"#475569" }}>
          <strong>{producto.nombre}</strong> · Costo base: <strong>{fmt(costoBase)}/{producto.unidad_base||"und"}</strong>
        </div>
        <div style={{ display:"flex", flexDirection:"column", gap:"10px" }}>
          {presentaciones.map(pres => {
            const conv = cat?.conversiones?.[pres] || {};
            let costoEst = costoBase;
            if (conv.tipo==="conteo" && conv.unidades>0) costoEst = costoBase * conv.unidades;
            else if (conv.tipo==="peso" && conv.kg>0) costoEst = costoBase * conv.kg;
            else if (conv.tipo==="fraccion" && conv.factor) {
              const baseConv = cat?.conversiones?.[conv.base]||{};
              costoEst = costoBase * (baseConv.kg||1) * conv.factor;
            } else if (conv.tipo==="multinivel") {
              if (conv.kg_por_empaque>0) costoEst = costoBase * conv.kg_por_empaque;
            }
            const g = ganancia(precios[pres], costoEst);
            return (
              <div key={pres} style={{
                display:"flex", alignItems:"center", gap:"12px",
                background:"#f8fafc", borderRadius:"10px", padding:"10px 14px",
                border:"1px solid #e2e8f0",
              }}>
                <div style={{ flex:"0 0 110px" }}>
                  <div style={{ fontWeight:700, fontSize:"0.92rem" }}>{etiq(pres)}</div>
                  {conv.descripcion && <div style={{ fontSize:"0.72rem", color:"#94a3b8" }}>{conv.descripcion}</div>}
                  <div style={{ fontSize:"0.72rem", color:"#64748b" }}>Costo est: {fmt(costoEst)}</div>
                </div>
                <div style={{ flex:1, display:"flex", flexDirection:"column", gap:"3px" }}>
                  <label style={{ fontSize:"0.72rem", color:"#64748b" }}>Precio de venta (S/)</label>
                  <input type="number" min="0" step="0.01"
                    value={precios[pres] || ""}
                    onChange={e => setPrecios(prev=>({...prev, [pres]: Number(e.target.value)}))}
                    style={{ padding:"6px 10px", borderRadius:"8px", border:"2px solid #bfdbfe",
                      background:"#eff6ff", fontWeight:700, color:"#1d4ed8", fontSize:"1.05rem", width:"100%" }}
                  />
                </div>
                {g !== null && (
                  <div style={{
                    fontSize:"0.8rem", fontWeight:700,
                    color: Number(g)>=10 ? "#16a34a" : Number(g)>=0 ? "#d97706" : "#dc2626",
                    background: Number(g)>=10 ? "#f0fdf4" : Number(g)>=0 ? "#fefce8" : "#fef2f2",
                    borderRadius:"8px", padding:"4px 8px", whiteSpace:"nowrap",
                  }}>
                    {g}%
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <div className="modal-acciones" style={{ marginTop:"16px" }}>
          <button type="button" className="btn-nuevo" onClick={handleGuardar} disabled={guardando}>
            {guardando ? "Guardando..." : "💾 Guardar precios"}
          </button>
          <button type="button" className="btn-cancelar"
            style={{ background:"#f1f5f9", border:"none", borderRadius:"10px", padding:"10px 18px", cursor:"pointer" }}
            onClick={onCerrar}>Cancelar</button>
        </div>
      </div>
    </div>
  );
}

// ─── Tarjeta de producto ───────────────────────────────────────────────────────
function TarjetaProducto({ producto, categoriasConfig, onEditar, onEliminar, onEditarPrecios }) {
  const cat = producto.categoria
    ? categoriasConfig.find(c => c.nombre === producto.categoria)
    : null;
  const presentaciones = cat?.unidades_venta ||
    Object.keys(producto.precios_presentacion || {}).filter(k=>Number(producto.precios_presentacion[k])>0);
  const pp = producto.precios_presentacion || {};
  const color = catColor(producto.categoria, categoriasConfig);
  const stock = Number(producto.stock_actual || 0);
  const stockBajo = stock <= Number(producto.stock_minimo || 0);
  const costoBase = Number(producto.costo || 0);

  // Equivalencia legible del empaque mayor
  let equivLabel = null;
  if (producto.tipo_flujo) {
    const eq = producto.equivalencias || {};
    if ((producto.tipo_flujo==="caja_unidad"||producto.tipo_flujo==="saco_unidad") && eq.unidades_por_empaque) {
      equivLabel = `1 ${producto.nombre_empaque_mayor||"Empaque"} = ${eq.unidades_por_empaque} ${producto.nombre_unidad_menor||"Unidades"}`;
    } else if (producto.tipo_flujo==="saco_kilo" && eq.kg_por_empaque) {
      equivLabel = `1 ${producto.nombre_empaque_mayor||"Saco"} = ${eq.kg_por_empaque} kg`;
    } else if (producto.tipo_flujo==="multinivel") {
      if (eq.nivel2_por_empaque) equivLabel = `1 ${producto.nombre_empaque_mayor||"Paquete"} = ${eq.nivel2_por_empaque} ${producto.nombre_nivel2||"Maples"}`;
      if (eq.kg_por_empaque) equivLabel += ` = ${eq.kg_por_empaque} kg`;
    }
  } else if (cat?.conversiones) {
    // Buscar la primera unidad de compra con descripción
    const uc = cat.unidades_compra?.[0];
    if (uc && cat.conversiones[uc]?.descripcion) equivLabel = cat.conversiones[uc].descripcion;
  }

  return (
    <div style={{
      background:"#fff", borderRadius:"16px", border:"1px solid #e2e8f0",
      overflow:"hidden", transition:"box-shadow 0.2s",
      boxShadow:"0 1px 4px rgba(0,0,0,0.06)",
    }}
      onMouseEnter={e=>e.currentTarget.style.boxShadow="0 4px 16px rgba(0,0,0,0.12)"}
      onMouseLeave={e=>e.currentTarget.style.boxShadow="0 1px 4px rgba(0,0,0,0.06)"}
    >
      {/* Header de color con categoría */}
      <div style={{ background:`linear-gradient(135deg, ${color}22, ${color}11)`, borderBottom:`3px solid ${color}`, padding:"14px 16px" }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ fontWeight:700, fontSize:"0.97rem", color:"#1e293b", marginBottom:"2px", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
              {producto.nombre}
            </div>
            <div style={{ fontSize:"0.75rem", color:"#64748b" }}>{producto.codigo}</div>
          </div>
          {producto.categoria && (
            <span style={{ background:`${color}22`, color, border:`1px solid ${color}44`, borderRadius:"20px", padding:"2px 8px", fontSize:"0.7rem", fontWeight:700, whiteSpace:"nowrap", marginLeft:"8px" }}>
              {producto.categoria}
            </span>
          )}
        </div>
        {producto.proveedor && (
          <div style={{ fontSize:"0.72rem", color:"#64748b", marginTop:"4px" }}>🏢 {producto.proveedor}</div>
        )}
      </div>

      {/* Body */}
      <div style={{ padding:"14px 16px" }}>
        {/* Equivalencia */}
        {equivLabel && (
          <div style={{ background:"#f0f9ff", border:"1px solid #bae6fd", borderRadius:"8px", padding:"6px 10px", fontSize:"0.75rem", color:"#0369a1", marginBottom:"10px", fontWeight:600 }}>
            📐 {equivLabel}
          </div>
        )}

        {/* Stock */}
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:"10px" }}>
          <span style={{ fontSize:"0.78rem", color:"#64748b" }}>Stock</span>
          <span style={{
            fontWeight:700, fontSize:"0.88rem",
            color: stockBajo ? "#dc2626" : "#16a34a",
            background: stockBajo ? "#fef2f2" : "#f0fdf4",
            borderRadius:"20px", padding:"3px 10px",
          }}>
            {stockBajo ? "⚠️ " : "✓ "}{stockAmigable(producto, stock)}
          </span>
        </div>

        {/* Costo base */}
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:"12px", padding:"6px 0", borderTop:"1px solid #f1f5f9", borderBottom:"1px solid #f1f5f9" }}>
          <span style={{ fontSize:"0.78rem", color:"#64748b" }}>Costo/{producto.unidad_base||"und"}</span>
          <span style={{ fontWeight:700, fontSize:"0.88rem", color:"#475569" }}>{fmt(costoBase)}</span>
        </div>

        {/* Precios por presentación */}
        {presentaciones.length > 0 ? (
          <div>
            <div style={{ fontSize:"0.72rem", fontWeight:700, color:"#94a3b8", textTransform:"uppercase", letterSpacing:"0.06em", marginBottom:"6px" }}>Precios de venta</div>
            <div style={{ display:"flex", flexWrap:"wrap", gap:"5px" }}>
              {presentaciones.map(pres => {
                const precio = Number(pp[pres] || 0);
                const g = precio > 0 && costoBase > 0 ? ((precio-costoBase)/costoBase*100).toFixed(0) : null;
                return (
                  <div key={pres} style={{
                    flex:"1 1 auto", minWidth:"80px",
                    background:"#f8fafc", borderRadius:"8px", padding:"6px 8px",
                    border:"1px solid #e2e8f0", textAlign:"center",
                  }}>
                    <div style={{ fontSize:"0.68rem", color:"#94a3b8", marginBottom:"2px" }}>{etiq(pres)}</div>
                    <div style={{ fontWeight:700, fontSize:"0.9rem", color:"#0f6df2" }}>
                      {precio > 0 ? fmt(precio) : <span style={{ color:"#cbd5e1" }}>—</span>}
                    </div>
                    {g !== null && (
                      <div style={{ fontSize:"0.65rem", color: Number(g)>=10?"#16a34a":"#d97706", fontWeight:600 }}>+{g}%</div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div style={{ fontSize:"0.8rem", color:"#94a3b8", textAlign:"center", padding:"8px 0" }}>
            Sin presentaciones configuradas
          </div>
        )}
      </div>

      {/* Acciones */}
      <div style={{ display:"flex", gap:"6px", padding:"10px 16px", borderTop:"1px solid #f1f5f9", background:"#fafafa" }}>
        <button type="button" onClick={() => onEditarPrecios(producto)}
          style={{ flex:1, background:"#f0fdf4", color:"#16a34a", border:"1px solid #bbf7d0", borderRadius:"8px", padding:"6px 0", cursor:"pointer", fontSize:"0.8rem", fontWeight:600 }}>
          💰 Precios
        </button>
        <button type="button" onClick={() => onEditar(producto)}
          style={{ flex:1, background:"#eff6ff", color:"#0f6df2", border:"1px solid #bfdbfe", borderRadius:"8px", padding:"6px 0", cursor:"pointer", fontSize:"0.8rem", fontWeight:600 }}>
          ✏️ Editar
        </button>
        <button type="button" onClick={() => onEliminar(producto.id)}
          style={{ background:"#fef2f2", color:"#ef4444", border:"1px solid #fecaca", borderRadius:"8px", padding:"6px 10px", cursor:"pointer", fontSize:"0.8rem" }}>
          🗑️
        </button>
      </div>
    </div>
  );
}

// ─── Componente principal ──────────────────────────────────────────────────────
function Medicamentos() {
  const categorias = useCategorias();
  const [categoriasConfig, setCategoriasConfig] = useState([]);
  const [cargandoCategorias, setCargandoCategorias] = useState(true);
  const [productos, setProductos] = useState([]);
  const [editandoId, setEditandoId] = useState(null);
  const [mostrarFormulario, setMostrarFormulario] = useState(false);
  const [productoEditandoObj, setProductoEditandoObj] = useState(null);
  const [productoPrecios, setProductoPrecios] = useState(null);
  const [busqueda, setBusqueda] = useState("");
  const [filtroCategoria, setFiltroCategoria] = useState("");
  const [vistaTabla, setVistaTabla] = useState(false);
  const [mensaje, setMensaje] = useState("");

  useEffect(() => { cargarProductos(); }, []);
  useEffect(() => {
    getCategoriasConfig()
      .then(setCategoriasConfig)
      .catch(() => {})
      .finally(() => setCargandoCategorias(false));
  }, []);

  const cargarProductos = useCallback(async (query = "") => {
    try { setProductos(await getProductos(query)); }
    catch (e) { setMensaje(e.message); }
  }, []);

  const limpiarFormulario = () => {
    setEditandoId(null);
    setProductoEditandoObj(null);
    setMostrarFormulario(false);
    setMensaje("");
  };

  const editarProducto = (prod) => {
    setEditandoId(prod.id);
    setProductoEditandoObj(prod);
    setMostrarFormulario(true);
  };

  const eliminarProducto = async (id) => {
    if (!window.confirm("¿Eliminar este producto?")) return;
    try {
      await eliminarProducto(id);
      cargarProductos(busqueda);
      setMensaje("Producto eliminado.");
    } catch(e) { setMensaje(e.message); }
  };

  const handleGuardarProducto = async (payload) => {
    if (editandoId !== null) {
      await actualizarProducto(editandoId, payload);
      setMensaje("Producto actualizado.");
    } else {
      await crearProducto(payload);
      setMensaje("Producto creado.");
    }
    limpiarFormulario();
    cargarProductos(busqueda);
  };

  const handleGuardarPrecios = async (precios) => {
    await actualizarPreciosPresentacion(productoPrecios.id, precios);
    setProductoPrecios(null);
    setMensaje("Precios actualizados.");
    cargarProductos(busqueda);
  };

  const exportarExcel = () => {
    const enc = ["Código","Nombre","Categoría","Proveedor","Stock","Unidad","Costo","Precio venta"];
    const filas = productosFiltrados.map(p=>[
      p.codigo, p.nombre, p.categoria||"", p.proveedor||p.laboratorio||"",
      p.stock_actual??0, p.unidad_base||"", Number(p.costo||0).toFixed(2), Number(p.precio_venta||0).toFixed(2),
    ]);
    const csv = [enc,...filas].map(r=>r.join(",")).join("\n");
    const blob = new Blob(["\uFEFF"+csv],{type:"text/csv;charset=utf-8;"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href=url; a.download="productos.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  const productosFiltrados = productos.filter(p => {
    const matchB = !busqueda ||
      p.nombre?.toLowerCase().includes(busqueda.toLowerCase()) ||
      p.codigo?.toLowerCase().includes(busqueda.toLowerCase()) ||
      (p.proveedor||p.laboratorio||"")?.toLowerCase().includes(busqueda.toLowerCase());
    const matchC = !filtroCategoria || p.categoria === filtroCategoria;
    return matchB && matchC;
  });

  // Stats
  const totalStock = productos.reduce((a,p)=>a+Number(p.stock_actual||0),0);
  const stockBajoCount = productos.filter(p=>Number(p.stock_actual||0)<=Number(p.stock_minimo||0)).length;
  const sinPrecios = productos.filter(p=>!p.precios_presentacion||Object.keys(p.precios_presentacion).length===0).length;

  return (
    <div>
      {/* Formulario modal */}
      {mostrarFormulario && (
        <FormularioProducto
          productoEditando={editandoId!==null ? {...productoEditandoObj, id:editandoId} : null}
          categorias={categoriasConfig}
          cargandoCategorias={cargandoCategorias}
          onGuardar={handleGuardarProducto}
          onCancelar={limpiarFormulario}
        />
      )}

      {/* Modal precios */}
      {productoPrecios && (
        <ModalPrecios
          producto={productoPrecios}
          categoriasConfig={categoriasConfig}
          onGuardar={handleGuardarPrecios}
          onCerrar={() => setProductoPrecios(null)}
        />
      )}

      {/* Header */}
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:"20px", flexWrap:"wrap", gap:"10px" }}>
        <div>
          <h1 style={{ margin:0, fontSize:"1.5rem" }}>📦 Productos</h1>
          <p style={{ margin:"4px 0 0", fontSize:"0.82rem", color:"#64748b" }}>Catálogo de productos · Equivalencias · Precios por presentación</p>
        </div>
        <div style={{ display:"flex", gap:"8px", flexWrap:"wrap" }}>
          <button type="button" className="btn-export" onClick={exportarExcel}>⬇ Excel</button>
          <button type="button" onClick={() => setVistaTabla(v=>!v)}
            style={{ background:"#f1f5f9", border:"1px solid #e2e8f0", borderRadius:"8px", padding:"8px 14px", cursor:"pointer", fontSize:"0.85rem" }}>
            {vistaTabla ? "⊞ Tarjetas" : "☰ Tabla"}
          </button>
          <button type="button" className="btn-nuevo" onClick={() => { limpiarFormulario(); setMostrarFormulario(true); }}>
            + Nuevo producto
          </button>
        </div>
      </div>

      {/* KPI cards */}
      <div className="cards" style={{ marginBottom:"20px" }}>
        <div className="info-card"><h2>{productos.length}</h2><h3>Total productos</h3></div>
        <div className="info-card" style={{ background: stockBajoCount>0?"#fef2f2":"" }}>
          <h2 style={{ color:stockBajoCount>0?"#dc2626":"" }}>{stockBajoCount}</h2>
          <h3>Stock bajo</h3>
        </div>
        <div className="info-card"><h2>{fmtNum(totalStock,1)}</h2><h3>Total en stock</h3></div>
        <div className="info-card" style={{ background:sinPrecios>0?"#fefce8":"" }}>
          <h2 style={{ color:sinPrecios>0?"#d97706":"" }}>{sinPrecios}</h2>
          <h3>Sin precios</h3>
        </div>
      </div>

      {/* Filtros */}
      <div className="header-filtros" style={{ marginBottom:"16px" }}>
        <input className="input-busqueda" value={busqueda}
          onChange={e=>{ setBusqueda(e.target.value); cargarProductos(e.target.value); }}
          placeholder="🔍 Buscar por nombre, código o proveedor" style={{ flex:1 }} />
        <div className="filtros-grupo">
          <label>Categoría</label>
          <select value={filtroCategoria} onChange={e=>setFiltroCategoria(e.target.value)}>
            <option value="">Todas</option>
            {categoriasConfig.map(c=>(
              <option key={c.id} value={c.nombre}>{c.icono} {c.nombre}</option>
            ))}
          </select>
        </div>
      </div>

      {mensaje && <p className="mensaje" style={{ marginBottom:"12px" }}>{mensaje}</p>}

      {/* Vista tarjetas */}
      {!vistaTabla && (
        <div style={{
          display:"grid",
          gridTemplateColumns:"repeat(auto-fill, minmax(260px, 1fr))",
          gap:"16px",
        }}>
          {productosFiltrados.length === 0 ? (
            <div style={{ gridColumn:"1/-1", textAlign:"center", color:"#94a3b8", padding:"48px" }}>
              No hay productos. Crea uno con "+ Nuevo producto"
            </div>
          ) : productosFiltrados.map(p => (
            <TarjetaProducto
              key={p.id}
              producto={p}
              categoriasConfig={categoriasConfig}
              onEditar={editarProducto}
              onEliminar={id => {
                if (!window.confirm("¿Eliminar este producto?")) return;
                eliminarProducto(id).then(()=>{ cargarProductos(busqueda); setMensaje("Eliminado."); }).catch(e=>setMensaje(e.message));
              }}
              onEditarPrecios={setProductoPrecios}
            />
          ))}
        </div>
      )}

      {/* Vista tabla */}
      {vistaTabla && (
        <div className="tabla-wrapper">
          <table className="tabla">
            <thead>
              <tr>
                <th>Código</th>
                <th>Nombre</th>
                <th>Categoría</th>
                <th>Equivalencia</th>
                <th>Costo base</th>
                <th>Stock</th>
                <th>Presentaciones y precios</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {productosFiltrados.length===0 ? (
                <tr><td colSpan="8" style={{ textAlign:"center", color:"#94a3b8", padding:"24px" }}>Sin productos</td></tr>
              ) : productosFiltrados.map(p => {
                const cat = categoriasConfig.find(c=>c.nombre===p.categoria);
                const presentaciones = cat?.unidades_venta || Object.keys(p.precios_presentacion||{}).filter(k=>Number(p.precios_presentacion[k])>0);
                const eq = p.equivalencias||{};
                let equivStr = "—";
                if (p.tipo_flujo==="saco_kilo"&&eq.kg_por_empaque) equivStr=`1 ${p.nombre_empaque_mayor||"Saco"}=${eq.kg_por_empaque}kg`;
                else if ((p.tipo_flujo==="caja_unidad"||p.tipo_flujo==="saco_unidad")&&eq.unidades_por_empaque) equivStr=`1 ${p.nombre_empaque_mayor||"Caja"}=${eq.unidades_por_empaque} und`;
                else if (p.tipo_flujo==="multinivel"&&eq.nivel2_por_empaque) equivStr=`1 ${p.nombre_empaque_mayor||"Paquete"}=${eq.nivel2_por_empaque} ${p.nombre_nivel2||"maple"}`;
                else if (cat?.conversiones) {
                  const uc = cat.unidades_compra?.[0];
                  if (uc&&cat.conversiones[uc]?.descripcion) equivStr=cat.conversiones[uc].descripcion;
                }
                const stock = Number(p.stock_actual||0);
                const stockBajo = stock <= Number(p.stock_minimo||0);
                return (
                  <tr key={p.id}>
                    <td style={{ fontSize:"0.82rem", color:"#64748b" }}>{p.codigo}</td>
                    <td style={{ fontWeight:600 }}>{p.nombre}</td>
                    <td>
                      {p.categoria ? (
                        <span style={{ background:`${catColor(p.categoria,categoriasConfig)}22`, color:catColor(p.categoria,categoriasConfig), borderRadius:"20px", padding:"2px 8px", fontSize:"0.75rem", fontWeight:700 }}>
                          {p.categoria}
                        </span>
                      ) : "—"}
                    </td>
                    <td style={{ fontSize:"0.8rem", color:"#475569" }}>{equivStr}</td>
                    <td style={{ fontWeight:600 }}>{fmt(p.costo)}<br/><span style={{ fontSize:"0.68rem", color:"#94a3b8" }}>/{p.unidad_base||"und"}</span></td>
                    <td>
                      <span style={{ color:stockBajo?"#dc2626":"#16a34a", fontWeight:600, fontSize:"0.82rem" }}>
                        {stockBajo?"⚠️ ":""}{stockAmigable(p, stock)}
                      </span>
                    </td>
                    <td>
                      <div style={{ display:"flex", flexWrap:"wrap", gap:"4px" }}>
                        {presentaciones.map(pres=>(
                          <span key={pres} style={{ background:"#eff6ff", color:"#0f6df2", borderRadius:"6px", padding:"2px 6px", fontSize:"0.72rem", fontWeight:600 }}>
                            {etiq(pres)}: {fmt(p.precios_presentacion?.[pres]||0)}
                          </span>
                        ))}
                        {presentaciones.length===0&&<span style={{ color:"#94a3b8", fontSize:"0.78rem" }}>Sin precios</span>}
                      </div>
                    </td>
                    <td>
                      <div style={{ display:"flex", gap:"4px" }}>
                        <button type="button" title="Editar precios"
                          style={{ background:"#f0fdf4", color:"#16a34a", border:"1px solid #bbf7d0", borderRadius:"6px", padding:"5px 8px", cursor:"pointer", fontSize:"0.8rem" }}
                          onClick={()=>setProductoPrecios(p)}>💰</button>
                        <button type="button" title="Editar producto"
                          style={{ background:"#eff6ff", color:"#0f6df2", border:"1px solid #bfdbfe", borderRadius:"6px", padding:"5px 8px", cursor:"pointer", fontSize:"0.8rem" }}
                          onClick={()=>editarProducto(p)}>✏️</button>
                        <button type="button" title="Eliminar"
                          style={{ background:"#fef2f2", color:"#ef4444", border:"1px solid #fecaca", borderRadius:"6px", padding:"5px 8px", cursor:"pointer", fontSize:"0.8rem" }}
                          onClick={()=>{ if(!window.confirm("¿Eliminar?"))return; eliminarProducto(p.id).then(()=>{ cargarProductos(busqueda); }).catch(e=>setMensaje(e.message)); }}>🗑️</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default Medicamentos;
