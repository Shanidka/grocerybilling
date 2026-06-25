import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { inr, num } from "@/lib/format";
import { IndianRupee, Receipt, TrendingUp, Package, CalendarIcon } from "lucide-react";
import { useMemo, useState } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from "recharts";

export const Route = createFileRoute("/_authenticated/reports")({
  component: ReportsPage,
  head: () => ({ meta: [{ title: "Reports — FreshMart POS" }] }),
});

type Preset = "today" | "7d" | "30d" | "mtd" | "ytd" | "custom";

function rangeFor(preset: Preset, customFrom?: string, customTo?: string): { from: Date; to: Date } {
  const to = new Date();
  to.setHours(23, 59, 59, 999);
  const from = new Date();
  from.setHours(0, 0, 0, 0);
  switch (preset) {
    case "today":
      return { from, to };
    case "7d":
      from.setDate(from.getDate() - 6);
      return { from, to };
    case "30d":
      from.setDate(from.getDate() - 29);
      return { from, to };
    case "mtd":
      from.setDate(1);
      return { from, to };
    case "ytd":
      from.setMonth(0, 1);
      return { from, to };
    case "custom": {
      const f = customFrom ? new Date(customFrom) : from;
      const t = customTo ? new Date(customTo) : to;
      f.setHours(0, 0, 0, 0);
      t.setHours(23, 59, 59, 999);
      return { from: f, to: t };
    }
  }
}

const fmtDay = (d: Date) =>
  d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });

