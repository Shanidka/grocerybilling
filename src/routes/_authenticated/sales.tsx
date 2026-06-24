import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Receipt, Eye, Download, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { inr, dt } from "@/lib/format";
import { generateReceipt } from "@/lib/receipt";

export const Route = createFileRoute("/_authenticated/sales")({
  component: SalesPage,
  head: () => ({ meta: [{ title: "Sales — FreshMart POS" }] }),
});

type Sale = {
  id: string; bill_no: string; created_at: string;
  subtotal: number; tax_total: number; discount_total: number;
  bill_discount: number; grand_total: number; payment_mode: string;
  customer_name: string | null; customer_phone: string | null;
};

function SalesPage() {
  const [q, setQ] = useState("");
  const [viewing, setViewing] = useState<Sale | null>(null);

  const sales = useQuery({
    queryKey: ["sales"],
    queryFn: async () => {
      const { data, error } = await supabase.from("sales").select("*")
        .order("created_at", { ascending: false }).limit(200);
      if (error) throw error;
      return data as Sale[];
    },
  });

  const filtered = useMemo(() => {
    const list = sales.data ?? [];
    if (!q.trim()) return list;
    const t = q.toLowerCase();
    return list.filter((s) =>
      s.bill_no.toLowerCase().includes(t) ||
      s.customer_name?.toLowerCase().includes(t) ||
      s.customer_phone?.toLowerCase().includes(t),
    );
  }, [sales.data, q]);

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-semibold">Sales</h1>
        <p className="text-muted-foreground text-sm">Recent bills (last 200)</p>
      </div>

      <Card className="p-4">
        <div className="relative max-w-sm">
          <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-9" placeholder="Search bill no / customer..." value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/60 text-muted-foreground">
              <tr className="text-left">
                <th className="px-4 py-3 font-medium">Bill</th>
                <th className="px-4 py-3 font-medium">Date</th>
                <th className="px-4 py-3 font-medium">Customer</th>
                <th className="px-4 py-3 font-medium">Payment</th>
                <th className="px-4 py-3 font-medium text-right">Total</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {filtered.map((s) => (
                <tr key={s.id} className="border-t hover:bg-muted/30">
                  <td className="px-4 py-3 font-medium">{s.bill_no}</td>
                  <td className="px-4 py-3 text-muted-foreground">{dt(s.created_at)}</td>
                  <td className="px-4 py-3">{s.customer_name || "—"}</td>
                  <td className="px-4 py-3 capitalize">{s.payment_mode}</td>
                  <td className="px-4 py-3 text-right font-semibold">{inr(s.grand_total)}</td>
                  <td className="px-2 py-3 text-right">
                    <Button variant="ghost" size="icon" onClick={() => setViewing(s)}><Eye className="size-4" /></Button>
                  </td>
                </tr>
              ))}
              {!filtered.length && (
                <tr><td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">No sales yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <SaleDetails sale={viewing} onClose={() => setViewing(null)} />
    </div>
  );
}

function SaleDetails({ sale, onClose }: { sale: Sale | null; onClose: () => void }) {
  const items = useQuery({
    queryKey: ["sale-items", sale?.id],
    enabled: !!sale,
    queryFn: async () => {
      const { data, error } = await supabase.from("sale_items").select("*").eq("sale_id", sale!.id);
      if (error) throw error;
      return data ?? [];
    },
  });

  const reprint = () => {
    if (!sale || !items.data) return;
    generateReceipt({
      bill_no: sale.bill_no,
      created_at: sale.created_at,
      customer_name: sale.customer_name,
      customer_phone: sale.customer_phone,
      payment_mode: sale.payment_mode,
      items: items.data.map((it) => ({
        name: it.product_name, qty: Number(it.qty), unit_price: Number(it.unit_price),
        tax_pct: Number(it.tax_pct), line_discount: Number(it.line_discount),
        line_total: Number(it.line_total),
      })),
      subtotal: Number(sale.subtotal),
      taxTotal: Number(sale.tax_total),
      lineDiscount: Number(sale.discount_total),
      billDisc: Number(sale.bill_discount),
      grand: Number(sale.grand_total),
    });
  };

  return (
    <Dialog open={!!sale} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Receipt className="size-4" /> {sale?.bill_no}</DialogTitle>
        </DialogHeader>
        {sale && (
          <div className="space-y-3 text-sm">
            <div className="text-xs text-muted-foreground">{dt(sale.created_at)} · {sale.payment_mode.toUpperCase()}</div>
            {sale.customer_name && <div>Customer: <span className="font-medium">{sale.customer_name}</span> {sale.customer_phone && `(${sale.customer_phone})`}</div>}
            <div className="border rounded-md divide-y">
              {(items.data ?? []).map((it) => (
                <div key={it.id} className="px-3 py-2 flex items-center justify-between">
                  <div>
                    <div className="font-medium">{it.product_name}</div>
                    <div className="text-xs text-muted-foreground">{Number(it.qty)} × {inr(it.unit_price)} · GST {Number(it.tax_pct)}%</div>
                  </div>
                  <div className="font-semibold">{inr(it.line_total)}</div>
                </div>
              ))}
            </div>
            <div className="space-y-1 border-t pt-3">
              <Row label="Subtotal" value={inr(sale.subtotal)} />
              <Row label="GST" value={inr(sale.tax_total)} />
              {Number(sale.discount_total) > 0 && <Row label="Item discount" value={`- ${inr(sale.discount_total)}`} />}
              {Number(sale.bill_discount) > 0 && <Row label="Bill discount" value={`- ${inr(sale.bill_discount)}`} />}
              <div className="flex justify-between font-semibold text-base pt-1">
                <span>Total</span><span>{inr(sale.grand_total)}</span>
              </div>
            </div>
            <Button className="w-full" onClick={reprint}><Download className="size-4 mr-2" /> Download receipt</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return <div className="flex justify-between"><span className="text-muted-foreground">{label}</span><span>{value}</span></div>;
}
