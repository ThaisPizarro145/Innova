import "./App.css";
import { useEffect, useState } from "react";
import { Link, Routes, Route, useLocation } from "react-router-dom";
import { cargarEmpresa } from "./services/empresa";

import Dashboard from "./pages/Dashboard";
import Medicamentos from "./pages/Medicamentos";
import Inventario from "./pages/Inventario";
import Ventas from "./pages/Ventas";
import Clientes from "./pages/Clientes";
import Configuracion from "./pages/Configuracion";
import Categorias from "./pages/Categorias";
import ConfiguracionCategorias from "./pages/ConfiguracionCategorias";
import Reportes from "./pages/Reportes";
import Caja from "./pages/Caja";
import Compras from "./pages/Compras";
import Migracion from "./pages/Migracion";

const ENLACES = [
  { to: "/dashboard", label: "🏠 Dashboard" },
  { to: "/categorias", label: "🏷️ Categorías" },
  { to: "/categorias-config", label: "⚙️ Config. Unidades" },
  { to: "/medicamentos", label: "📦 Productos" },
  { to: "/compras", label: "🛒 Compras" },
  { to: "/inventario", label: "📋 Inventario" },
  { to: "/ventas", label: "💵 Ventas" },
  { to: "/clientes", label: "👥 Clientes" },
  { to: "/caja", label: "💰 Caja" },
  { to: "/reportes", label: "📊 Reportes" },
  { to: "/configuracion", label: "⚙ Configuración" },
  { to: "/migracion", label: "🔄 Migración BD" },
];

function App() {
  const [menuAbierto, setMenuAbierto] = useState(false);
  const location = useLocation();

  useEffect(() => {
    cargarEmpresa();
  }, []);

  useEffect(() => {
    setMenuAbierto(false);
  }, [location.pathname]);

  useEffect(() => {
    document.body.style.overflow = menuAbierto ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [menuAbierto]);

  return (
    <div className="container">
      <header className="topbar">
        <button
          type="button"
          className="btn-menu"
          aria-label={menuAbierto ? "Cerrar menú" : "Abrir menú"}
          aria-expanded={menuAbierto}
          onClick={() => setMenuAbierto((v) => !v)}
        >
          {menuAbierto ? "✕" : "☰"}
        </button>
        <h2>🏪 BodegaSys</h2>
      </header>

      {menuAbierto && (
        <div className="sidebar-overlay" onClick={() => setMenuAbierto(false)} />
      )}

      <aside className={`sidebar ${menuAbierto ? "sidebar-abierto" : ""}`}>
        <h2 className="sidebar-titulo">🏪 BodegaSys</h2>
        <ul>
          {ENLACES.map((enlace) => (
            <li key={enlace.to}>
              <Link
                to={enlace.to}
                className={location.pathname === enlace.to ? "activo" : ""}
              >
                {enlace.label}
              </Link>
            </li>
          ))}
        </ul>
      </aside>

      <main className="content">
        <Routes>
          <Route path="/" element={<Ventas />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/categorias" element={<Categorias />} />
          <Route path="/categorias-config" element={<ConfiguracionCategorias />} />
          <Route path="/medicamentos" element={<Medicamentos />} />
          <Route path="/compras" element={<Compras />} />
          <Route path="/inventario" element={<Inventario />} />
          <Route path="/ventas" element={<Ventas />} />
          <Route path="/clientes" element={<Clientes />} />
          <Route path="/caja" element={<Caja />} />
          <Route path="/reportes" element={<Reportes />} />
          <Route path="/configuracion" element={<Configuracion />} />
          <Route path="/migracion" element={<Migracion />} />
        </Routes>
      </main>
    </div>
  );
}

export default App;
