import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/** Every page that can be granted or revoked per designation. */
export const PAGES = [
  { key: "dashboard", label: "Dashboard" },
  { key: "alerts", label: "Alerts" },
  { key: "documents", label: "Documents" },
  { key: "billing", label: "Billing" },
  { key: "day-book", label: "Day Book" },
  { key: "customers", label: "Customers" },
  { key: "credit", label: "Credit" },
  { key: "reports", label: "Reports" },
  { key: "trends", label: "Trends" },
  { key: "products", label: "Products" },
  { key: "inventory", label: "Inventory" },
  { key: "purchase-orders", label: "Purchase Orders" },
  { key: "suppliers", label: "Suppliers" },
  { key: "expenses", label: "Expenses" },
  { key: "staff", label: "Staff" },
  { key: "devices", label: "Devices" },
  { key: "settings", label: "Settings" },
] as const;

export type AppRoleRow = { key: string; label: string; base_role: string; is_system: boolean };
export type PermRow = { role_key: string; page: string; allowed: boolean };

export function useDesignations() {
  return useQuery({
    queryKey: ["app-roles"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("app_roles")
        .select("key,label,base_role,is_system")
        .order("label");
      if (error) throw error;
      return (data ?? []) as AppRoleRow[];
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function useRolePermissions() {
  return useQuery({
    queryKey: ["role-permissions"],
    queryFn: async () => {
      const { data, error } = await supabase.from("role_permissions").select("role_key,page,allowed");
      if (error) throw error;
      return (data ?? []) as PermRow[];
    },
    staleTime: 5 * 60 * 1000,
  });
}

/** My designation keys (role_key when set, otherwise the base role). */
export function useMyRoleKeys() {
  return useQuery({
    queryKey: ["my-role-keys"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return [] as string[];
      const { data, error } = await supabase
        .from("user_roles")
        .select("role,role_key")
        .eq("user_id", u.user.id);
      if (error) throw error;
      return (data ?? []).map((r) => (r.role_key as string | null) || (r.role as string));
    },
  });
}

/** Page-level access for the signed-in user. */
export function useAccess() {
  const roleKeys = useMyRoleKeys();
  const perms = useRolePermissions();
  const keys = roleKeys.data ?? [];
  const rows = perms.data ?? [];
  const isLoading = roleKeys.isLoading || perms.isLoading;

  const isAdmin = keys.includes("admin");
  const can = (page: string) => {
    if (isAdmin) return true;
    if (!keys.length) return false;
    const relevant = rows.filter((r) => keys.includes(r.role_key) && r.page === page);
    if (!relevant.length) return false;
    return relevant.some((r) => r.allowed);
  };

  return { isLoading, isAdmin, isManager: keys.includes("manager"), roleKeys: keys, can };
}
