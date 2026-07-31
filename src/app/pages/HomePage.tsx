import { useAuth } from "../../modules/auth/context/AuthProvider";

export function HomePage() {
  const { profile, restaurant, signOut } = useAuth();

  return (
    <main style={{ padding: 24 }}>
      <h1>POS Restaurante</h1>
      <p>
        Usuario: <strong>{profile?.name ?? "Sin perfil"}</strong> ({profile?.role})
      </p>
      <p>
        Restaurante: <strong>{restaurant?.name ?? "No configurado"}</strong>
      </p>
      <button onClick={() => void signOut()}>Cerrar sesión</button>
    </main>
  );
}
