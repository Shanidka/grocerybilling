import { supabase } from "@/integrations/supabase/client";
import { getStoreId } from "@/lib/active-store";

/** Each area becomes its own log stream (billing logs, stock logs, …). */
export const LOG_AREAS = [
  "billing",
  "stock",
  "products",
  "purchases",
  "purchase-orders",
  "expenses",
  "credit",
  "customers",
  "suppliers",
  "staff",
  "settings",
  "devices",
  "documents",
] as const;

export type LogArea = (typeof LOG_AREAS)[number];

export const AREA_LABELS: Record<string, string> = {
  billing: "Billing",
  stock: "Stock",
  products: "Products",
  purchases: "Purchases",
  "purchase-orders": "Purchase orders",
  expenses: "Expenses",
  credit: "Credit",
  customers: "Customers",
  suppliers: "Suppliers",
  staff: "Staff",
  settings: "Settings",
  devices: "Devices",
  documents: "Documents",
};

export type ActivityLog = {
  id: string;
  area: string;
  action: string;
  summary: string;
  entity_id: string | null;
  details: unknown;
  actor_id: string | null;
  actor_name: string | null;
  created_at: string;
};

/**
 * Record who changed what. Never throws — logging must not break a sale.
 */
export async function logActivity(
  area: LogArea,
  action: string,
  summary: string,
  opts?: { entityId?: string | null; details?: Record<string, unknown>; storeId?: string },
): Promise<void> {
  try {
    const { data } = await supabase.auth.getUser();
    const user = data.user;
    if (!user) return;
    const meta = (user.user_metadata ?? {}) as { full_name?: string };
    await supabase.from("activity_logs").insert({
      store_id: opts?.storeId ?? getStoreId(),
      area,
      action,
      summary,
      entity_id: opts?.entityId ?? null,
      details: (opts?.details ?? null) as never,
      actor_id: user.id,
      actor_name: meta.full_name || user.email || "Unknown",
    });
  } catch {
    /* logging is best-effort (offline, permissions, …) */
  }
}
