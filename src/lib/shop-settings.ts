import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type ShopSettings = {
  id: number;
  shop_name: string;
  phone: string | null;
  address: string | null;
  gst_number: string | null;
  upi_id: string | null;
  receipt_footer: string | null;
};

export function useShopSettings() {
  return useQuery({
    queryKey: ["shop-settings"],
    queryFn: async (): Promise<ShopSettings | null> => {
      const { data, error } = await supabase.from("shop_settings").select("*").eq("id", 1).maybeSingle();
      if (error) throw error;
      return (data ?? null) as ShopSettings | null;
    },
    staleTime: 60_000,
  });
}

/** Parse EAN-13 weight-embedded barcodes (common scale labels).
 *  Format: 2XXXXX-WWWWW-C, where:
 *   - first digit "2"
 *   - 5-digit PLU (we store the entire 6-digit prefix as the product barcode)
 *   - 5-digit weight in grams (or price × 100 in some regions)
 */
export function parseScaleBarcode(code: string): { prefix: string; grams: number } | null {
  if (!/^\d{13}$/.test(code) || code[0] !== "2") return null;
  const prefix = code.slice(0, 7); // "2" + 6 digits — store full
  const weight = parseInt(code.slice(7, 12), 10);
  if (isNaN(weight) || weight <= 0) return null;
  return { prefix, grams: weight };
}
