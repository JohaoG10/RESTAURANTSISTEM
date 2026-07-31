import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { useAuth } from "../../auth/context/AuthProvider";
import type { UserRole } from "../../auth/types";
import {
  StaffUserFormModal,
  type StaffFormValues,
} from "../components/StaffUserFormModal";
import { TeamEmptyIllustration } from "../components/TeamEmptyIllustration";
import {
  createStaffUser,
  fetchStaffProfiles,
  setStaffActive,
  softDeleteStaffUser,
  updateStaffUser,
  type StaffProfile,
} from "../api";
import { staffRoleLabel } from "../utils";

function getErrorMessage(err: unknown, fallback: string) {
  if (err instanceof Error) return err.message;
  if (err && typeof err === "object" && "message" in err) {
    return String((err as { message: string }).message);
  }
  return fallback;
}

function getInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function roleBadgeClass(role: UserRole) {
  if (role === "waiter") return "us-badge--role-waiter";
  if (role === "kitchen") return "us-badge--role-kitchen";
  return "us-badge--role-waiter";
}

function avatarClass(role: UserRole) {
  if (role === "kitchen") return "us-card__avatar--kitchen";
  return "us-card__avatar--waiter";
}

const EMPTY_CREATE_VALUES: StaffFormValues = {
  name: "",
  email: "",
  password: "",
  role: "waiter",
};

