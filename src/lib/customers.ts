import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useStoreId } from "./active-store";
import { loyaltyEligible } from "./loyalty-rules";

export type Customer = {
  id: string; name: string; phone: string | null; email: string | null; notes: string | null;
  loyalty_enabled: boolean; loyalty_points: number;
  credit_limit: number | null; credit_days: number;
};

export function useCustomers() {
  const storeId = useStoreId();
  return useQuery({
    queryKey: ["customers", storeId],
    queryFn: async () => {
      const { data, error } = await supabase.from("customers").select("*").eq("store_id", storeId).order("name");
      if (error) throw error;
      return (data ?? []) as Customer[];
    },
  });
}

export function useLoyaltyMembership() {
  const qc = useQueryClient();
  const storeId = useStoreId();
  return async (customer: Customer, enabled: boolean) => {
    if (enabled && !loyaltyEligible(customer.phone)) throw new Error("Add a phone number before joining loyalty");
    const { error } = await supabase.from("customers").update({ loyalty_enabled: enabled }).eq("id", customer.id).eq("store_id", storeId);
    if (error) throw error;
    const { logActivity } = await import("./activity-log");
    void logActivity("customers", "loyalty-membership", `${customer.name}: loyalty ${enabled ? "enabled" : "disabled"}`, { entityId: customer.id, storeId });
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["customers"] }),
      qc.invalidateQueries({ queryKey: ["loyalty-member"] }),
    ]);
  };
}
/** Key used by credit sales/collections: phone, else name (lower-cased). */
export function customerKey(c: { phone: string | null; name: string }) {
  return (c.phone || c.name).trim().toLowerCase();
}

export type CustomerSale = {
  id: string; bill_no: string; created_at: string; payment_mode: string; grand_total: number;
  credit_amount: number; status: string;
  sale_items: { name: string; qty: number; unit_price: number; line_total: number }[];
};
export type CustomerCollection = { id: string; amount: number; payment_mode: string; notes: string | null; collected_at: string };

/** All bills and khata collections for one customer in the active store. */
export function useCustomerAccount(customer: { phone: string | null; name: string } | null | undefined) {
  const storeId = useStoreId();
  const key = customer ? customerKey(customer) : "";
  return useQuery({
    enabled: Boolean(customer && key),
    queryKey: ["customer-account", storeId, key],
    staleTime: 0,
    queryFn: async () => {
      let sq = supabase.from("sales")
        .select("id,bill_no,created_at,payment_mode,grand_total,credit_amount,status,sale_items(name,qty,unit_price,line_total)")
        .eq("store_id", storeId).order("created_at", { ascending: false }).limit(500);
      sq = customer!.phone ? sq.eq("customer_phone", customer!.phone) : sq.ilike("customer_name", customer!.name);
      const [sales, cols] = await Promise.all([
        sq,
        supabase.from("credit_collections").select("id,amount,payment_mode,notes,collected_at")
          .eq("store_id", storeId).eq("customer_key", key).order("collected_at"),
      ]);
      if (sales.error) throw sales.error;
      if (cols.error) throw cols.error;
      const s = (sales.data ?? []) as unknown as CustomerSale[];
      const c = (cols.data ?? []) as unknown as CustomerCollection[];
      const billed = s.reduce((a, r) => a + Number(r.credit_amount || 0), 0);
      const paid = c.reduce((a, r) => a + Number(r.amount || 0), 0);
      return { sales: s, collections: c, outstanding: Math.max(0, Math.round((billed - paid) * 100) / 100) };
    },
  });
}