function ReportsPage() {
  const [preset, setPreset] = useState<Preset>("7d");
  const [customFrom, setCustomFrom] = useState<string>(
    new Date(Date.now() - 6 * 86400000).toISOString().slice(0, 10),
  );
  const [customTo, setCustomTo] = useState<string>(new Date().toISOString().slice(0, 10));

  const { from, to } = useMemo(
    () => rangeFor(preset, customFrom, customTo),
    [preset, customFrom, customTo],
  );

  const sales = useQuery({
    queryKey: ["report-sales", from.toISOString(), to.toISOString()],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales")
        .select("id, grand_total, subtotal, tax_total, discount_total, bill_discount, created_at")
        .gte("created_at", from.toISOString())
        .lte("created_at", to.toISOString())
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const items = useQuery({
    queryKey: ["report-items", from.toISOString(), to.toISOString()],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sale_items")
        .select("product_id, product_name, qty, unit_price, line_total, created_at")
        .gte("created_at", from.toISOString())
        .lte("created_at", to.toISOString());
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

  // Bucketing for trend chart: daily if span <= 60 days else monthly
  const spanDays = Math.max(1, Math.round((to.getTime() - from.getTime()) / 86400000));
  const bucketBy: "day" | "month" = spanDays <= 60 ? "day" : "month";

  const trend = useMemo(() => {
    const buckets = new Map<string, { label: string; sales: number; bills: number; sort: number }>();
    // pre-fill empty buckets
    if (bucketBy === "day") {
      const cur = new Date(from);
      while (cur <= to) {
        const key = cur.toISOString().slice(0, 10);
        buckets.set(key, { label: fmtDay(cur), sales: 0, bills: 0, sort: cur.getTime() });
        cur.setDate(cur.getDate() + 1);
      }
    } else {
      const cur = new Date(from.getFullYear(), from.getMonth(), 1);
      while (cur <= to) {
        const key = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, "0")}`;
        buckets.set(key, {
          label: cur.toLocaleDateString("en-IN", { month: "short", year: "2-digit" }),
          sales: 0,
          bills: 0,
          sort: cur.getTime(),
        });
        cur.setMonth(cur.getMonth() + 1);
      }
    }
    for (const r of sales.data ?? []) {
      const d = new Date(r.created_at);
      const key =
        bucketBy === "day"
          ? d.toISOString().slice(0, 10)
          : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const b = buckets.get(key);
      if (!b) continue;
      b.sales += Number(r.grand_total);
      b.bills += 1;
    }
    return [...buckets.values()].sort((a, b) => a.sort - b.sort);
  }, [sales.data, from, to, bucketBy]);

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

  const topProducts = byProduct.slice(0, 10);
  const loading = sales.isLoading || items.isLoading;

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-semibold">Sales reports</h1>
        <p className="text-muted-foreground text-sm">
          Trends, totals and per-product breakdowns
        </p>
      </div>

      <Card className="p-4 space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <CalendarIcon className="size-4 text-muted-foreground" />
          {([
            ["today", "Today"],
            ["7d", "Last 7 days"],
            ["30d", "Last 30 days"],
            ["mtd", "Month to date"],
            ["ytd", "Year to date"],
            ["custom", "Custom"],
          ] as [Preset, string][]).map(([p, label]) => (
            <Button
              key={p}
              size="sm"
              variant={preset === p ? "default" : "outline"}
              onClick={() => setPreset(p)}
            >
              {label}
            </Button>
          ))}
        </div>
        {preset === "custom" && (
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <Label className="text-xs">From</Label>
              <Input
                type="date"
                value={customFrom}
                max={customTo}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="w-44"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">To</Label>
              <Input
                type="date"
                value={customTo}
                min={customFrom}
                onChange={(e) => setCustomTo(e.target.value)}
                className="w-44"
              />
            </div>
          </div>
        )}
        <div className="text-xs text-muted-foreground">
          Showing {from.toLocaleDateString("en-IN")} → {to.toLocaleDateString("en-IN")} ·{" "}
          {spanDays} day{spanDays === 1 ? "" : "s"} · bucketed by {bucketBy}
        </div>
      </Card>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Stat label="Gross sales" value={inr(totals.gross)} icon={IndianRupee} />
        <Stat label="Bills" value={num(totals.bills, 0)} icon={Receipt} />
        <Stat label="GST collected" value={inr(totals.tax)} icon={TrendingUp} />
        <Stat label="Discounts" value={inr(totals.discount)} icon={Package} />
      </div>

      <Tabs defaultValue="trend">
        <TabsList>
          <TabsTrigger value="trend">Sales trend</TabsTrigger>
          <TabsTrigger value="products">Top products</TabsTrigger>
          <TabsTrigger value="table">Product table</TabsTrigger>
        </TabsList>

        <TabsContent value="trend" className="mt-4">
          <Card className="p-4">
            <div className="mb-3">
              <h2 className="font-semibold">Revenue over time</h2>
              <p className="text-xs text-muted-foreground">
                Gross sales per {bucketBy}
              </p>
            </div>
            <div className="h-80 w-full">
              {loading ? (
                <div className="h-full grid place-items-center text-muted-foreground text-sm">
                  Loading…
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={trend} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip
                      formatter={(v: number, name) =>
                        name === "sales" ? [inr(v), "Sales"] : [num(v as number, 0), "Bills"]
                      }
                    />
                    <Legend />
                    <Line
                      type="monotone"
                      dataKey="sales"
                      stroke="hsl(var(--primary))"
                      strokeWidth={2}
                      dot={false}
                      name="Sales"
                    />
                    <Line
                      type="monotone"
                      dataKey="bills"
                      stroke="hsl(var(--muted-foreground))"
                      strokeWidth={2}
                      dot={false}
                      name="Bills"
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="products" className="mt-4">
          <Card className="p-4">
            <div className="mb-3">
              <h2 className="font-semibold">Top 10 products by revenue</h2>
              <p className="text-xs text-muted-foreground">In the selected range</p>
            </div>
            <div className="h-96 w-full">
              {loading ? (
                <div className="h-full grid place-items-center text-muted-foreground text-sm">
                  Loading…
                </div>
              ) : topProducts.length === 0 ? (
                <div className="h-full grid place-items-center text-muted-foreground text-sm">
                  No sales in this period.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={topProducts}
                    layout="vertical"
                    margin={{ top: 10, right: 16, left: 16, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis type="number" tick={{ fontSize: 12 }} />
                    <YAxis
                      type="category"
                      dataKey="name"
                      width={120}
                      tick={{ fontSize: 12 }}
                    />
                    <Tooltip formatter={(v: number) => inr(v)} />
                    <Bar
                      dataKey="revenue"
                      fill="hsl(var(--primary))"
                      radius={[0, 4, 4, 0]}
                      name="Revenue"
                    />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="table" className="mt-4">
          <Card className="overflow-hidden">
            <div className="px-5 py-4 border-b">
              <h2 className="font-semibold">Per-product sales</h2>
              <p className="text-xs text-muted-foreground">
                Ranked by revenue in the selected range
              </p>
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
                        {totals.gross > 0
                          ? ((p.revenue / totals.gross) * 100).toFixed(1)
                          : "0.0"}
                        %
                      </td>
                    </tr>
                  ))}
                  {!byProduct.length && (
                    <tr>
                      <td colSpan={4} className="px-4 py-10 text-center text-muted-foreground">
                        {loading ? "Loading..." : "No sales in this period yet."}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Stat({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
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
