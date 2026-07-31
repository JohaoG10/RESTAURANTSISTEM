import type { ReactNode } from "react";
import type { UserRole } from "../../modules/auth/types";

export type NavItem = {
  to: string;
  label: string;
  icon: ReactNode;
  roles: UserRole[];
  /** Coincidencia exacta de ruta (evita que /settings active en /users). */
  end?: boolean;
};

export type NavGroup = {
  id: string;
  items: NavItem[];
};

const iconProps = {
  width: 22,
  height: 22,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

function Icon({ children }: { children: ReactNode }) {
  return <svg {...iconProps} aria-hidden>{children}</svg>;
}

const dashboardItem: NavItem = {
  to: "/dashboard",
  label: "Dashboard",
  roles: ["admin", "kitchen"],
  icon: (
    <Icon>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </Icon>
  ),
};

/** Grupos con separador visual en sidebar (operativo / gestión / admin). */
export const NAV_GROUPS: NavGroup[] = [
  {
    id: "home",
    items: [dashboardItem],
  },
  {
    id: "operational",
    items: [
      {
        to: "/orders",
        label: "Comandas",
        roles: ["admin", "waiter"],
        icon: (
          <Icon>
            <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2" />
            <rect x="9" y="3" width="6" height="4" rx="1" />
            <path d="M9 12h6M9 16h6" />
          </Icon>
        ),
      },
      {
        to: "/billing",
        label: "Cobro",
        roles: ["admin"],
        icon: (
          <Icon>
            <rect x="2" y="5" width="20" height="14" rx="2" />
            <path d="M2 10h20" />
          </Icon>
        ),
      },
      {
        to: "/kds",
        label: "KDS Cocina",
        roles: ["admin", "kitchen"],
        icon: (
          <Icon>
            <path d="M6 2v4M18 2v4M4 8h16" />
            <rect x="4" y="4" width="16" height="16" rx="2" />
            <path d="M8 14h.01M12 14h.01M16 14h.01" />
          </Icon>
        ),
      },
    ],
  },
  {
    id: "management",
    items: [
      {
        to: "/menu",
        label: "Menú",
        roles: ["admin"],
        icon: (
          <Icon>
            <path d="M4 6h16M4 12h16M4 18h10" />
          </Icon>
        ),
      },
      {
        to: "/tables",
        label: "Mesas",
        roles: ["admin"],
        icon: (
          <Icon>
            <rect x="3" y="4" width="18" height="16" rx="2" />
            <path d="M3 10h18M8 4v4M16 4v4" />
          </Icon>
        ),
      },
      {
        to: "/settings",
        label: "Configuración",
        roles: ["admin"],
        end: true,
        icon: (
          <Icon>
            <circle cx="12" cy="12" r="3" />
            <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
          </Icon>
        ),
      },
      {
        to: "/users",
        label: "Equipo",
        roles: ["admin"],
        icon: (
          <Icon>
            <path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M19 8v6M22 11h-6" />
          </Icon>
        ),
      },
    ],
  },
  {
    id: "admin",
    items: [
      {
        to: "/reports",
        label: "Reportes y caja",
        roles: ["admin"],
        icon: (
          <Icon>
            <path d="M4 19V5M10 19V9M16 19v-6M22 19V3" />
          </Icon>
        ),
      },
    ],
  },
];

export const ROLE_LABELS: Record<UserRole, string> = {
  admin: "Administrador",
  waiter: "Mesero",
  kitchen: "Cocina",
};

export function navGroupsForRole(role: UserRole | undefined) {
  if (!role) return [];
  return NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => item.roles.includes(role)),
  })).filter((group) => group.items.length > 0);
}
