import type { UserRole } from "../auth/types";

const STAFF_ROLE_LABELS: Record<"waiter" | "kitchen", string> = {
  waiter: "Mesero",
  kitchen: "Cocina",
};

export function staffRoleLabel(role: UserRole) {
  if (role === "waiter" || role === "kitchen") {
    return STAFF_ROLE_LABELS[role];
  }
  return role;
}

export function staffRoleOptions() {
  return [
    { value: "waiter" as const, label: STAFF_ROLE_LABELS.waiter },
    { value: "kitchen" as const, label: STAFF_ROLE_LABELS.kitchen },
  ];
}
