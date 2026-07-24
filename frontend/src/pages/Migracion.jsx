import { useState } from "react";

const BASE_URL = (import.meta.env.VITE_API_URL || "http://127.0.0.1:8000").replace(/\/$/, "");

const KEYS = {
  productos: "farmasys_productos",
  clientes: "farmasys_clientes",
  ventas: "farmasys_ventas",
  movimientos: "farmasys_movimientos",
  categorias: "bodega_categorias",
};

function leerStorage(key) {
  try {
    return JSON.parse(localStorage.getItem(key) || "[]");
  } catch {
    return [];
  }
}

async function post(path, body) {
  const r = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const err = await r.text();
    throw new Error(`${r.status}: ${err}`);
  }
  return r.status === 204 ? null : r.json();
}

export default function Migracion() {
  const [log, setLog] = useState([]);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);

  function addLog(msg, tipo = "info") {
    setLog((prev) => [...prev, { msg, tipo, t: new Date().toLocaleTimeString() }]);
  }

  async function migrar() {
    setRunning(true);
    setLog([]);
    setDone(false);

    // 1. Categorías
    const categorias = leerStorage(KEYS.categorias);
    addLog(`Encontradas ${categorias.length} categorías en localStorage`);
    const mapaCategoria = {}; // nombre → id real
    for (const cat of categorias) {
      try {
        const res = await post("/categorias", {
          nombre: cat.nombre,
          descripcion: cat.descripcion || "",
          icono: cat.icono || "📦",
          color: cat.color || "#0f6df2",
        });
        mapaCategoria[cat.nombre] = res.id;
        addLog(`✅ Categoría "${cat.nombre}" migrada (id ${res.id})`);
      } catch (e) {
        // Si ya existe, intentar obtenerla
        if (e.message.includes("409") || e.message.toLowerCase().includes("existe")) {
          addLog(`⚠️ Categoría "${cat.nombre}" ya existe, omitida`);
        } else {
          addLog(`❌ Categoría "${cat.nombre}": ${e.message}`, "error");
        }
      }
    }

    // 2. Clientes
    const clientes = leerStorage(KEYS.clientes);
    addLog(`Encontrados ${clientes.length} clientes en localStorage`);
    const mapaCliente = {}; // id local → id real
    for (const c of clientes) {
      try {
        const payload = {
          tipo_documento: c.tipo_documento || "DNI",
          numero_documento: c.numero_documento || c.dni || c.ruc || "",
          nombre: c.nombre || "",
          apellidos: c.apellidos || "",
          razon_social: c.razon_social || "",
          celular: c.celular || "",
          email: c.email || "",
          direccion: c.direccion || "",
          notas: c.notas || "",
        };
        const res = await post("/clientes", payload);
        mapaCliente[String(c.id)] = res.id;
        addLog(`✅ Cliente "${payload.nombre || payload.razon_social}" migrado (id ${res.id})`);
      } catch (e) {
        addLog(`❌ Cliente "${c.nombre || c.razon_social}": ${e.message}`, "error");
      }
    }

    // 3. Productos
    const productos = leerStorage(KEYS.productos);
    addLog(`Encontrados ${productos.length} productos en localStorage`);
    const mapaProducto = {}; // id local → id real
    for (const p of productos) {
      try {
        const payload = {
          codigo: p.codigo || "",
          nombre: p.nombre || "",
          descripcion: p.descripcion || "",
          categoria: p.categoria || "",
          laboratorio: p.laboratorio || "",
          lote: p.lote || "",
          fecha_vencimiento: p.fecha_vencimiento || null,
          stock_actual: Number(p.stock_actual || 0),
          stock_minimo: Number(p.stock_minimo || 0),
          precio_venta: Number(p.precio_venta || 0),
          costo: Number(p.costo || 0),
          unidad_base: p.unidad_base || "unidad",
          tipo_flujo: p.tipo_flujo || "",
          nombre_empaque_mayor: p.nombre_empaque_mayor || "",
          nombre_unidad_menor: p.nombre_unidad_menor || "",
          nombre_nivel2: p.nombre_nivel2 || "",
          equivalencias: p.equivalencias || {},
          precios_presentacion: p.precios_presentacion || {},
        };
        const res = await post("/inventario/productos", payload);
        mapaProducto[String(p.id)] = res.id;
        addLog(`✅ Producto "${p.nombre}" migrado (id ${res.id})`);
      } catch (e) {
        addLog(`❌ Producto "${p.nombre}": ${e.message}`, "error");
      }
    }

    addLog("✅ Migración completada.");
    addLog("Puedes borrar el localStorage después de verificar que todo está bien en la BD.");
    setDone(true);
    setRunning(false);
  }

  function limpiarStorage() {
    Object.values(KEYS).forEach((k) => localStorage.removeItem(k));
    addLog("🗑️ localStorage limpiado. Recarga la app para ver los datos desde la BD.", "ok");
  }

  const counts = Object.entries(KEYS).map(([label, key]) => ({
    label,
    count: leerStorage(key).length,
  }));

  return (
    <div style={{ maxWidth: 700, margin: "40px auto", fontFamily: "sans-serif", padding: "0 16px" }}>
      <h2 style={{ marginBottom: 4 }}>🔄 Migración localStorage → Base de Datos</h2>
      <p style={{ color: "#666", marginBottom: 20 }}>
        Este proceso envía los datos guardados en el navegador al servidor.
      </p>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 20 }}>
        {counts.map(({ label, count }) => (
          <div key={label} style={{
            background: count > 0 ? "#e0f2fe" : "#f1f5f9",
            border: "1px solid #bae6fd",
            borderRadius: 8, padding: "8px 16px", fontSize: 14,
          }}>
            <strong>{label}</strong>: {count} registros
          </div>
        ))}
      </div>

      <div style={{ display: "flex", gap: 12, marginBottom: 20 }}>
        <button
          onClick={migrar}
          disabled={running}
          style={{
            background: running ? "#94a3b8" : "#0f6df2", color: "#fff",
            border: "none", borderRadius: 8, padding: "10px 24px",
            fontSize: 15, cursor: running ? "not-allowed" : "pointer",
          }}
        >
          {running ? "Migrando..." : "Iniciar migración"}
        </button>
        {done && (
          <button
            onClick={limpiarStorage}
            style={{
              background: "#ef4444", color: "#fff",
              border: "none", borderRadius: 8, padding: "10px 24px",
              fontSize: 15, cursor: "pointer",
            }}
          >
            Limpiar localStorage
          </button>
        )}
      </div>

      {log.length > 0 && (
        <div style={{
          background: "#0f172a", borderRadius: 8, padding: 16,
          height: 380, overflowY: "auto", fontSize: 13, fontFamily: "monospace",
        }}>
          {log.map((l, i) => (
            <div key={i} style={{
              color: l.tipo === "error" ? "#f87171" : l.tipo === "ok" ? "#34d399" : "#e2e8f0",
              marginBottom: 4,
            }}>
              <span style={{ color: "#64748b" }}>[{l.t}]</span> {l.msg}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
