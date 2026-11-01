import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useStoreId } from "./active-store";
import { loyaltyEligible } from "./loyalty-rules";

export type Customer = {
  id: string; name: string; phone: string | null; email: string | null; notes: string | null;
  loyalty_enabled: boolean; loyalty_points: number;
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
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["customers"] }),
      qc.invalidateQueries({ queryKey: ["loyalty-member"] }),
    ]);
  };
}