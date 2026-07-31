import { supabase } from "../../lib/supabase";
import type { UserRole } from "../auth/types";

export type StaffProfile = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  active: boolean;
  created_at: string;
  updated_at: string;
  temp_password: string | null;
};

function logRpcError(context: string, error: unknown) {
  console.error(`[settings/users] ${context}`, error);
  if (error && typeof error === "object") {
    console.error(`[settings/users] ${context} (json):`, JSON.stringify(error, null, 2));
  }
}

export async function fetchStaffProfiles() {
  const { data, error } = await supabase.rpc("admin_fetch_staff_profiles");

  if (error) {
    logRpcError("fetchStaffProfiles", error);
    throw error;
  }
  return (data ?? []) as StaffProfile[];
}

export async function createStaffUser(input: {
  email: string;
  password: string;
  name: string;
  role: Extract<UserRole, "waiter" | "kitchen">;
}) {
  const { data, error } = await supabase.rpc("admin_create_staff_user", {
    p_email: input.email.trim(),
    p_password: input.password,
    p_name: input.name.trim(),
    p_role: input.role,
  });

  if (error) {
    logRpcError("createStaffUser", error);
    throw error;
  }
  return data as string;
}

export async function setStaffActive(userId: string, active: boolean) {
  const { data, error } = await supabase.rpc("admin_set_user_active", {
    p_user_id: userId,
    p_active: active,
  });

  if (error) {
    logRpcError("setStaffActive", error);
    throw error;
  }
  return data as StaffProfile;
}

export async function updateStaffUser(input: {
  userId: string;
  name: string;
  role: Extract<UserRole, "waiter" | "kitchen">;
  password?: string;
}) {
  const nextPassword = input.password?.trim();
  const { data, error } = await supabase.rpc("admin_update_staff_user", {
    p_user_id: input.userId,
    p_name: input.name.trim(),
    p_role: input.role,
    p_password: nextPassword && nextPassword.length > 0 ? nextPassword : undefined,
  });

  if (error) {
    logRpcError("updateStaffUser", error);
    throw error;
  }
  return data as StaffProfile;
}

export async function softDeleteStaffUser(userId: string) {
  const { data, error } = await supabase.rpc("admin_soft_delete_staff_user", {
    p_user_id: userId,
  });

  if (error) {
    logRpcError("softDeleteStaffUser", error);
    throw error;
  }
  return data as string;
}
