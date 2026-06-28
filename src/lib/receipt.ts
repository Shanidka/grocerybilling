import jsPDF from "jspdf";
import QRCode from "qrcode";

export interface ReceiptInput {
  bill_no: string;
  created_at: string;
  cashier_name?: string;
  customer_name?: string | null;
  customer_phone?: string | null;
  payment_mode: string;
  paid_amount: number;
  change_amount: number;
  items: {
    name: string; qty: number; unit_price: number; tax_pct: number;
    line_discount: number; line_total: number;
  }[];
  subtotal: number;
  taxTotal: number;
  lineDiscount: number;
  billDisc: number;
  grand: number;
}

const STORE_NAME = "Bazaar Supermarket";
const STORE_TAGLINE = "GST Invoice · Thank you for shopping";

export async function generateReceipt(r: ReceiptInput) {
  // QR payload: scannable invoice
  const qrPayload = JSON.stringify({
    bill: r.bill_no,
    at: r.created_at,
    total: r.grand,
    items: r.items.map((i) => ({ n: i.name, q: i.qty, p: i.unit_price, t: i.line_total })),
  });
  const qrDataUrl = await QRCode.toDataURL(qrPayload, { margin: 0, width: 160 });

  // 80mm thermal width
  const W = 80;
  const H = 140 + r.items.length * 8 + 40;
  const doc = new jsPDF({ unit: "mm", format: [W, H] });
  let y = 8;

  doc.setFont("helvetica", "bold").setFontSize(13);
  doc.text(STORE_NAME, W / 2, y, { align: "center" }); y += 5;
  doc.setFont("helvetica", "normal").setFontSize(8);
  doc.text(STORE_TAGLINE, W / 2, y, { align: "center" }); y += 5;

  doc.setLineDashPattern([0.5, 0.5], 0);
  doc.line(4, y, W - 4, y); y += 4;

  doc.setFontSize(8);
  doc.text(`Bill: ${r.bill_no}`, 4, y);
  doc.text(new Date(r.created_at).toLocaleString("en-IN"), W - 4, y, { align: "right" });
  y += 4;
  if (r.cashier_name) { doc.text(`Cashier: ${r.cashier_name}`, 4, y); y += 4; }
  if (r.customer_name || r.customer_phone) {
    doc.text(`Customer: ${[r.customer_name, r.customer_phone].filter(Boolean).join(" · ")}`, 4, y);
    y += 4;
  }
  doc.text(`Payment: ${r.payment_mode.toUpperCase()}`, 4, y); y += 3;

  doc.line(4, y, W - 4, y); y += 4;
  doc.setFont("helvetica", "bold");
  doc.text("Item", 4, y); doc.text("Qty", 42, y, { align: "right" });
  doc.text("Rate", 58, y, { align: "right" }); doc.text("Total", W - 4, y, { align: "right" });
  y += 3;
  doc.line(4, y, W - 4, y); y += 4;

  doc.setFont("helvetica", "normal");
  for (const it of r.items) {
    const nm = it.name.length > 22 ? it.name.slice(0, 22) + "…" : it.name;
    doc.text(nm, 4, y);
    doc.text(String(it.qty), 42, y, { align: "right" });
    doc.text(it.unit_price.toFixed(2), 58, y, { align: "right" });
    doc.text(it.line_total.toFixed(2), W - 4, y, { align: "right" });
    y += 4;
    if (it.line_discount > 0 || it.tax_pct > 0) {
      doc.setFontSize(7).setTextColor(120);
      const meta = [
        it.line_discount > 0 ? `disc ₹${it.line_discount.toFixed(2)}` : null,
        it.tax_pct > 0 ? `GST ${it.tax_pct}%` : null,
      ].filter(Boolean).join(" · ");
      doc.text(meta, 4, y);
      y += 3;
      doc.setFontSize(8).setTextColor(0);
    }
  }
  doc.line(4, y, W - 4, y); y += 4;

  const right = (label: string, val: string, bold = false) => {
    doc.setFont("helvetica", bold ? "bold" : "normal").setFontSize(bold ? 10 : 8);
    doc.text(label, 4, y);
    doc.text(val, W - 4, y, { align: "right" });
    y += bold ? 6 : 4;
  };
  right("Subtotal", `₹${r.subtotal.toFixed(2)}`);
  right("GST", `₹${r.taxTotal.toFixed(2)}`);
  if (r.lineDiscount > 0) right("Item discount", `- ₹${r.lineDiscount.toFixed(2)}`);
  if (r.billDisc > 0) right("Bill discount", `- ₹${r.billDisc.toFixed(2)}`);
  doc.line(4, y, W - 4, y); y += 4;
  right("TOTAL", `₹${r.grand.toFixed(2)}`, true);
  right("Paid", `₹${r.paid_amount.toFixed(2)}`);
  if (r.change_amount > 0) right("Change", `₹${r.change_amount.toFixed(2)}`);

  y += 4;
  // QR code
  doc.addImage(qrDataUrl, "PNG", (W - 28) / 2, y, 28, 28);
  y += 30;
  doc.setFont("helvetica", "normal").setFontSize(7).setTextColor(120);
  doc.text("Scan QR to view invoice details", W / 2, y, { align: "center" });
  doc.setTextColor(0);

  doc.save(`${r.bill_no}.pdf`);
}
