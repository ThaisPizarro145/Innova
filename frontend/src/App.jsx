import "./App.css";
import { Link, Routes, Route } from "react-router-dom";

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

function App() {
  return (
    <div className="container">
      <aside className="sidebar">
        <h2>🏪 BodegaSys</h2>
        <ul>
          <li><Link to="/">🏠 Dashboard</Link></li>
          <li><Link to="/categorias">🏷️ Categorías</Link></li>
          <li><Link to="/categorias-config">⚙️ Config. Unidades</Link></li>
          <li><Link to="/medicamentos">📦 Productos</Link></li>
          <li><Link to="/compras">🛒 Compras</Link></li>
          <li><Link to="/inventario">📋 Inventario</Link></li>
          <li><Link to="/ventas">💵 Ventas</Link></li>
          <li><Link to="/clientes">👥 Clientes</Link></li>
          <li><Link to="/caja">💰 Caja</Link></li>
          <li><Link to="/reportes">📊 Reportes</Link></li>
          <li><Link to="/configuracion">⚙ Configuración</Link></li>
          <li><Link to="/migracion">🔄 Migración BD</Link></li>
        </ul>
      </aside>

      <main className="content">
        <Routes>
          <Route path="/" element={<Dashboard />} />
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
