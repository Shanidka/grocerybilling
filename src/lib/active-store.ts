import { useSyncExternalStore } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const DEFAULT_STORE_ID = "11111111-1111-1111-1111-111111111111";
const KEY = "bz_store_id";

const listeners = new Set<() => void>();

function read(): string {
  if (typeof localStorage === "undefined") return DEFAULT_STORE_ID;
  try {
    return localStorage.getItem(KEY) || DEFAULT_STORE_ID;
  } catch {
    return DEFAULT_STORE_ID;
  }
}

/** Read the active store id outside React (offline queue, receipts, etc.). */
export function getStoreId(): string {
  return read();
}

export function setStoreId(id: string) {
  try { localStorage.setItem(KEY, id); } catch { /* ignore */ }
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}

/** Active store id, reactive across the whole app. */
export function useStoreId(): string {
  return useSyncExternalStore(subscribe, read, () => DEFAULT_STORE_ID);
}

export type Store = {
  id: string;
  name: string;
  kind: string;
  phone: string | null;
  address: string | null;
  gst_number: string | null;
  upi_id: string | null;
  is_active: boolean;
};

export function useStores() {
  return useQuery({
    queryKey: ["stores"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stores")
        .select("id,name,kind,phone,address,gst_number,upi_id,is_active")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return (data ?? []) as Store[];
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function useActiveStore() {
  const storeId = useStoreId();
  const { data: stores } = useStores();
  const store = (stores ?? []).find((s) => s.id === storeId) ?? null;
  return { storeId, store, stores: stores ?? [], setStoreId };
}
