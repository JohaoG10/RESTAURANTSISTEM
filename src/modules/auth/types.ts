export type UserRole = "admin" | "waiter" | "kitchen";

export interface AuthProfile {
  id: string;
  role: UserRole;
  name: string;
  email: string;
  active: boolean;
}

export interface RestaurantInfo {
  id: string;
  name: string;
  ruc: string;
  address: string | null;
  phone: string | null;
  sri_environment: "test" | "production";
  default_tip_percent: number;
  theme_config?: unknown;
}
