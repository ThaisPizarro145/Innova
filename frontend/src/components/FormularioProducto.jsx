/**
 * FormularioProducto.jsx
 *
 * Formulario de creación/edición de productos de farmacia: solo datos fijos
 * del medicamento. Costo, lote, fecha de vencimiento y precio de venta se
 * definen en Compras (cada compra crea su propio lote); este formulario solo
 * define QUÉ presentaciones existen (Caja/Unidad/Blíster) y su factor de
 * conversión, no sus precios.
 */
import { useEffect, useState } from "react";

const ESTADO_INICIAL = {
  nombre: "",
  categoria_id: "",
  laboratorio: "",
  marca: "",
  principio_activo: "",
  concentracion: "",
  forma_farmaceutica: "",
  presentacion_comercial: "",
  iva: false,
  usaCaja: false,
  unidades_por_caja: "",
  usaBlister: false,
  unidades_por_blister: "",
  stock_minimo: "",
  activo: true,
};

export default function FormularioProducto({ productoEditando, categorias, onGuardar, onCancelar }) {
  const [form, setForm] = useState({ ...ESTADO_INICIAL });
  const [mensaje, setMensaje] = useState("");
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (productoEditando) {
      setForm({
        ...ESTADO_INICIAL,
        nombre: productoEditando.nombre || "",
        categoria_id: productoEditando.categoria_id ?? "",
        laboratorio: productoEditando.laboratorio || "",
        marca: productoEditando.marca || "",
        principio_activo: productoEditando.principio_activo || "",
        concentracion: productoEditando.concentracion || "",
        forma_farmaceutica: productoEditando.forma_farmaceutica || "",
        presentacion_comercial: productoEditando.presentacion_comercial || "",
        iva: Boolean(productoEditando.iva),
        usaCaja: Boolean(productoEditando.unidades_por_caja),
        unidades_por_caja: productoEditando.unidades_por_caja ?? "",
        usaBlister: Boolean(productoEditando.unidades_por_blister),
        unidades_por_blister: productoEditando.unidades_por_blister ?? "",
        stock_minimo: productoEditando.stock_minimo ?? "",
        activo: productoEditando.activo ?? true,
      });
    } else {
      setForm({ ...ESTADO_INICIAL });
    }
  }, [productoEditando]);

  const set = (campo, valor) => setForm((p) => ({ ...p, [campo]: valor }));

  const handleGuardar = async () => {
    if (!form.nombre?.trim()) {
      setMensaje("El nombre es obligatorio.");
      return;
    }
    if (!form.categoria_id) {
      setMensaje("Selecciona una categoría para el producto.");
      return;
    }
    if (form.usaCaja && !(Number(form.unidades_por_caja) > 0)) {
      setMensaje("Indica cuántas Unidades trae una Caja.");
      return;
    }
    if (form.usaBlister && !(Number(form.unidades_por_blister) > 0)) {
      setMensaje("Indica cuántas Unidades trae un Blíster.");
      return;
    }

    setGuardando(true);
    setMensaje("");
    try {
      const payload = {
        nombre: form.nombre.trim(),
        categoria_id: Number(form.categoria_id),
        laboratorio: form.laboratorio?.trim() || null,
        marca: form.marca?.trim() || null,
        principio_activo: form.principio_activo?.trim() || null,
        concentracion: form.concentracion?.trim() || null,
        forma_farmaceutica: form.forma_farmaceutica?.trim() || null,
        presentacion_comercial: form.presentacion_comercial?.trim() || null,
        iva: form.iva,
        stock_minimo: Number(form.stock_minimo) || 0,
        unidad_base: "unidad",
        unidades_por_caja: form.usaCaja ? Number(form.unidades_por_caja) : null,
        unidades_por_blister: form.usaBlister ? Number(form.unidades_por_blister) : null,
        activo: form.activo,
      };

      await onGuardar(payload);
    } catch (err) {
      setMensaje(err.message || "Error al guardar.");
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onCancelar()}>
      <div className="modal-box" style={{ maxWidth: "700px" }}>
        <div className="modal-header">
          <h2>{productoEditando ? "✏️ Editar producto" : "➕ Nuevo producto"}</h2>
          <button type="button" className="btn-cerrar" onClick={onCancelar}>✕</button>
        </div>

        <div className="formulario-grid">
          <div className="campo">
            <label>Nombre *</label>
            <input value={form.nombre} onChange={(e) => set("nombre", e.target.value)} required placeholder="Ej: Paracetamol 500mg" />
          </div>
          <div className="campo">
            <label>Categoría *</label>
            <select value={form.categoria_id} onChange={(e) => set("categoria_id", e.target.value)}>
              <option value="">— Seleccionar —</option>
              {categorias.map((cat) => (
                <option key={cat.id} value={cat.id}>{cat.icono} {cat.nombre}</option>
              ))}
            </select>
          </div>
          <div className="campo">
            <label>Laboratorio</label>
            <input value={form.laboratorio} onChange={(e) => set("laboratorio", e.target.value)} placeholder="Nombre del laboratorio" />
          </div>
          <div className="campo">
            <label>Marca <span style={{ fontWeight: 400, color: "#94a3b8" }}>(opcional)</span></label>
            <input value={form.marca} onChange={(e) => set("marca", e.target.value)} />
          </div>
          <div className="campo">
            <label>Principio activo</label>
            <input value={form.principio_activo} onChange={(e) => set("principio_activo", e.target.value)} placeholder="Ej: Paracetamol" />
          </div>
          <div className="campo">
            <label>Concentración</label>
            <input value={form.concentracion} onChange={(e) => set("concentracion", e.target.value)} placeholder="Ej: 500mg" />
          </div>
          <div className="campo">
            <label>Forma farmacéutica</label>
            <input value={form.forma_farmaceutica} onChange={(e) => set("forma_farmaceutica", e.target.value)} placeholder="Ej: Tableta, Jarabe, Cápsula" />
          </div>
          <div className="campo">
            <label>Presentación comercial</label>
            <input value={form.presentacion_comercial} onChange={(e) => set("presentacion_comercial", e.target.value)} placeholder="Ej: Caja x 100 tabletas" />
          </div>
          <div className="campo" style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <input type="checkbox" id="iva" checked={form.iva} onChange={(e) => set("iva", e.target.checked)} />
            <label htmlFor="iva" style={{ margin: 0 }}>Aplica IGV</label>
          </div>
          <div className="campo" style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <input type="checkbox" id="activo" checked={form.activo} onChange={(e) => set("activo", e.target.checked)} />
            <label htmlFor="activo" style={{ margin: 0 }}>Producto activo</label>
          </div>

          {/* ── Presentaciones ── */}
          <div className="campo-full" style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "12px", padding: "16px" }}>
            <div style={{ fontWeight: 700, color: "#334155", marginBottom: "4px" }}>Presentaciones de venta</div>
            <div style={{ fontSize: "0.78rem", color: "#94a3b8", marginBottom: "12px" }}>
              Define cuántas Unidades trae cada presentación. El costo y el precio de venta se calculan en Compras.
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "10px" }}>
              <span style={{ flex: "0 0 90px", fontWeight: 600 }}>Unidad</span>
              <span style={{ fontSize: "0.8rem", color: "#94a3b8" }}>1 Unidad (siempre disponible)</span>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "10px", flexWrap: "wrap" }}>
              <label style={{ flex: "0 0 90px", display: "flex", alignItems: "center", gap: "6px", fontWeight: 600 }}>
                <input type="checkbox" checked={form.usaCaja} onChange={(e) => set("usaCaja", e.target.checked)} />
                Caja
              </label>
              {form.usaCaja && (
                <input type="number" min="1" step="1" value={form.unidades_por_caja}
                  onChange={(e) => set("unidades_por_caja", e.target.value)}
                  placeholder="Unidades por caja" style={{ width: "170px" }} />
              )}
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
              <label style={{ flex: "0 0 90px", display: "flex", alignItems: "center", gap: "6px", fontWeight: 600 }}>
                <input type="checkbox" checked={form.usaBlister} onChange={(e) => set("usaBlister", e.target.checked)} />
                Blíster
              </label>
              {form.usaBlister && (
                <input type="number" min="1" step="1" value={form.unidades_por_blister}
                  onChange={(e) => set("unidades_por_blister", e.target.value)}
                  placeholder="Unidades por blíster" style={{ width: "170px" }} />
              )}
            </div>
          </div>

          <div className="campo">
            <label>Stock mínimo (Unidades)</label>
            <input type="number" min="0" step="0.01" value={form.stock_minimo}
              onChange={(e) => set("stock_minimo", e.target.value)} placeholder="0" />
          </div>
        </div>

        {mensaje && (
          <div style={{
            margin: "12px 0", padding: "10px 14px", borderRadius: "8px",
            background: "#fef2f2", color: "#991b1b", fontSize: "0.85rem",
          }}>
            {mensaje}
          </div>
        )}

        <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end", marginTop: "16px" }}>
          <button type="button" className="btn-cancelar" onClick={onCancelar} disabled={guardando}>
            Cancelar
          </button>
          <button
            type="button"
            className="btn-guardar"
            onClick={handleGuardar}
            disabled={guardando}
            style={{ background: "#dc2626", color: "#fff", border: "none", padding: "10px 24px", borderRadius: "8px", fontWeight: 700, cursor: "pointer" }}
          >
            {guardando ? "Guardando..." : (productoEditando ? "💾 Actualizar" : "💾 Crear producto")}
          </button>
        </div>
      </div>
    </div>
  );
}
