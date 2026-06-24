import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { inr, num } from "@/lib/format";
import { IndianRupee, Receipt, TrendingUp, Package } from "lucide-react";
import { useMemo } from "react";

export const Route = createFileRoute("/_authenticated/reports")({
  component: ReportsPage,
  head: () => ({ meta: [{ title: "Reports — FreshMart POS" }] }),
});

type Period = "daily" | "weekly" | "monthly";

function startOf(period: Period): Date {
  const d = new Date();
  if (period === "daily") { d.setHours(0, 0, 0, 0); return d; }
  if (period === "weekly") {
    const day = d.getDay(); // 0=Sun
    const diff = (day + 6) % 7; // make Monday=0
    d.setDate(d.getDate() - diff);
    d.setHours(0, 0, 0, 0);
    return d;
  }
  d.setDate(1); d.setHours(0, 0, 0, 0); return d;
}

function ReportsPage() {
  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-semibold">Sales reports</h1>
        <p className="text-muted-foreground text-sm">Totals and per-product breakdowns</p>
      </div>

      <Tabs defaultValue="daily">
        <TabsList>
          <TabsTrigger value="daily">Daily</TabsTrigger>
          <TabsTrigger value="weekly">This week</TabsTrigger>
          <TabsTrigger value="monthly">This month</TabsTrigger>
        </TabsList>
        <TabsContent value="daily"><Report period="daily" /></TabsContent>
        <TabsContent value="weekly"><Report period="weekly" /></TabsContent>
        <TabsContent value="monthly"><Report period="monthly" /></TabsContent>
      </Tabs>
    </div>
  );
}

function Report({ period }: { period: Period }) {
  const since = useMemo(() => startOf(period).toISOString(), [period]);

  const sales = useQuery({
    queryKey: ["report-sales", period],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales")
        .select("id, grand_total, subtotal, tax_total, discount_total, bill_discount, created_at")
        .gte("created_at", since);
      if (error) throw error;
      return data ?? [];
    },
  });

  const items = useQuery({
    queryKey: ["report-items", period],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sale_items")
        .select("product_id, product_name, qty, unit_price, line_total, created_at")
        .gte("created_at", since);
      if (error) throw error;
      return data ?? [];
    },
  });

  const totals = useMemo(() => {
    const s = sales.data ?? [];
    return {
      gross: s.reduce((a, r) => a + Number(r.grand_total), 0),
      tax: s.reduce((a, r) => a + Number(r.tax_total), 0),
      discount: s.reduce((a, r) => a + Number(r.discount_total) + Number(r.bill_discount), 0),
      bills: s.length,
    };
  }, [sales.data]);

  const byProduct = useMemo(() => {
    const map = new Map<string, { name: string; qty: number; revenue: number }>();
    for (const it of items.data ?? []) {
      const key = it.product_id ?? it.product_name;
      const cur = map.get(key) ?? { name: it.product_name, qty: 0, revenue: 0 };
      cur.qty += Number(it.qty);
      cur.revenue += Number(it.line_total);
      map.set(key, cur);
    }
    return [...map.values()].sort((a, b) => b.revenue - a.revenue);
  }, [items.data]);

  const loading = sales.isLoading || items.isLoading;

  return (
    <div className="space-y-6 mt-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Stat label="Gross sales" value={inr(totals.gross)} icon={IndianRupee} />
        <Stat label="Bills" value={num(totals.bills, 0)} icon={Receipt} />
        <Stat label="GST collected" value={inr(totals.tax)} icon={TrendingUp} />
        <Stat label="Discounts" value={inr(totals.discount)} icon={Package} />
      </div>

      <Card className="overflow-hidden">
        <div className="px-5 py-4 border-b">
          <h2 className="font-semibold">Per-product sales</h2>
          <p className="text-xs text-muted-foreground">Ranked by revenue in this period</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/60 text-muted-foreground">
              <tr className="text-left">
                <th className="px-4 py-3 font-medium">Product</th>
                <th className="px-4 py-3 font-medium text-right">Qty sold</th>
                <th className="px-4 py-3 font-medium text-right">Revenue</th>
                <th className="px-4 py-3 font-medium text-right">% of total</th>
              </tr>
            </thead>
            <tbody>
              {byProduct.map((p) => (
                <tr key={p.name} className="border-t">
                  <td className="px-4 py-3 font-medium">{p.name}</td>
                  <td className="px-4 py-3 text-right">{num(p.qty)}</td>
                  <td className="px-4 py-3 text-right font-semibold">{inr(p.revenue)}</td>
                  <td className="px-4 py-3 text-right text-muted-foreground">
                    {totals.gross > 0 ? ((p.revenue / totals.gross) * 100).toFixed(1) : "0.0"}%
                  </td>
                </tr>
              ))}
              {!byProduct.length && (
                <tr><td colSpan={4} className="px-4 py-10 text-center text-muted-foreground">
                  {loading ? "Loading..." : "No sales in this period yet."}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function Stat({ label, value, icon: Icon }: { label: string; value: string; icon: React.ComponentType<{ className?: string }> }) {
  return (
    <Card className="p-4 flex items-center gap-3">
      <div className="size-10 rounded-lg bg-primary/10 text-primary grid place-items-center">
        <Icon className="size-5" />
      </div>
      <div>
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="text-lg font-semibold">{value}</div>
      </div>
    </Card>
  );
}
