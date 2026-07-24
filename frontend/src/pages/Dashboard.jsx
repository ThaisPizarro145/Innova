import { useEffect, useState } from "react";
import { getClientes, getProductos, getVentas } from "../services/api";

function formatearSoles(valor) {
  return `S/ ${Number(valor || 0).toFixed(2)}`;
}

function Dashboard() {
  const [resumen, setResumen] = useState({
    productos: 0,
    clientes: 0,
    ventasHoy: 0,
    stockTotal: 0,
  });

  useEffect(() => {
    const cargarResumen = async () => {
      try {
        const [productos, clientes, ventas] = await Promise.all([getProductos(), getClientes(), getVentas()]);
        const hoy = new Date();
        const ventasHoy = (ventas || []).filter((venta) => {
          const fechaVenta = new Date(venta.fecha);
          return fechaVenta.getDate() === hoy.getDate() && fechaVenta.getMonth() === hoy.getMonth() && fechaVenta.getFullYear() === hoy.getFullYear();
        });

        setResumen({
          productos: (productos || []).length,
          clientes: (clientes || []).length,
          ventasHoy: ventasHoy.reduce((acc, venta) => acc + Number(venta.total || 0), 0),
          stockTotal: (productos || []).reduce((acc, producto) => acc + Number(producto.stock_actual || 0), 0),
        });
      } catch {
        setResumen({ productos: 0, clientes: 0, ventasHoy: 0, stockTotal: 0 });
      }
    };

    cargarResumen();
  }, []);

  return (
    <>
      <h1>Dashboard</h1>

      <p>Bienvenido al sistema de gestión de farmacia.</p>

      <div className="cards">
        <div className="info-card">
          <h2>💊</h2>
          <h3>Medicamentos</h3>
          <p>{resumen.productos}</p>
        </div>

        <div className="info-card">
          <h2>📦</h2>
          <h3>Stock total</h3>
          <p>{resumen.stockTotal}</p>
        </div>

        <div className="info-card">
          <h2>👥</h2>
          <h3>Clientes</h3>
          <p>{resumen.clientes}</p>
        </div>

        <div className="info-card">
          <h2>💰</h2>
          <h3>Ventas Hoy</h3>
          <p>{formatearSoles(resumen.ventasHoy)}</p>
        </div>
      </div>
    </>
  );
}

export default Dashboard;