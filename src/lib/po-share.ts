/** WhatsApp sharing for purchase orders. */

export type SharePoItem = { product_name: string; qty: number; unit: string | null; unit_cost: number; weight_g: number | null };
export type SharePo = {
  order_no: string | null;
  created_at: string;
  supplier_name: string | null;
  destination: string | null;
  expected_at: string | null;
  notes: string | null;
  items: SharePoItem[];
};

/** wa.me wants the country code without "+" — India mobiles get 91 prepended. */
export function waPhone(raw: string | null | undefined): string | null {
  const digits = (raw ?? "").replace(/\D/g, "");
  if (!digits) return null;
  if (digits.length === 10) return `91${digits}`;
  if (digits.length === 12 && digits.startsWith("91")) return digits;
  if (digits.length === 13 && digits.startsWith("091")) return digits.slice(1);
  return digits.length >= 10 && digits.length <= 15 ? digits : null;
}

export function poEstimatedTotal(po: SharePo): number {
  return Math.round(po.items.reduce((s, i) => s + Number(i.qty || 0) * Number(i.unit_cost || 0), 0) * 100) / 100;
}

/** Professional, plain-text order summary for the distributor. Rs. only (no ₹ glyph). */
export function buildPoMessage(po: SharePo, shopName: string): string {
  const lines: string[] = [];
  lines.push(`*${shopName || "Our store"}* — Purchase Order`);
  lines.push(`PO No: ${po.order_no ?? "—"}`);
  lines.push(`Date: ${new Date(po.created_at).toLocaleDateString("en-IN")}`);
  if (po.supplier_name) lines.push(`To: ${po.supplier_name}`);
  lines.push("");
  lines.push("Items:");
  po.items.forEach((i, idx) => {
    const pack = i.weight_g ? `${Number(i.weight_g)} g` : (i.unit ?? "");
    const qty = `${Number(i.qty)}${i.unit ? ` ${i.unit}` : ""}`;
    const cost = Number(i.unit_cost) > 0 ? ` @ Rs.${Number(i.unit_cost).toFixed(2)}` : "";
    const amt = Number(i.qty) * Number(i.unit_cost || 0);
    lines.push(`${idx + 1}. ${i.product_name}${pack ? ` (${pack})` : ""} — ${qty}${cost} = Rs.${amt.toFixed(2)}`);
  });
  lines.push("");
  lines.push(`Estimated total: Rs.${poEstimatedTotal(po).toFixed(2)}`);
  const delivery = [po.destination ? `Destination: ${po.destination}` : null, po.expected_at ? `Expected: ${po.expected_at}` : null]
    .filter(Boolean).join(" · ");
  if (delivery) lines.push(delivery);
  if (po.notes) lines.push(`Notes: ${po.notes}`);
  return lines.join("\n");
}

/**
 * Link to open WhatsApp. With a supplier number, pre-fills the chat;
 * without one, opens WhatsApp with the message copied to the clipboard.
 */
export function poWhatsAppUrl(phone: string | null | undefined, message: string): { url: string; hasNumber: boolean } {
  const num = waPhone(phone);
  if (num) return { url: `https://wa.me/${num}?text=${encodeURIComponent(message)}`, hasNumber: true };
  return { url: `https://wa.me/?text=${encodeURIComponent(message)}`, hasNumber: false };
}