export function UsersPage() {
  const { profile } = useAuth();
  const [users, setUsers] = useState<StaffProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<StaffProfile | null>(null);
  const [cardsReady, setCardsReady] = useState(false);

  const isSelf = (userId: string) => profile?.id === userId;

  const editInitialValues = useMemo<StaffFormValues>(() => {
    if (!editingUser) return EMPTY_CREATE_VALUES;
    return {
      name: editingUser.name,
      email: editingUser.email,
      password: "",
      role: editingUser.role as Extract<UserRole, "waiter" | "kitchen">,
    };
  }, [editingUser]);

  async function loadUsers() {
    setLoading(true);
    setError(null);
    setCardsReady(false);
    try {
      const rows = await fetchStaffProfiles();
      setUsers(rows);
      setEditingUser((current) =>
        current ? rows.find((row) => row.id === current.id) ?? null : null
      );
    } catch (err) {
      setError(getErrorMessage(err, "No se pudo cargar el equipo"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadUsers();
  }, []);

  useEffect(() => {
    if (!loading && users.length > 0) {
      const t = setTimeout(() => setCardsReady(true), 40);
      return () => clearTimeout(t);
    }
    setCardsReady(false);
    return undefined;
  }, [loading, users.length]);

  async function handleCreateSubmit(values: StaffFormValues) {
    setBusy(true);
    setError(null);
    try {
      await createStaffUser(values);
      setCreateModalOpen(false);
      await loadUsers();
    } catch (err) {
      setError(getErrorMessage(err, "No se pudo crear el colaborador"));
      throw err;
    } finally {
      setBusy(false);
    }
  }

  async function handleEditSubmit(values: StaffFormValues) {
    if (!editingUser) return;
    setBusy(true);
    setError(null);
    try {
      await updateStaffUser({
        userId: editingUser.id,
        name: values.name,
        role: values.role,
        password: values.password,
      });
      setEditingUser(null);
      await loadUsers();
    } catch (err) {
      setError(getErrorMessage(err, "No se pudo editar el colaborador"));
      throw err;
    } finally {
      setBusy(false);
    }
  }

  async function handleToggleActive(user: StaffProfile) {
    const nextActive = !user.active;
    const action = nextActive ? "activar" : "desactivar";
    if (!window.confirm(`¿${action} a ${user.name}?`)) return;

    setBusy(true);
    setError(null);
    try {
      await setStaffActive(user.id, nextActive);
      await loadUsers();
    } catch (err) {
      setError(getErrorMessage(err, `No se pudo ${action} el colaborador`));
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteUser(user: StaffProfile) {
    if (isSelf(user.id)) return;

    const confirmed = window.confirm(
      `¿Eliminar a "${user.name}"?\n\nSe bloqueará su acceso al sistema. Esta acción no se puede deshacer desde esta pantalla.`
    );
    if (!confirmed) return;

    setBusy(true);
    setError(null);
    try {
      await softDeleteStaffUser(user.id);
      if (editingUser?.id === user.id) {
        setEditingUser(null);
      }
      await loadUsers();
    } catch (err) {
      setError(getErrorMessage(err, "No se pudo eliminar el colaborador"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="app-page us-page">
      <header className="us-header">
        <div className="us-header__text">
          <h1 className="us-header__title">Equipo</h1>
          <p className="us-header__subtitle">
            Gestiona el acceso de meseros y cocina
          </p>
        </div>
        <button
          type="button"
          className="us-btn-primary"
          disabled={busy}
          onClick={() => setCreateModalOpen(true)}
        >
          <span aria-hidden>+</span>
          Nuevo colaborador
        </button>
      </header>

      <div className="app-page__body">
        {error ? (
          <div className="us-alert" role="alert">
            {error}
          </div>
        ) : null}

        {loading ? (
          <div className="us-loading" aria-live="polite">
            <span className="us-spinner" aria-hidden />
            Cargando equipo…
          </div>
        ) : null}

        {!loading && users.length === 0 ? (
          <div className="us-empty">
            <TeamEmptyIllustration />
            <h2 className="us-empty__title">Aún no hay colaboradores</h2>
            <p className="us-empty__desc">
              Agrega meseros y personal de cocina para que puedan acceder al sistema
            </p>
            <button
              type="button"
              className="us-btn-primary"
              disabled={busy}
              onClick={() => setCreateModalOpen(true)}
            >
              <span aria-hidden>+</span>
              Agregar primer colaborador
            </button>
          </div>
        ) : null}

        {!loading && users.length > 0 ? (
          <div className="us-grid" role="list">
            {users.map((user, index) => {
              const self = isSelf(user.id);
              return (
                <article
                  key={user.id}
                  role="listitem"
                  className={`us-card${!user.active ? " us-card--inactive" : ""}${
                    cardsReady ? " us-card--visible" : ""
                  }`}
                  style={
                    cardsReady
                      ? ({ ["--card-delay" as string]: `${index * 100}ms` } as CSSProperties)
                      : undefined
                  }
                >
                  <div
                    className={`us-card__avatar ${avatarClass(user.role)}`}
                    aria-hidden
                  >
                    {getInitials(user.name)}
                  </div>
                  <h3 className="us-card__name">{user.name}</h3>
                  <div className="us-card__badges">
                    <span className={`us-badge ${roleBadgeClass(user.role)}`}>
                      {staffRoleLabel(user.role)}
                    </span>
                    <span
                      className={`us-badge ${
                        user.active ? "us-badge--active" : "us-badge--inactive"
                      }`}
                    >
                      {user.active ? "Activo" : "Inactivo"}
                    </span>
                  </div>
                  <p className="us-card__email">{user.email}</p>
                  <div className="us-card__divider" role="presentation" />
                  <div className="us-card__actions">
                    <button
                      type="button"
                      className="us-card__btn"
                      disabled={busy || self}
                      onClick={() => setEditingUser(user)}
                      title={
                        self
                          ? "No puedes editarte desde esta pantalla"
                          : "Editar colaborador"
                      }
                    >
                      <span aria-hidden>✏️</span>
                      Editar
                    </button>
                    <button
                      type="button"
                      className={`us-toggle${user.active ? " us-toggle--on" : ""}`}
                      disabled={busy}
                      onClick={() => void handleToggleActive(user)}
                      aria-label={user.active ? "Desactivar" : "Activar"}
                      title={user.active ? "Desactivar" : "Activar"}
                    >
                      <span className="us-toggle__knob" />
                      <span className="us-toggle__label">
                        {user.active ? "Activo" : "Inactivo"}
                      </span>
                    </button>
                    <button
                      type="button"
                      className="us-card__btn us-card__btn--danger"
                      disabled={busy || self}
                      onClick={() => void handleDeleteUser(user)}
                      title={
                        self
                          ? "No puedes eliminarte desde esta pantalla"
                          : "Eliminar colaborador"
                      }
                    >
                      <span aria-hidden>🗑️</span>
                      Eliminar
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        ) : null}
      </div>

      <StaffUserFormModal
        open={createModalOpen}
        mode="create"
        title="Nuevo colaborador"
        submitLabel="Crear colaborador"
        initialValues={EMPTY_CREATE_VALUES}
        busy={busy}
        onClose={() => setCreateModalOpen(false)}
        onSubmit={handleCreateSubmit}
      />

      <StaffUserFormModal
        open={Boolean(editingUser)}
        mode="edit"
        title="Editar colaborador"
        submitLabel="Guardar cambios"
        initialValues={editInitialValues}
        userEmail={editingUser?.email}
        tempPassword={editingUser?.temp_password}
        busy={busy}
        onClose={() => setEditingUser(null)}
        onSubmit={handleEditSubmit}
      />
    </main>
  );
}
