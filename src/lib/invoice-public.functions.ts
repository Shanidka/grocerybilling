import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const Input = z.object({ billNo: z.string().min(4).max(64) });

export type PublicInvoice = {
  bill_no: string;
  created_at: string;
  customer_name: string | null;
  customer_phone: string | null;
  payment_mode: string;
  subtotal: number;
  tax_total: number;
  line_discount: number;
  bill_discount: number;
  grand_total: number;
  items: { name: string; qty: number; unit_price: number; tax_pct: number; line_discount: number; line_total: number }[];
  shop: { shop_name: string; phone: string | null; address: string | null; gst_number: string | null; upi_id: string | null } | null;
};

export const getPublicInvoice = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => Input.parse(d))
  .handler(async ({ data }): Promise<PublicInvoice | null> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: sale, error } = await supabaseAdmin
      .from("sales")
      .select("id,bill_no,created_at,customer_name,customer_phone,payment_mode,subtotal,tax_total,line_discount,bill_discount,grand_total")
      .eq("bill_no", data.billNo)
      .maybeSingle();
    if (error || !sale) return null;
    const { data: items } = await supabaseAdmin
      .from("sale_items")
      .select("name,qty,unit_price,tax_pct,line_discount,line_total")
      .eq("sale_id", sale.id);
    const { data: shop } = await supabaseAdmin
      .from("shop_settings")
      .select("shop_name,phone,address,gst_number,upi_id")
      .eq("id", 1)
      .maybeSingle();
    return {
      bill_no: sale.bill_no,
      created_at: sale.created_at as unknown as string,
      customer_name: sale.customer_name,
      customer_phone: sale.customer_phone,
      payment_mode: sale.payment_mode,
      subtotal: Number(sale.subtotal),
      tax_total: Number(sale.tax_total),
      line_discount: Number(sale.line_discount),
      bill_discount: Number(sale.bill_discount),
      grand_total: Number(sale.grand_total),
      items: (items ?? []).map((i) => ({
        name: i.name, qty: Number(i.qty), unit_price: Number(i.unit_price),
        tax_pct: Number(i.tax_pct), line_discount: Number(i.line_discount), line_total: Number(i.line_total),
      })),
      shop: shop ?? null,
    };
  });
