import { useEffect, useMemo, useState } from "react";
import { NavLink } from "react-router-dom";
import { AnimatedOutlet } from "../components/AnimatedOutlet";
import { useAuth } from "../../modules/auth/context/AuthProvider";
import { navGroupsForRole, ROLE_LABELS } from "./navConfig";

function SignOutIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
      <path d="M16 17l5-5-5-5M21 12H9" />
    </svg>
  );
}

export function AppLayout() {
  const { profile, restaurant, signOut } = useAuth();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const navGroups = useMemo(
    () => navGroupsForRole(profile?.role),
    [profile?.role]
  );

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 1024px)");
    const apply = () => setSidebarCollapsed(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  const initials = (profile?.name ?? "?")
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div
      className={`app-shell${sidebarCollapsed ? " app-shell--sidebar-collapsed" : ""}`}
    >
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="sidebar-brand-mark" aria-hidden>
            {restaurant?.name?.charAt(0) ?? "R"}
          </div>
          <div className="sidebar-brand-text">
            <span className="sidebar-brand-name">
              {restaurant?.name ?? "POS Restaurante"}
            </span>
            <span className="sidebar-brand-tag">Sistema POS</span>
          </div>
        </div>

        <button
          type="button"
          className="sidebar-toggle"
          onClick={() => setSidebarCollapsed((value) => !value)}
          aria-label={sidebarCollapsed ? "Expandir menú" : "Colapsar menú"}
          aria-expanded={!sidebarCollapsed}
        >
          {sidebarCollapsed ? "»" : "«"}
        </button>

        <nav className="sidebar-nav" aria-label="Navegación principal">
          {navGroups.map((group, groupIndex) => (
            <div key={group.id} className="sidebar-nav-group">
              {groupIndex > 0 ? (
                <div className="sidebar-nav-divider" role="presentation" />
              ) : null}
              {group.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  title={sidebarCollapsed ? item.label : undefined}
                  className={({ isActive }) =>
                    `nav-link${isActive ? " nav-link--active" : ""}`
                  }
                >
                  <span className="nav-link__icon">{item.icon}</span>
                  <span className="nav-link__label">{item.label}</span>
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="sidebar-user">
            <div className="sidebar-user-avatar" aria-hidden>
              {initials}
            </div>
            <div className="sidebar-user-meta">
              <span className="sidebar-user-name">{profile?.name ?? "Usuario"}</span>
              <span className="sidebar-user-role">
                {profile?.role ? ROLE_LABELS[profile.role] : ""}
              </span>
            </div>
          </div>
          <button
            type="button"
            className="sidebar-signout"
            onClick={() => void signOut()}
          >
            <SignOutIcon />
            <span>Cerrar sesión</span>
          </button>
        </div>
      </aside>

      <div className="app-main">
        <section className="content">
          <AnimatedOutlet />
        </section>
      </div>
    </div>
  );
}
