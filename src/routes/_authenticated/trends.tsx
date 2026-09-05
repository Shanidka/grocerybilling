import { createFileRoute, Navigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useStoreId } from "@/lib/active-store";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { inr, num } from "@/lib/format";
import { TrendingUp, Snowflake } from "lucide-react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useMyRoles, canManage } from "@/hooks/use-role";

export const Route = createFileRoute("/_authenticated/trends")({
  ssr: false,
  component: TrendsPage,
  head: () => ({
    meta: [
      { title: "Sales Trends & Best Sellers | Bazaar POS" },
      { name: "description", content: "Track sales trends, monthly best sellers, quantity sold and slow or non-moving stock in one place." },
      { property: "og:title", content: "Sales Trends & Best Sellers | Bazaar POS" },
      { property: "og:description", content: "Sales trends, monthly best sellers and non-moving stock." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

type Item = { name: string; qty: number | string; line_total: number | string; cost_at_sale: number | string; product_id: string | null };
type SaleRow = { created_at: string; grand_total: number | string; sale_items: Item[] | null };

function TrendsPage() {
  const { data: roles, isLoading } = useMyRoles();
  const storeId = useStoreId();
  const [days, setDays] = useState("90");
  const [dead, setDead] = useState("30");

  const since = useMemo(() => {
    const d = new Date(); d.setDate(d.getDate() - 365); d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const sales = useQuery({
    queryKey: ["trends-sales", storeId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales")
        .select("created_at,grand_total,sale_items(name,qty,line_total,cost_at_sale,product_id)")
        .eq("store_id", storeId)
        .gte("created_at", since.toISOString())
        .order("created_at");
      if (error) throw error;
      return (data ?? []) as unknown as SaleRow[];
    },
  });

  const products = useQuery({
    queryKey: ["trends-products", storeId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id,name,brand,stock_qty,purchase_price,selling_price,last_sold_at")
        .eq("store_id", storeId).eq("is_active", true);
      if (error) throw error;
      return data ?? [];
    },
  });

  /** Unit cost: the cost captured at billing time, else the product's current purchase price. */
  const unitCost = useMemo(() => {
    const costs = new Map((products.data ?? []).map((p) => [p.id, Number(p.purchase_price) || 0]));
    return (it: Item) => {
      const captured = Number(it.cost_at_sale ?? 0);
      if (captured > 0) return captured;
      return it.product_id ? costs.get(it.product_id) ?? 0 : 0;
    };
  }, [products.data]);

  const windowRows = useMemo(() => {
    const cut = new Date(); cut.setDate(cut.getDate() - Number(days)); cut.setHours(0, 0, 0, 0);
    return (sales.data ?? []).filter((s) => new Date(s.created_at) >= cut);
  }, [sales.data, days]);


  const daily = useMemo(() => {
    const map = new Map<string, number>();
    for (let i = Number(days) - 1; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      map.set(d.toISOString().slice(0, 10), 0);
    }
    for (const s of windowRows) {
      const k = new Date(s.created_at).toISOString().slice(0, 10);
      if (map.has(k)) map.set(k, (map.get(k) ?? 0) + Number(s.grand_total));
    }
    return Array.from(map, ([date, total]) => ({ date: date.slice(5), total: Math.round(total) }));
  }, [windowRows, days]);

  const monthly = useMemo(() => {
    const map = new Map<string, number>();
    for (const s of sales.data ?? []) {
      const k = s.created_at.slice(0, 7);
      map.set(k, (map.get(k) ?? 0) + Number(s.grand_total));
    }
    return Array.from(map, ([month, total]) => ({ month, total: Math.round(total) })).sort((a, b) => a.month.localeCompare(b.month));
  }, [sales.data]);

  const best = useMemo(() => {
    const map = new Map<string, { name: string; qty: number; revenue: number; profit: number }>();
    for (const s of windowRows) {
      for (const it of s.sale_items ?? []) {
        const cur = map.get(it.name) ?? { name: it.name, qty: 0, revenue: 0, profit: 0 };
        cur.qty += Number(it.qty);
        cur.revenue += Number(it.line_total);
        cur.profit += Number(it.line_total) - unitCost(it) * Number(it.qty);
        map.set(it.name, cur);
      }
    }
    return Array.from(map.values()).sort((a, b) => b.qty - a.qty);
  }, [windowRows]);

  const bestByMonth = useMemo(() => {
    const months = new Map<string, Map<string, { qty: number; revenue: number }>>();
    for (const s of sales.data ?? []) {
      const k = s.created_at.slice(0, 7);
      const m = months.get(k) ?? new Map();
      for (const it of s.sale_items ?? []) {
        const cur = m.get(it.name) ?? { qty: 0, revenue: 0 };
        cur.qty += Number(it.qty); cur.revenue += Number(it.line_total);
        m.set(it.name, cur);
      }
      months.set(k, m);
    }
    return Array.from(months.entries())
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([month, m]) => {
        const top = Array.from(m.entries()).sort((a, b) => b[1].qty - a[1].qty)[0];
        return { month, name: top?.[0] ?? "—", qty: top?.[1].qty ?? 0, revenue: top?.[1].revenue ?? 0 };
      });
  }, [sales.data]);

  const notMoving = useMemo(() => {
    const cut = new Date(); cut.setDate(cut.getDate() - Number(dead));
    return (products.data ?? [])
      .filter((p) => !p.last_sold_at || new Date(p.last_sold_at) < cut)
      .map((p) => ({ ...p, value: Number(p.stock_qty) * Number(p.purchase_price) }))
      .sort((a, b) => b.value - a.value);
  }, [products.data, dead]);

  if (!isLoading && !canManage(roles)) return <Navigate to="/dashboard" />;

  return (
    <div className="p-4 lg:p-6 space-y-6 max-w-6xl">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2"><TrendingUp className="size-6" /> Trends</h1>
          <p className="text-sm text-muted-foreground">Sales trend, best sellers, quantities sold and stock that isn't moving.</p>
        </div>
        <Select value={days} onValueChange={setDays}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="7">Last 7 days</SelectItem>
            <SelectItem value="30">Last 30 days</SelectItem>
            <SelectItem value="90">Last 90 days</SelectItem>
            <SelectItem value="365">Last 12 months</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <Card className="p-5">
          <h3 className="font-semibold mb-3">Sales trend</h3>
          <div className="h-64">
            <ResponsiveContainer>
              <AreaChart data={daily}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} minTickGap={20} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v: number) => inr(v)} />
                <Area type="monotone" dataKey="total" stroke="hsl(var(--primary))" fill="hsl(var(--primary))" fillOpacity={0.15} strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card className="p-5">
          <h3 className="font-semibold mb-3">Month-wise sales</h3>
          <div className="h-64">
            <ResponsiveContainer>
              <BarChart data={monthly}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v: number) => inr(v)} />
                <Bar dataKey="total" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <Card className="p-0 overflow-hidden">
        <div className="px-4 py-3 border-b font-semibold text-sm">Best selling products — last {days} days</div>
        {!best.length ? <div className="p-8 text-center text-sm text-muted-foreground">No sales in this period.</div> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left"><tr>
                <th className="px-4 py-2.5">#</th><th className="px-4 py-2.5">Product</th>
                <th className="px-4 py-2.5 text-right">Qty sold</th><th className="px-4 py-2.5 text-right">Revenue</th><th className="px-4 py-2.5 text-right">Profit</th>
              </tr></thead>
              <tbody className="divide-y">{best.slice(0, 25).map((p, i) => (
                <tr key={p.name}>
                  <td className="px-4 py-2.5 text-muted-foreground">{i + 1}</td>
                  <td className="px-4 py-2.5">{p.name}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{num(p.qty, 3)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{inr(p.revenue)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{inr(p.profit)}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </Card>

      <Card className="p-0 overflow-hidden">
        <div className="px-4 py-3 border-b font-semibold text-sm">Best seller of each month</div>
        {!bestByMonth.length ? <div className="p-8 text-center text-sm text-muted-foreground">No data yet.</div> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left"><tr>
                <th className="px-4 py-2.5">Month</th><th className="px-4 py-2.5">Top product</th>
                <th className="px-4 py-2.5 text-right">Qty sold</th><th className="px-4 py-2.5 text-right">Revenue</th>
              </tr></thead>
              <tbody className="divide-y">{bestByMonth.map((m) => (
                <tr key={m.month}>
                  <td className="px-4 py-2.5">{m.month}</td>
                  <td className="px-4 py-2.5">{m.name}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{num(m.qty, 3)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{inr(m.revenue)}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </Card>

      <Card className="p-0 overflow-hidden">
        <div className="px-4 py-3 border-b flex items-center justify-between gap-3 flex-wrap">
          <div className="font-semibold text-sm flex items-center gap-2"><Snowflake className="size-4" /> Not moving stock</div>
          <Select value={dead} onValueChange={setDead}>
            <SelectTrigger className="w-44 h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              {["7", "15", "30", "60", "90"].map((d) => <SelectItem key={d} value={d}>No sale in {d} days</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        {!notMoving.length ? <div className="p-8 text-center text-sm text-muted-foreground">Everything is moving. </div> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left"><tr>
                <th className="px-4 py-2.5">Product</th><th className="px-4 py-2.5">Brand</th>
                <th className="px-4 py-2.5">Last sold</th><th className="px-4 py-2.5 text-right">Stock</th><th className="px-4 py-2.5 text-right">Stock value</th>
              </tr></thead>
              <tbody className="divide-y">{notMoving.slice(0, 100).map((p) => (
                <tr key={p.id}>
                  <td className="px-4 py-2.5">{p.name}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">{p.brand ?? "—"}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">{p.last_sold_at ? new Date(p.last_sold_at).toLocaleDateString("en-IN") : "Never"}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{num(p.stock_qty, 3)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{inr(p.value)}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
