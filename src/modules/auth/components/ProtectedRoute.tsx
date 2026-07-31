import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthProvider";
import type { UserRole } from "../types";

interface ProtectedRouteProps {
  children: React.ReactNode;
  roles?: UserRole[];
}

export function ProtectedRoute({ children, roles }: ProtectedRouteProps) {
  const { session, profile, loading, reload } = useAuth();

  if (loading) {
    return <p style={{ padding: 16 }}>Cargando sesión...</p>;
  }

  if (!session) {
    return <Navigate to="/login" replace />;
  }

  if (!profile) {
    return (
      <main style={{ padding: 24 }}>
        <h1>Perfil no disponible</h1>
        <p>No se pudo cargar tu perfil. Reintenta o vuelve a iniciar sesión.</p>
        <button onClick={() => void reload()}>Reintentar carga</button>
      </main>
    );
  }

  if (!profile.active) {
    return (
      <main style={{ padding: 24 }}>
        <h1>Usuario desactivado</h1>
        <p>Tu usuario no está activo. Contacta a un administrador.</p>
      </main>
    );
  }

  if (roles && profile && !roles.includes(profile.role)) {
    // Redirigir al home del rol en lugar de "/" para evitar bucles
    const roleHome = profile.role === "waiter" ? "/orders" : "/dashboard";
    return <Navigate to={roleHome} replace />;
  }

  return <>{children}</>;
}
