import { useState } from "react";
import { getToken, setToken } from "../services/sunat";
import { getEmpresa, setEmpresa } from "../services/empresa";

export default function Configuracion() {
  const [token, setTokenInput] = useState(getToken());
  const [tokenGuardado, setTokenGuardado] = useState(false);

  const [empresa, setEmpresaState] = useState(getEmpresa());
  const [empresaGuardada, setEmpresaGuardada] = useState(false);

  const guardarToken = () => {
    setToken(token);
    setTokenGuardado(true);
    setTimeout(() => setTokenGuardado(false), 2500);
  };

  const guardarEmpresa = () => {
    setEmpresa(empresa);
    setEmpresaGuardada(true);
    setTimeout(() => setEmpresaGuardada(false), 2500);
  };

  const campoEmpresa = (field, label, placeholder = "", type = "text") => (
    <div className="config-campo">
      <label>{label}</label>
      <input
        type={type}
        value={empresa[field] || ""}
        onChange={(e) => setEmpresaState({ ...empresa, [field]: e.target.value })}
        placeholder={placeholder}
        style={{ width: "100%", padding: "10px 14px", borderRadius: "10px", border: "1px solid #cbd5e1", fontSize: "0.92rem" }}
      />
    </div>
  );

  return (
    <div>
      <h1>⚙ Configuración</h1>

      {/* ── Datos de la empresa ── */}
      <div className="config-seccion">
        <div className="config-seccion-header">
          <span className="config-seccion-icon">🏪</span>
          <div>
            <div className="config-seccion-titulo">Datos de la empresa</div>
            <div className="config-seccion-desc">
              Estos datos aparecen en el encabezado de todos los comprobantes (boleta, factura, nota de venta, etc.)
            </div>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
          {campoEmpresa("nombre", "Nombre / Razón social *", "Ej: CORPORACIÓN SOMOS ALIADOS")}
          {campoEmpresa("ruc", "RUC", "Ej: 10739759931")}
          {campoEmpresa("direccion", "Dirección", "Ej: Av. La Cultura Psj. C - Puesto 59")}
          {campoEmpresa("distrito", "Distrito", "Ej: Santa Anita")}
          {campoEmpresa("provincia", "Provincia", "Ej: Lima")}
          {campoEmpresa("departamento", "Departamento", "Ej: Lima")}
          {campoEmpresa("telefono", "Teléfono / Celular", "Ej: 910501187")}
          {campoEmpresa("email", "Email", "Ej: correo@gmail.com", "email")}
          {campoEmpresa("vendedor", "Vendedor / Cajero por defecto", "Ej: Administrador")}
        </div>

        <div style={{ marginTop: "14px" }}>
          <button type="button" className="btn-nuevo" onClick={guardarEmpresa}>💾 Guardar datos de empresa</button>
          {empresaGuardada && <span style={{ color: "#16a34a", fontSize: "0.85rem", marginLeft: "12px" }}>✓ Guardado</span>}
        </div>
      </div>

      {/* ── Token PeruAPI ── */}
      <div className="config-seccion" style={{ marginTop: "20px" }}>
        <div className="config-seccion-header">
          <span className="config-seccion-icon">🔑</span>
          <div>
            <div className="config-seccion-titulo">Token PeruAPI — Consulta RUC / DNI</div>
            <div className="config-seccion-desc">
              Necesario para consultar datos de SUNAT (RUC) y RENIEC (DNI).
              Proveedor: <strong>peruapi.com</strong>
            </div>
          </div>
        </div>
        <div className="config-campo">
          <label>Token de acceso</label>
          <div style={{ display: "flex", gap: "8px" }}>
            <input
              type="password"
              value={token}
              onChange={(e) => { setTokenInput(e.target.value); setTokenGuardado(false); }}
              placeholder="Pega aquí tu token"
              style={{ flex: 1, padding: "10px 14px", borderRadius: "10px", border: "1px solid #cbd5e1", fontSize: "0.92rem" }}
            />
            <button type="button" className="btn-nuevo" onClick={guardarToken}>💾 Guardar</button>
          </div>
          {tokenGuardado && <p style={{ color: "#16a34a", fontSize: "0.85rem", marginTop: "6px" }}>✓ Token guardado.</p>}
        </div>
        <div className="config-pasos">
          <div className="config-paso-titulo">¿Cómo obtener tu token gratis?</div>
          <ol className="config-paso-lista">
            <li>Entra a <a href="https://peruapi.com" target="_blank" rel="noreferrer">peruapi.com</a> y crea una cuenta.</li>
            <li>Ve a tu panel y copia tu <strong>API Key</strong>.</li>
            <li>Pégala arriba y guarda.</li>
          </ol>
        </div>
      </div>
    </div>
  );
}
