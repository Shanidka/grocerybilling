import { supabase } from "@/integrations/supabase/client";
import { generateReceipt } from "@/lib/receipt";

/** Re-print a saved bill directly (no download). */
export async function reprintSale(saleId: string) {
  const { data: s, error } = await supabase
    .from("sales")
    .select("*, sale_items(name,qty,unit_price,tax_pct,line_discount,line_total,product_id)")
    .eq("id", saleId)
    .single();
  if (error || !s) throw error ?? new Error("Bill not found");
  const [{ data: shop }, { data: store }, { data: prof }] = await Promise.all([
    supabase.from("shop_settings").select("*").eq("id", 1).maybeSingle(),
    s.store_id ? supabase.from("stores").select("*").eq("id", s.store_id).maybeSingle() : Promise.resolve({ data: null }),
    supabase.from("profiles").select("full_name").eq("id", s.cashier_id).maybeSingle(),
  ]);
  const items = (s.sale_items ?? []) as Array<{ name: string; qty: number; unit_price: number; tax_pct: number; line_discount: number; line_total: number; product_id: string | null }>;
  const ids = items.map((i) => i.product_id).filter(Boolean) as string[];
  const { data: prods } = ids.length ? await supabase.from("products").select("id,mrp").in("id", ids) : { data: [] };
  const mrp = new Map((prods ?? []).map((p) => [p.id, Number(p.mrp) || 0]));
  await generateReceipt({
    bill_no: s.bill_no, created_at: s.created_at,
    cashier_name: prof?.full_name?.split(" ")[0] ?? undefined,
    customer_name: s.customer_name, customer_phone: s.customer_phone,
    payment_mode: s.payment_mode, paid_amount: Number(s.paid_amount), change_amount: Number(s.change_amount),
    items: items.map((i) => ({
      name: i.name, qty: Number(i.qty), unit_price: Number(i.unit_price), tax_pct: Number(i.tax_pct),
      line_discount: Number(i.line_discount), line_total: Number(i.line_total), mrp: i.product_id ? mrp.get(i.product_id) : undefined,
    })),
    subtotal: Number(s.subtotal), taxTotal: Number(s.tax_total), lineDiscount: Number(s.line_discount),
    billDisc: Number(s.bill_discount), grand: Number(s.grand_total),
    invoice_url: `${window.location.origin}/i/${s.bill_no}`,
    shop: {
      shop_name: store?.name || shop?.shop_name || "Store",
      phone: store?.phone ?? shop?.phone, address: store?.address ?? shop?.address,
      gst_number: store?.gst_number ?? shop?.gst_number, upi_id: store?.upi_id || shop?.upi_id,
      receipt_footer: shop?.receipt_footer,
    },
    loyalty: Number(s.points_earned) || Number(s.points_redeemed)
      ? { earned: Number(s.points_earned), redeemed: Number(s.points_redeemed), discount: Number(s.loyalty_discount) }
      : null,
  }, "print");
}
