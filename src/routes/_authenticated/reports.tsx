import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { inr } from "@/lib/format";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar, CartesianGrid } from "recharts";
import { Receipt, Download } from "lucide-react";
import { useMyRoles, canManage } from "@/hooks/use-role";

export const Route = createFileRoute("/_authenticated/reports")({
  ssr: false,
  component: ReportsPage,
  head: () => ({ meta: [{ title: "Reports — Bazaar POS" }] }),
});

type Preset = "today" | "7d" | "30d" | "mtd" | "ytd" | "custom";

function rangeFor(preset: Preset, from?: string, to?: string) {
  const end = new Date(); end.setHours(23, 59, 59, 999);
  const start = new Date(); start.setHours(0, 0, 0, 0);
  if (preset === "7d") start.setDate(start.getDate() - 6);
  else if (preset === "30d") start.setDate(start.getDate() - 29);
  else if (preset === "mtd") start.setDate(1);
  else if (preset === "ytd") { start.setMonth(0); start.setDate(1); }
  else if (preset === "custom" && from && to) {
    return { start: new Date(from + "T00:00:00"), end: new Date(to + "T23:59:59") };
  }
  return { start, end };
}

function ReportsPage() {
  const { data: roles, isLoading: rolesLoading } = useMyRoles();
  const [preset, setPreset] = useState<Preset>("7d");
  const [from, setFrom] = useState(""); const [to, setTo] = useState("");
  const { start, end } = rangeFor(preset, from, to);

  if (!rolesLoading && !canManage(roles)) {
    return <Navigate to="/dashboard" />;
  }

  const sales = useQuery({
    queryKey: ["reports-sales", preset, from, to],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales")
        .select("id,bill_no,grand_total,tax_total,line_discount,bill_discount,payment_mode,customer_name,customer_phone,created_at,sale_items(qty,line_total,name,product_id)")
        .gte("created_at", start.toISOString())
        .lte("created_at", end.toISOString())
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const stats = useMemo(() => {
    const rows = sales.data ?? [];
    const gross = rows.reduce((s, r) => s + Number(r.grand_total), 0);
    const gst = rows.reduce((s, r) => s + Number(r.tax_total), 0);
    const disc = rows.reduce((s, r) => s + Number(r.line_discount) + Number(r.bill_discount), 0);
    return { gross, gst, disc, count: rows.length };
  }, [sales.data]);

  const trend = useMemo(() => {
    const rows = sales.data ?? [];
    const days = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / 86400000));
    const monthly = days > 90;
    const map = new Map<string, number>();
    for (const r of rows) {
      const d = new Date(r.created_at);
      const key = monthly
        ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
        : d.toISOString().slice(0, 10);
      map.set(key, (map.get(key) ?? 0) + Number(r.grand_total));
    }
    return Array.from(map.entries()).map(([k, v]) => ({ date: k, total: Math.round(v) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sales.data]);

  const perProduct = useMemo(() => {
    const map = new Map<string, { name: string; qty: number; revenue: number }>();
    for (const s of sales.data ?? []) {
      for (const it of (s.sale_items ?? []) as Array<{ name: string; qty: number | string; line_total: number | string; product_id: string | null }>) {
        const key = it.product_id ?? it.name;
        const cur = map.get(key) ?? { name: it.name, qty: 0, revenue: 0 };
        cur.qty += Number(it.qty);
        cur.revenue += Number(it.line_total);
        map.set(key, cur);
      }
    }
    return Array.from(map.values()).sort((a, b) => b.revenue - a.revenue);
  }, [sales.data]);

  const totalRev = perProduct.reduce((s, p) => s + p.revenue, 0) || 1;
  const bills = sales.data ?? [];

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-6xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Reports</h1>
        <p className="text-sm text-muted-foreground">Bills auto-delete after 18 months. Filter by date range.</p>
      </div>

      <Card className="p-4 flex flex-wrap items-center gap-2">
        {(["today", "7d", "30d", "mtd", "ytd"] as Preset[]).map((p) => (
          <Button key={p} size="sm" variant={preset === p ? "default" : "outline"} onClick={() => setPreset(p)}>
            {p === "today" ? "Today" : p === "7d" ? "7 days" : p === "30d" ? "30 days" : p === "mtd" ? "This month" : "This year"}
          </Button>
        ))}
        <div className="flex items-center gap-2 ml-2">
          <Input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPreset("custom"); }} className="w-40" />
          <span className="text-muted-foreground">→</span>
          <Input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPreset("custom"); }} className="w-40" />
        </div>
      </Card>

      <Tabs defaultValue="summary">
        <TabsList>
          <TabsTrigger value="summary">Summary</TabsTrigger>
          <TabsTrigger value="bills">Bills ({bills.length})</TabsTrigger>
          <TabsTrigger value="products">Per product</TabsTrigger>
        </TabsList>

        <TabsContent value="summary" className="space-y-6">
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Kpi label="Gross sales" value={inr(stats.gross)} />
            <Kpi label="Bills" value={String(stats.count)} />
            <Kpi label="GST collected" value={inr(stats.gst)} />
            <Kpi label="Discounts" value={inr(stats.disc)} />
          </div>

          <Card className="p-5">
            <h3 className="font-semibold mb-3">Sales trend</h3>
            <div className="h-72">
              <ResponsiveContainer>
                <LineChart data={trend}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v: number) => inr(v)} />
                  <Line type="monotone" dataKey="total" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <Card className="p-5">
            <h3 className="font-semibold mb-3">Top 10 products</h3>
            <div className="h-72">
              <ResponsiveContainer>
                <BarChart data={perProduct.slice(0, 10)}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={-20} textAnchor="end" height={70} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v: number) => inr(v)} />
                  <Bar dataKey="revenue" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="bills">
          <Card className="p-0 overflow-hidden">
            {bills.length === 0 ? (
              <div className="p-8 text-center text-sm text-muted-foreground">No bills in this range.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-left">
                    <tr>
                      <th className="px-4 py-2.5 font-medium text-muted-foreground">Bill #</th>
                      <th className="px-4 py-2.5 font-medium text-muted-foreground">Date</th>
                      <th className="px-4 py-2.5 font-medium text-muted-foreground">Customer</th>
                      <th className="px-4 py-2.5 font-medium text-muted-foreground">Items</th>
                      <th className="px-4 py-2.5 font-medium text-muted-foreground">Payment</th>
                      <th className="px-4 py-2.5 font-medium text-muted-foreground text-right">Total</th>
                      <th className="px-4 py-2.5"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {bills.map((b) => (
                      <tr key={b.id}>
                        <td className="px-4 py-3 font-mono text-xs">{b.bill_no}</td>
                        <td className="px-4 py-3">{new Date(b.created_at).toLocaleString("en-IN")}</td>
                        <td className="px-4 py-3">{b.customer_name ?? "—"}{b.customer_phone ? ` · ${b.customer_phone}` : ""}</td>
                        <td className="px-4 py-3">{(b.sale_items as unknown[])?.length ?? 0}</td>
                        <td className="px-4 py-3 capitalize">{b.payment_mode}</td>
                        <td className="px-4 py-3 text-right tabular-nums font-medium">{inr(b.grand_total)}</td>
                        <td className="px-4 py-3 text-right">
                          <Button asChild size="sm" variant="ghost">
                            <Link to="/i/$billNo" params={{ billNo: b.bill_no }} target="_blank"><Receipt className="size-3.5" /> View</Link>
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </TabsContent>

        <TabsContent value="products">
          <Card className="p-0 overflow-hidden">
            <div className="p-4 font-semibold border-b">Per-product sales</div>
            {perProduct.length === 0 ? (
              <div className="p-8 text-center text-sm text-muted-foreground">No sales in this range.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-left">
                    <tr>
                      <th className="px-4 py-2.5 font-medium text-muted-foreground">Product</th>
                      <th className="px-4 py-2.5 font-medium text-muted-foreground">Qty sold</th>
                      <th className="px-4 py-2.5 font-medium text-muted-foreground">Revenue</th>
                      <th className="px-4 py-2.5 font-medium text-muted-foreground">% of total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {perProduct.map((p) => (
                      <tr key={p.name}>
                        <td className="px-4 py-3">{p.name}</td>
                        <td className="px-4 py-3">{p.qty.toFixed(2)}</td>
                        <td className="px-4 py-3">{inr(p.revenue)}</td>
                        <td className="px-4 py-3">{((p.revenue / totalRev) * 100).toFixed(1)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <Card className="p-5">
      <div className="text-2xl font-semibold tracking-tight">{value}</div>
      <div className="text-sm text-muted-foreground">{label}</div>
    </Card>
  );
}
