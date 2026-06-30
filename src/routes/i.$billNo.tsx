import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { getPublicInvoice } from "@/lib/invoice-public.functions";
import { inr } from "@/lib/format";
import QRCode from "qrcode";

export const Route = createFileRoute("/i/$billNo")({
  ssr: false,
  component: InvoiceView,
  head: ({ params }) => ({ meta: [{ title: `Invoice ${params.billNo}` }] }),
});

function InvoiceView() {
  const { billNo } = Route.useParams();
  const fetchInvoice = useServerFn(getPublicInvoice);
  const q = useQuery({
    queryKey: ["public-invoice", billNo],
    queryFn: () => fetchInvoice({ data: { billNo } }),
  });
  const [upiQr, setUpiQr] = useState<string | null>(null);

  const inv = q.data;
  useEffect(() => {
    if (!inv?.shop?.upi_id) return;
    const upi = `upi://pay?pa=${inv.shop.upi_id}&pn=${encodeURIComponent(inv.shop.shop_name)}&am=${inv.grand_total.toFixed(2)}&cu=INR&tn=${encodeURIComponent("Bill " + inv.bill_no)}`;
    QRCode.toDataURL(upi, { width: 220, margin: 1 }).then(setUpiQr).catch(() => setUpiQr(null));
  }, [inv]);

  if (q.isLoading) return <div className="min-h-screen grid place-items-center text-muted-foreground">Loading invoice…</div>;
  if (!inv) return <div className="min-h-screen grid place-items-center text-muted-foreground">Invoice not found.</div>;

  return (
    <div className="min-h-screen bg-muted/40 py-8 px-4">
      <div className="max-w-md mx-auto bg-card rounded-lg shadow border p-6 space-y-4">
        <div className="text-center">
          <h1 className="text-xl font-semibold">{inv.shop?.shop_name ?? "Invoice"}</h1>
          {inv.shop?.address && <p className="text-xs text-muted-foreground">{inv.shop.address}</p>}
          {(inv.shop?.phone || inv.shop?.gst_number) && (
            <p className="text-xs text-muted-foreground">
              {inv.shop.phone ? `Ph: ${inv.shop.phone}` : ""}
              {inv.shop.phone && inv.shop.gst_number ? " · " : ""}
              {inv.shop.gst_number ? `GSTIN: ${inv.shop.gst_number}` : ""}
            </p>
          )}
        </div>
        <div className="text-xs flex justify-between border-y py-2">
          <span>Bill: <b>{inv.bill_no}</b></span>
          <span>{new Date(inv.created_at).toLocaleString("en-IN")}</span>
        </div>
        {(inv.customer_name || inv.customer_phone) && (
          <div className="text-xs text-muted-foreground">Customer: {[inv.customer_name, inv.customer_phone].filter(Boolean).join(" · ")}</div>
        )}
        <table className="w-full text-sm">
          <thead className="text-xs text-muted-foreground border-b">
            <tr><th className="text-left py-1">Item</th><th className="text-right">Qty</th><th className="text-right">Rate</th><th className="text-right">Total</th></tr>
          </thead>
          <tbody>
            {inv.items.map((it, i) => (
              <tr key={i} className="border-b last:border-0">
                <td className="py-1.5">{it.name}</td>
                <td className="text-right tabular-nums">{it.qty}</td>
                <td className="text-right tabular-nums">{inr(it.unit_price)}</td>
                <td className="text-right tabular-nums">{inr(it.line_total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="space-y-1 text-sm">
          <Row label="Subtotal" value={inr(inv.subtotal)} />
          <Row label="GST" value={inr(inv.tax_total)} />
          {inv.line_discount > 0 && <Row label="Item discount" value={`- ${inr(inv.line_discount)}`} />}
          {inv.bill_discount > 0 && <Row label="Bill discount" value={`- ${inr(inv.bill_discount)}`} />}
          <div className="flex justify-between font-semibold text-base border-t pt-2">
            <span>Total</span><span className="tabular-nums">{inr(inv.grand_total)}</span>
          </div>
          <Row label="Payment" value={inv.payment_mode.toUpperCase()} />
        </div>
        {upiQr && (
          <div className="text-center border-t pt-4">
            <img src={upiQr} alt="Pay via UPI" className="mx-auto rounded border" />
            <p className="text-xs text-muted-foreground mt-2">Scan to pay {inr(inv.grand_total)} via UPI</p>
          </div>
        )}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return <div className="flex justify-between text-sm"><span className="text-muted-foreground">{label}</span><span className="tabular-nums">{value}</span></div>;
}
