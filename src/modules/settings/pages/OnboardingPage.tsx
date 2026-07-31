import { FormEvent, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { supabase } from "../../../lib/supabase";
import { useAuth } from "../../auth/context/AuthProvider";

export function OnboardingPage() {
  const { profile, restaurant, reload } = useAuth();
  const [name, setName] = useState("");
  const [ruc, setRuc] = useState("");
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isAdmin = profile?.role === "admin";
  const hasRestaurant = useMemo(() => Boolean(restaurant?.id), [restaurant]);

  if (!isAdmin) return <Navigate to="/" replace />;
  if (hasRestaurant) return <Navigate to="/" replace />;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const { error: insertError } = await supabase.from("restaurants").insert({
        name: name.trim(),
        ruc: ruc.trim(),
        address: address.trim() || null,
        phone: phone.trim() || null,
        sri_environment: "test",
      });

      if (insertError) throw insertError;
      await reload();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "No se pudo guardar la configuración"
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main style={{ maxWidth: 640, margin: "36px auto", padding: 24 }}>
      <h1>Primer uso: configuración del restaurante</h1>
      <p>Completa los datos iniciales para habilitar el sistema.</p>

      <form onSubmit={handleSubmit} style={{ display: "grid", gap: 12 }}>
        <label>
          Nombre del restaurante
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={{ display: "block", width: "100%", padding: 8, marginTop: 4 }}
          />
        </label>

        <label>
          RUC
          <input
            required
            value={ruc}
            onChange={(e) => setRuc(e.target.value)}
            style={{ display: "block", width: "100%", padding: 8, marginTop: 4 }}
          />
        </label>

        <label>
          Dirección
          <input
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            style={{ display: "block", width: "100%", padding: 8, marginTop: 4 }}
          />
        </label>

        <label>
          Teléfono
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            style={{ display: "block", width: "100%", padding: 8, marginTop: 4 }}
          />
        </label>

        {error ? <p style={{ color: "crimson" }}>{error}</p> : null}

        <button type="submit" disabled={submitting}>
          {submitting ? "Guardando..." : "Guardar y continuar"}
        </button>
      </form>
    </main>
  );
}
