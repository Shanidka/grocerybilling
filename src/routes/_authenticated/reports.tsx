import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { inr } from "@/lib/format";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar, CartesianGrid,
  PieChart, Pie, Cell, Legend,
} from "recharts";
import { Receipt, Download, TrendingUp, TrendingDown, ArrowDownCircle, ArrowUpCircle, PiggyBank, Package, Trophy, Snowflake } from "lucide-react";
import { useMyRoles, canManage } from "@/hooks/use-role";

export const Route = createFileRoute("/_authenticated/reports")({
  ssr: false,
  component: ReportsPage,
  head: () => ({ meta: [{ title: "Reports — Bazaar POS" }] }),
});

type Preset = "today" | "yday" | "7d" | "30d" | "mtd" | "qtd" | "ytd" | "all" | "custom";

function rangeFor(preset: Preset, from?: string, to?: string) {
  const end = new Date(); end.setHours(23, 59, 59, 999);
  const start = new Date(); start.setHours(0, 0, 0, 0);
  if (preset === "yday") { start.setDate(start.getDate() - 1); end.setDate(end.getDate() - 1); end.setHours(23, 59, 59, 999); }
  else if (preset === "7d") start.setDate(start.getDate() - 6);
  else if (preset === "30d") start.setDate(start.getDate() - 29);
  else if (preset === "mtd") start.setDate(1);
  else if (preset === "qtd") { const q = Math.floor(start.getMonth() / 3) * 3; start.setMonth(q); start.setDate(1); }
  else if (preset === "ytd") { start.setMonth(0); start.setDate(1); }
  else if (preset === "all") { start.setFullYear(2000); }
  else if (preset === "custom" && from && to) {
    return { start: new Date(from + "T00:00:00"), end: new Date(to + "T23:59:59") };
  }
  return { start, end };
}

const PALETTE = ["#4f46e5", "#0ea5e9", "#10b981", "#f59e0b", "#ef4444", "#ec4899", "#8b5cf6", "#14b8a6", "#f97316", "#84cc16"];

function ReportsPage() {
  const { data: roles, isLoading: rolesLoading } = useMyRoles();
  if (!rolesLoading && !canManage(roles)) return <Navigate to="/dashboard" />;

  return (
    <div className="p-4 lg:p-6 space-y-6 max-w-7xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Reports</h1>
        <p className="text-sm text-muted-foreground">Sales, money movement, profitability and product performance.</p>
      </div>

      <Tabs defaultValue="sales">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="sales"><TrendingUp className="size-4" /> Sales</TabsTrigger>
          <TabsTrigger value="money-in"><ArrowDownCircle className="size-4" /> Money In</TabsTrigger>
          <TabsTrigger value="money-out"><ArrowUpCircle className="size-4" /> Money Out</TabsTrigger>
          <TabsTrigger value="profit"><PiggyBank className="size-4" /> Profit</TabsTrigger>
          <TabsTrigger value="products"><Package className="size-4" /> Products</TabsTrigger>
          <TabsTrigger value="top"><Trophy className="size-4" /> Top selling</TabsTrigger>
          <TabsTrigger value="slow"><Snowflake className="size-4" /> Slow moving</TabsTrigger>
        </TabsList>
        <TabsContent value="sales" className="mt-4"><SalesTab /></TabsContent>
        <TabsContent value="money-in" className="mt-4"><MoneyInTab /></TabsContent>
        <TabsContent value="money-out" className="mt-4"><MoneyOutTab /></TabsContent>
        <TabsContent value="profit" className="mt-4"><ProfitTab /></TabsContent>
        <TabsContent value="products" className="mt-4"><ProductProfitTab /></TabsContent>
        <TabsContent value="top" className="mt-4"><TopSellingTab /></TabsContent>
        <TabsContent value="slow" className="mt-4"><SlowMovingTab /></TabsContent>
      </Tabs>
    </div>
  );
}

/* ============ RANGE PICKER ============ */
function RangePicker({ preset, setPreset, from, setFrom, to, setTo }:
  { preset: Preset; setPreset: (p: Preset) => void; from: string; setFrom: (s: string) => void; to: string; setTo: (s: string) => void; }) {
  return (
    <Card className="p-3 flex flex-wrap items-center gap-2">
      {(["today", "yday", "7d", "30d", "mtd", "qtd", "ytd", "all"] as Preset[]).map((p) => (
        <Button key={p} size="sm" variant={preset === p ? "default" : "outline"} onClick={() => setPreset(p)}>
          {({ today: "Today", yday: "Yesterday", "7d": "7 days", "30d": "30 days", mtd: "Month", qtd: "Quarter", ytd: "Year", all: "Lifetime" } as Record<string, string>)[p]}
        </Button>
      ))}
      <div className="flex items-center gap-2 ml-2">
        <Input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPreset("custom"); }} className="w-40" />
        <span className="text-muted-foreground">→</span>
        <Input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPreset("custom"); }} className="w-40" />
      </div>
    </Card>
  );
}

function Kpi({ label, value, sub, tone, accent }: { label: string; value: string; sub?: string; tone?: "up" | "down"; accent?: boolean }) {
  return (
    <Card className={`relative p-4 overflow-hidden ${accent ? "bg-gradient-to-br from-primary/12 via-primary/5 to-transparent border-primary/30" : ""}`}>
      <div className={`absolute inset-x-0 top-0 h-0.5 ${accent ? "bg-primary" : "bg-border"}`} />
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`${accent ? "text-2xl" : "text-xl"} font-semibold mt-1 tabular-nums`}>{value}</div>
      {sub && (
        <div className={`text-[11px] mt-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 ${
          tone === "up" ? "bg-primary/10 text-primary" : tone === "down" ? "bg-destructive/10 text-destructive" : "text-muted-foreground"
        }`}>{sub}</div>
      )}
    </Card>
  );
}


/* ============ SALES ============ */
type SaleRow = { id: string; bill_no: string; grand_total: number | string; tax_total: number | string; line_discount: number | string; bill_discount: number | string; payment_mode: string; customer_name: string | null; customer_phone: string | null; created_at: string; sale_items: Array<{ qty: number | string; line_total: number | string; name: string; product_id: string | null; cost_at_sale?: number | string }> };

function useSales(start: Date, end: Date) {
  return useQuery({
    queryKey: ["reports-sales", start.toISOString(), end.toISOString()],
    queryFn: async (): Promise<SaleRow[]> => {
      const { data, error } = await supabase.from("sales")
        .select("id,bill_no,grand_total,tax_total,line_discount,bill_discount,payment_mode,customer_name,customer_phone,created_at,sale_items(qty,line_total,name,product_id,cost_at_sale)")
        .gte("created_at", start.toISOString()).lte("created_at", end.toISOString())
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as SaleRow[];
    },
  });
}

function SalesTab() {
  const [preset, setPreset] = useState<Preset>("7d");
  const [from, setFrom] = useState(""); const [to, setTo] = useState("");
  const { start, end } = rangeFor(preset, from, to);
  const sales = useSales(start, end);

  // Previous period
  const spanMs = end.getTime() - start.getTime();
  const prevStart = new Date(start.getTime() - spanMs - 1);
  const prevEnd = new Date(start.getTime() - 1);
  const prev = useSales(prevStart, prevEnd);

  const bills = sales.data ?? [];
  const stats = useMemo(() => {
    const gross = bills.reduce((s, r) => s + Number(r.grand_total), 0);
    const totals = bills.map((r) => Number(r.grand_total)).sort((a, b) => a - b);
    return {
      gross,
      count: bills.length,
      avg: bills.length ? gross / bills.length : 0,
      high: totals.length ? totals[totals.length - 1] : 0,
      low: totals.length ? totals[0] : 0,
    };
  }, [bills]);
  const prevGross = (prev.data ?? []).reduce((s, r) => s + Number(r.grand_total), 0);
  const growth = prevGross > 0 ? ((stats.gross - prevGross) / prevGross) * 100 : 0;

  const trend = useMemo(() => {
    const days = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / 86400000));
    const monthly = days > 90;
    const map = new Map<string, number>();
    for (const r of bills) {
      const d = new Date(r.created_at);
      const key = monthly ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}` : d.toISOString().slice(0, 10);
      map.set(key, (map.get(key) ?? 0) + Number(r.grand_total));
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([date, total]) => ({ date, total: Math.round(total) }));
  }, [bills, start, end]);

  const hourly = useMemo(() => {
    const arr = Array.from({ length: 24 }, (_, h) => ({ hour: `${h}:00`, total: 0 }));
    for (const r of bills) arr[new Date(r.created_at).getHours()].total += Number(r.grand_total);
    return arr;
  }, [bills]);

  const byPayment = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of bills) map.set(r.payment_mode, (map.get(r.payment_mode) ?? 0) + Number(r.grand_total));
    return Array.from(map.entries()).map(([name, value]) => ({ name, value: Math.round(value) }));
  }, [bills]);

  const growthLabel = prevGross > 0 ? `${growth >= 0 ? "▲" : "▼"} ${Math.abs(growth).toFixed(1)}% vs previous` : "no prior period";
  const growthTone: "up" | "down" | undefined = prevGross > 0 ? (growth >= 0 ? "up" : "down") : undefined;

  return (
    <div className="space-y-4">
      <RangePicker preset={preset} setPreset={setPreset} from={from} setFrom={setFrom} to={to} setTo={setTo} />

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <Kpi accent label="Gross sales" value={inr(stats.gross)} sub={growthLabel} tone={growthTone} />
        <Kpi label="Bills" value={String(stats.count)} />
        <Kpi label="Avg bill" value={inr(stats.avg)} />
        <Kpi label="Highest bill" value={inr(stats.high)} />
        <Kpi label="Lowest bill" value={inr(stats.low)} />
        <Kpi label="Previous period" value={inr(prevGross)} />
      </div>


      <Card className="p-5">
        <h3 className="font-semibold mb-3">Sales trend</h3>
        <div className="h-64">
          {trend.length === 0 ? <Empty /> : (
            <ResponsiveContainer>
              <LineChart data={trend}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v: number) => inr(v)} />
                <Line type="monotone" dataKey="total" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </Card>

      <div className="grid lg:grid-cols-2 gap-4">
        <Card className="p-5">
          <h3 className="font-semibold mb-3">Hourly sales (in range)</h3>
          <div className="h-56">
            <ResponsiveContainer>
              <BarChart data={hourly}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis dataKey="hour" tick={{ fontSize: 10 }} interval={2} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v: number) => inr(v)} />
                <Bar dataKey="total" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card className="p-5">
          <h3 className="font-semibold mb-3">Sales by payment mode</h3>
          <div className="h-56">
            {byPayment.length === 0 ? <Empty /> : (
              <ResponsiveContainer>
                <PieChart>
                  <Pie data={byPayment} dataKey="value" nameKey="name" outerRadius={80} innerRadius={40}>
                    {byPayment.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v: number) => inr(v)} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>
      </div>

      <Card className="p-0 overflow-hidden">
        <div className="flex items-center justify-between gap-2 p-3 border-b flex-wrap">
          <div className="font-semibold text-sm">Bills ({bills.length})</div>
          <div className="flex items-center gap-2">
            <GstExport />
            <Button size="sm" variant="outline" onClick={() => exportGSTCSV(bills, start, end)}>
              <Download className="size-4" /> Export current range
            </Button>
          </div>
        </div>

        {bills.length === 0 ? <Empty /> : (
          <div className="overflow-x-auto max-h-96">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left sticky top-0"><tr>
                <th className="px-4 py-2.5">Bill #</th>
                <th className="px-4 py-2.5">Date</th>
                <th className="px-4 py-2.5">Customer</th>
                <th className="px-4 py-2.5">Mode</th>
                <th className="px-4 py-2.5 text-right">Total</th>
                <th className="px-4 py-2.5"></th>
              </tr></thead>
              <tbody className="divide-y">{bills.map((b) => (
                <tr key={b.id}>
                  <td className="px-4 py-3 font-mono text-xs">{b.bill_no}</td>
                  <td className="px-4 py-3">{new Date(b.created_at).toLocaleString("en-IN")}</td>
                  <td className="px-4 py-3">{b.customer_name ?? "—"}{b.customer_phone ? ` · ${b.customer_phone}` : ""}</td>
                  <td className="px-4 py-3 capitalize">{b.payment_mode}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{inr(b.grand_total)}</td>
                  <td className="px-4 py-3 text-right"><Button asChild size="sm" variant="ghost"><Link to="/i/$billNo" params={{ billNo: b.bill_no }} target="_blank"><Receipt className="size-3.5" /></Link></Button></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

/* ============ MONEY IN ============ */
function MoneyInTab() {
  const [preset, setPreset] = useState<Preset>("30d");
  const [from, setFrom] = useState(""); const [to, setTo] = useState("");
  const { start, end } = rangeFor(preset, from, to);
  const sales = useSales(start, end);
  const bills = sales.data ?? [];

  const byMode = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of bills) map.set(r.payment_mode, (map.get(r.payment_mode) ?? 0) + Number(r.grand_total));
    return Array.from(map.entries()).map(([name, value]) => ({ name, value: Math.round(value) })).sort((a, b) => b.value - a.value);
  }, [bills]);
  const total = byMode.reduce((s, r) => s + r.value, 0);

  const daily = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of bills) {
      const k = new Date(r.created_at).toISOString().slice(0, 10);
      map.set(k, (map.get(k) ?? 0) + Number(r.grand_total));
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([date, total]) => ({ date, total: Math.round(total) }));
  }, [bills]);

  return (
    <div className="space-y-4">
      <RangePicker preset={preset} setPreset={setPreset} from={from} setFrom={setFrom} to={to} setTo={setTo} />
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Kpi label="Total Money In" value={inr(total)} />
        {byMode.slice(0, 3).map((m) => <Kpi key={m.name} label={m.name.toUpperCase()} value={inr(m.value)} sub={`${((m.value / (total || 1)) * 100).toFixed(1)}%`} />)}
      </div>
      <div className="grid lg:grid-cols-2 gap-4">
        <Card className="p-5">
          <h3 className="font-semibold mb-3">Payment mode split</h3>
          <div className="h-64">
            {byMode.length === 0 ? <Empty /> : (
              <ResponsiveContainer>
                <PieChart>
                  <Pie data={byMode} dataKey="value" nameKey="name" innerRadius={45} outerRadius={95}>
                    {byMode.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v: number) => inr(v)} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>
        <Card className="p-5">
          <h3 className="font-semibold mb-3">Collection trend</h3>
          <div className="h-64">
            {daily.length === 0 ? <Empty /> : (
              <ResponsiveContainer>
                <BarChart data={daily}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v: number) => inr(v)} />
                  <Bar dataKey="total" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}

/* ============ MONEY OUT ============ */
function MoneyOutTab() {
  const [preset, setPreset] = useState<Preset>("30d");
  const [from, setFrom] = useState(""); const [to, setTo] = useState("");
  const { start, end } = rangeFor(preset, from, to);

  const expenses = useQuery({
    queryKey: ["reports-exp", start.toISOString(), end.toISOString()],
    queryFn: async () => {
      const { data, error } = await supabase.from("expenses")
        .select("category,amount,spent_on")
        .gte("spent_on", start.toISOString().slice(0, 10))
        .lte("spent_on", end.toISOString().slice(0, 10));
      if (error) throw error;
      return data ?? [];
    },
  });
  const purchases = useQuery({
    queryKey: ["reports-pur", start.toISOString(), end.toISOString()],
    queryFn: async () => {
      const { data, error } = await supabase.from("purchase_entries")
        .select("total,created_at")
        .gte("created_at", start.toISOString()).lte("created_at", end.toISOString());
      if (error) throw error;
      return data ?? [];
    },
  });
  const damages = useQuery({
    queryKey: ["reports-dam", start.toISOString(), end.toISOString()],
    queryFn: async () => {
      const { data, error } = await supabase.from("damaged_products")
        .select("loss_value,created_at").gte("created_at", start.toISOString()).lte("created_at", end.toISOString());
      if (error) throw error;
      return data ?? [];
    },
  });

  const expTotal = (expenses.data ?? []).reduce((s, r) => s + Number(r.amount), 0);
  const purTotal = (purchases.data ?? []).reduce((s, r) => s + Number(r.total), 0);
  const damTotal = (damages.data ?? []).reduce((s, r) => s + Number(r.loss_value ?? 0), 0);
  const total = expTotal + purTotal + damTotal;

  const byCat = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of expenses.data ?? []) map.set(r.category, (map.get(r.category) ?? 0) + Number(r.amount));
    if (purTotal > 0) map.set("Purchases", purTotal);
    if (damTotal > 0) map.set("Damages", damTotal);
    return Array.from(map.entries()).map(([name, value]) => ({ name, value: Math.round(value) })).sort((a, b) => b.value - a.value);
  }, [expenses.data, purTotal, damTotal]);

  return (
    <div className="space-y-4">
      <RangePicker preset={preset} setPreset={setPreset} from={from} setFrom={setFrom} to={to} setTo={setTo} />
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Kpi label="Total Money Out" value={inr(total)} />
        <Kpi label="Expenses" value={inr(expTotal)} />
        <Kpi label="Purchases" value={inr(purTotal)} />
        <Kpi label="Damages / loss" value={inr(damTotal)} />
      </div>
      <Card className="p-5">
        <h3 className="font-semibold mb-3">Expense breakdown</h3>
        <div className="h-72">
          {byCat.length === 0 ? <Empty /> : (
            <ResponsiveContainer>
              <PieChart>
                <Pie data={byCat} dataKey="value" nameKey="name" outerRadius={100} innerRadius={50}>
                  {byCat.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
                </Pie>
                <Tooltip formatter={(v: number) => inr(v)} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </Card>
    </div>
  );
}

/* ============ PROFIT ============ */
function ProfitTab() {
  const [preset, setPreset] = useState<Preset>("30d");
  const [from, setFrom] = useState(""); const [to, setTo] = useState("");
  const { start, end } = rangeFor(preset, from, to);
  const sales = useSales(start, end);
  const bills = sales.data ?? [];

  const products = useQuery({
    queryKey: ["reports-product-costs"],
    queryFn: async () => {
      const { data, error } = await supabase.from("products").select("id,purchase_price");
      if (error) throw error;
      return new Map((data ?? []).map((p) => [p.id, Number(p.purchase_price)]));
    },
  });

  const expenses = useQuery({
    queryKey: ["reports-exp-p", start.toISOString(), end.toISOString()],
    queryFn: async () => {
      const { data, error } = await supabase.from("expenses").select("amount")
        .gte("spent_on", start.toISOString().slice(0, 10))
        .lte("spent_on", end.toISOString().slice(0, 10));
      if (error) throw error;
      return (data ?? []).reduce((s, r) => s + Number(r.amount), 0);
    },
  });

  const returns = useQuery({
    queryKey: ["reports-ret", start.toISOString(), end.toISOString()],
    queryFn: async () => {
      const { data, error } = await supabase.from("product_returns").select("refund_amount,created_at")
        .gte("created_at", start.toISOString()).lte("created_at", end.toISOString());
      if (error) throw error;
      return (data ?? []).reduce((s, r) => s + Number(r.refund_amount ?? 0), 0);
    },
  });

  const purchaseCost = useMemo(() => {
    let cost = 0;
    for (const s of bills) for (const it of s.sale_items) {
      const c = Number(it.cost_at_sale ?? 0) || (it.product_id ? Number(products.data?.get(it.product_id) ?? 0) : 0);
      cost += c * Number(it.qty);
    }
    return cost;
  }, [bills, products.data]);

  const gross = bills.reduce((s, r) => s + Number(r.grand_total), 0);
  const discounts = bills.reduce((s, r) => s + Number(r.line_discount) + Number(r.bill_discount), 0);
  const exp = expenses.data ?? 0;
  const ret = returns.data ?? 0;
  const netProfit = gross - purchaseCost - exp - ret;
  const grossMargin = gross > 0 ? ((gross - purchaseCost) / gross) * 100 : 0;
  const netMargin = gross > 0 ? (netProfit / gross) * 100 : 0;

  return (
    <div className="space-y-4">
      <RangePicker preset={preset} setPreset={setPreset} from={from} setFrom={setFrom} to={to} setTo={setTo} />
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Kpi label="Gross sales" value={inr(gross)} />
        <Kpi label="Discounts" value={`− ${inr(discounts)}`} />
        <Kpi label="Refunds/returns" value={`− ${inr(ret)}`} />
        <Kpi label="Cost of goods" value={`− ${inr(purchaseCost)}`} />
        <Kpi label="Expenses" value={`− ${inr(exp)}`} />
        <Kpi label="Net profit" value={inr(netProfit)} tone={netProfit >= 0 ? "up" : "down"} />
        <Kpi label="Gross margin" value={`${grossMargin.toFixed(1)}%`} />
        <Kpi label="Net margin" value={`${netMargin.toFixed(1)}%`} tone={netMargin >= 0 ? "up" : "down"} />
      </div>
      <Card className="p-4 text-xs text-muted-foreground">
        Cost of goods uses each product's current purchase price (or the historical cost when captured at billing time).
      </Card>
    </div>
  );
}

/* ============ PRODUCT PROFIT ============ */
function ProductProfitTab() {
  const [preset, setPreset] = useState<Preset>("30d");
  const [from, setFrom] = useState(""); const [to, setTo] = useState("");
  const [sortKey, setSortKey] = useState<"profit" | "profit_asc" | "revenue" | "qty" | "qty_asc">("profit");
  const { start, end } = rangeFor(preset, from, to);
  const sales = useSales(start, end);
  const products = useQuery({
    queryKey: ["reports-products-full"],
    queryFn: async () => {
      const { data, error } = await supabase.from("products").select("id,name,purchase_price,selling_price,mrp,stock_qty,unit,brand");
      if (error) throw error;
      return data ?? [];
    },
  });

  const rows = useMemo(() => {
    const productMap = new Map((products.data ?? []).map((p) => [p.id, p]));
    const acc = new Map<string, { id: string; name: string; qty: number; revenue: number; cost: number; }>();
    for (const s of sales.data ?? []) for (const it of s.sale_items) {
      const key = it.product_id ?? it.name;
      const cur = acc.get(key) ?? { id: it.product_id ?? "", name: it.name, qty: 0, revenue: 0, cost: 0 };
      const c = Number(it.cost_at_sale ?? 0) || (it.product_id ? Number(productMap.get(it.product_id)?.purchase_price ?? 0) : 0);
      cur.qty += Number(it.qty);
      cur.revenue += Number(it.line_total);
      cur.cost += c * Number(it.qty);
      acc.set(key, cur);
    }
    const list = Array.from(acc.values()).map((r) => {
      const p = productMap.get(r.id);
      const profit = r.revenue - r.cost;
      return {
        ...r,
        selling_price: p ? Number(p.selling_price) : 0,
        purchase_price: p ? Number(p.purchase_price) : 0,
        stock: p ? Number(p.stock_qty) : 0,
        profit,
        profitPct: r.revenue > 0 ? (profit / r.revenue) * 100 : 0,
      };
    });
    const sorted = list.sort((a, b) => {
      if (sortKey === "profit") return b.profit - a.profit;
      if (sortKey === "profit_asc") return a.profit - b.profit;
      if (sortKey === "revenue") return b.revenue - a.revenue;
      if (sortKey === "qty") return b.qty - a.qty;
      return a.qty - b.qty;
    });
    return sorted;
  }, [sales.data, products.data, sortKey]);

  return (
    <div className="space-y-4">
      <RangePicker preset={preset} setPreset={setPreset} from={from} setFrom={setFrom} to={to} setTo={setTo} />
      <div className="flex items-center gap-2 flex-wrap">
        <Select value={sortKey} onValueChange={(v) => setSortKey(v as typeof sortKey)}>
          <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="profit">Highest profit</SelectItem>
            <SelectItem value="profit_asc">Lowest profit</SelectItem>
            <SelectItem value="revenue">Highest revenue</SelectItem>
            <SelectItem value="qty">Most sold</SelectItem>
            <SelectItem value="qty_asc">Least sold</SelectItem>
          </SelectContent>
        </Select>
        <div className="text-xs text-muted-foreground ml-auto">{rows.length} product(s)</div>
      </div>
      <Card className="p-0 overflow-hidden">
        {rows.length === 0 ? <Empty /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left"><tr>
                <th className="px-4 py-2.5">Product</th>
                <th className="px-4 py-2.5">Sell ₹</th>
                <th className="px-4 py-2.5">Cost ₹</th>
                <th className="px-4 py-2.5">Qty</th>
                <th className="px-4 py-2.5 text-right">Revenue</th>
                <th className="px-4 py-2.5 text-right">Profit</th>
                <th className="px-4 py-2.5 text-right">%</th>
                <th className="px-4 py-2.5">Stock</th>
              </tr></thead>
              <tbody className="divide-y">{rows.map((r) => (
                <tr key={r.id || r.name}>
                  <td className="px-4 py-3">{r.name}</td>
                  <td className="px-4 py-3 tabular-nums">{r.selling_price.toFixed(2)}</td>
                  <td className="px-4 py-3 tabular-nums">{r.purchase_price.toFixed(2)}</td>
                  <td className="px-4 py-3">{r.qty.toFixed(2)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{inr(r.revenue)}</td>
                  <td className={`px-4 py-3 text-right tabular-nums ${r.profit >= 0 ? "text-primary" : "text-destructive"}`}>{inr(r.profit)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{r.profitPct.toFixed(1)}%</td>
                  <td className="px-4 py-3">{r.stock}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

/* ============ TOP SELLING ============ */
function TopSellingTab() {
  const [preset, setPreset] = useState<Preset>("30d");
  const [from, setFrom] = useState(""); const [to, setTo] = useState("");
  const [limit, setLimit] = useState("10");
  const { start, end } = rangeFor(preset, from, to);
  const sales = useSales(start, end);

  const rows = useMemo(() => {
    const acc = new Map<string, { name: string; qty: number; revenue: number }>();
    for (const s of sales.data ?? []) for (const it of s.sale_items) {
      const cur = acc.get(it.name) ?? { name: it.name, qty: 0, revenue: 0 };
      cur.qty += Number(it.qty);
      cur.revenue += Number(it.line_total);
      acc.set(it.name, cur);
    }
    return Array.from(acc.values()).sort((a, b) => b.qty - a.qty).slice(0, Number(limit));
  }, [sales.data, limit]);

  return (
    <div className="space-y-4">
      <RangePicker preset={preset} setPreset={setPreset} from={from} setFrom={setFrom} to={to} setTo={setTo} />
      <div className="flex items-center gap-2">
        <Select value={limit} onValueChange={setLimit}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="10">Top 10</SelectItem>
            <SelectItem value="25">Top 25</SelectItem>
            <SelectItem value="50">Top 50</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <Card className="p-5">
        <div className="h-72">
          {rows.length === 0 ? <Empty /> : (
            <ResponsiveContainer>
              <BarChart data={rows}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} angle={-30} textAnchor="end" height={80} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v: number, k) => k === "revenue" ? inr(v) : v.toString()} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="qty" fill="hsl(var(--primary))" name="Qty sold" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </Card>
      <Card className="p-0 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left"><tr><th className="px-4 py-2.5">#</th><th className="px-4 py-2.5">Product</th><th className="px-4 py-2.5">Qty</th><th className="px-4 py-2.5 text-right">Revenue</th></tr></thead>
          <tbody className="divide-y">{rows.map((r, i) => (
            <tr key={r.name}>
              <td className="px-4 py-3 text-muted-foreground">{i + 1}</td>
              <td className="px-4 py-3">{r.name}</td>
              <td className="px-4 py-3">{r.qty.toFixed(2)}</td>
              <td className="px-4 py-3 text-right tabular-nums">{inr(r.revenue)}</td>
            </tr>
          ))}</tbody>
        </table>
      </Card>
    </div>
  );
}

/* ============ SLOW MOVING ============ */
function SlowMovingTab() {
  const [days, setDays] = useState("30");
  const q = useQuery({
    queryKey: ["reports-slow", days],
    queryFn: async () => {
      const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - Number(days));
      const { data, error } = await supabase.from("products")
        .select("id,name,brand,unit,stock_qty,purchase_price,last_sold_at,updated_at")
        .eq("is_active", true).gt("stock_qty", 0);
      if (error) throw error;
      return (data ?? []).filter((p) => !p.last_sold_at || new Date(p.last_sold_at) < cutoff)
        .sort((a, b) => Number(b.stock_qty) * Number(b.purchase_price) - Number(a.stock_qty) * Number(a.purchase_price));
    },
  });
  const stockValue = (q.data ?? []).reduce((s, p) => s + Number(p.stock_qty) * Number(p.purchase_price), 0);

  return (
    <div className="space-y-4">
      <Card className="p-3 flex flex-wrap items-center gap-2">
        <span className="text-sm text-muted-foreground">Not sold in the last</span>
        <Select value={days} onValueChange={setDays}>
          <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="7">7 days</SelectItem>
            <SelectItem value="15">15 days</SelectItem>
            <SelectItem value="30">30 days</SelectItem>
            <SelectItem value="60">60 days</SelectItem>
            <SelectItem value="90">90 days</SelectItem>
          </SelectContent>
        </Select>
        <div className="ml-auto text-sm">
          <span className="text-muted-foreground">Blocked stock value:</span>{" "}
          <span className="font-semibold">{inr(stockValue)}</span>
        </div>
      </Card>
      <Card className="p-0 overflow-hidden">
        {!q.data?.length ? <Empty /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left"><tr>
                <th className="px-4 py-2.5">Product</th>
                <th className="px-4 py-2.5">Company</th>
                <th className="px-4 py-2.5">Stock</th>
                <th className="px-4 py-2.5">Last sold</th>
                <th className="px-4 py-2.5 text-right">Stock value</th>
              </tr></thead>
              <tbody className="divide-y">{q.data.map((p) => (
                <tr key={p.id}>
                  <td className="px-4 py-3">{p.name}</td>
                  <td className="px-4 py-3 text-muted-foreground">{p.brand ?? "—"}</td>
                  <td className="px-4 py-3">{Number(p.stock_qty)} {p.unit}</td>
                  <td className="px-4 py-3 text-muted-foreground">{p.last_sold_at ? new Date(p.last_sold_at).toLocaleDateString("en-IN") : "Never"}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{inr(Number(p.stock_qty) * Number(p.purchase_price))}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

function Empty() { return <div className="grid place-items-center h-full p-8 text-sm text-muted-foreground">No data in this range.</div>; }

/* GST filing export — month / quarter / year */
function gstPeriodRange(kind: "month" | "quarter" | "year", value: string) {
  if (kind === "month") {
    const [y, m] = value.split("-").map(Number);
    return { start: new Date(y, m - 1, 1, 0, 0, 0), end: new Date(y, m, 0, 23, 59, 59) };
  }
  if (kind === "quarter") {
    const [y, q] = value.split("-Q").map(Number);
    const sm = (q - 1) * 3;
    return { start: new Date(y, sm, 1, 0, 0, 0), end: new Date(y, sm + 3, 0, 23, 59, 59) };
  }
  const y = Number(value);
  return { start: new Date(y, 0, 1, 0, 0, 0), end: new Date(y, 11, 31, 23, 59, 59) };
}

function GstExport() {
  const now = new Date();
  const [kind, setKind] = useState<"month" | "quarter" | "year">("month");
  const [value, setValue] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`);
  const [busy, setBusy] = useState(false);

  const options = useMemo(() => {
    const out: string[] = [];
    if (kind === "month") {
      for (let i = 0; i < 18; i++) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
      }
    } else if (kind === "quarter") {
      for (let i = 0; i < 8; i++) {
        const d = new Date(now.getFullYear(), now.getMonth() - i * 3, 1);
        out.push(`${d.getFullYear()}-Q${Math.floor(d.getMonth() / 3) + 1}`);
      }
    } else {
      for (let i = 0; i < 5; i++) out.push(String(now.getFullYear() - i));
    }
    return Array.from(new Set(out));
  }, [kind, now]);

  const run = async () => {
    setBusy(true);
    try {
      const { start, end } = gstPeriodRange(kind, value);
      const { data, error } = await supabase.from("sales")
        .select("id,bill_no,grand_total,tax_total,line_discount,bill_discount,payment_mode,customer_name,customer_phone,created_at,sale_items(qty,line_total,name,product_id,cost_at_sale)")
        .gte("created_at", start.toISOString()).lte("created_at", end.toISOString())
        .order("created_at");
      if (error) throw error;
      exportGSTCSV((data ?? []) as unknown as SaleRow[], start, end);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <Select value={kind} onValueChange={(v) => {
        const k = v as "month" | "quarter" | "year";
        setKind(k);
        setValue(k === "month" ? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
          : k === "quarter" ? `${now.getFullYear()}-Q${Math.floor(now.getMonth() / 3) + 1}`
          : String(now.getFullYear()));
      }}>
        <SelectTrigger className="h-8 w-28 text-xs"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="month">Monthly</SelectItem>
          <SelectItem value="quarter">Quarterly</SelectItem>
          <SelectItem value="year">Yearly</SelectItem>
        </SelectContent>
      </Select>
      <Select value={value} onValueChange={setValue}>
        <SelectTrigger className="h-8 w-32 text-xs"><SelectValue /></SelectTrigger>
        <SelectContent>{options.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
      </Select>
      <Button size="sm" variant="secondary" onClick={run} disabled={busy}>
        <Download className="size-4" /> {busy ? "Preparing…" : "GST CSV"}
      </Button>
    </div>
  );
}



/* CSV export */
function exportGSTCSV(bills: SaleRow[], start: Date, end: Date) {
  const header = ["Bill No", "Date", "Customer", "Phone", "Payment", "Discount", "Taxable", "GST", "Total"];
  const rows = bills.map((b) => {
    const total = Number(b.grand_total);
    const gst = Number(b.tax_total);
    const disc = Number(b.line_discount) + Number(b.bill_discount);
    return [b.bill_no, new Date(b.created_at).toISOString().slice(0, 10), b.customer_name ?? "", b.customer_phone ?? "", b.payment_mode, disc.toFixed(2), (total - gst).toFixed(2), gst.toFixed(2), total.toFixed(2)];
  });
  const tGst = bills.reduce((s, b) => s + Number(b.tax_total), 0);
  const tTax = bills.reduce((s, b) => s + Number(b.grand_total) - Number(b.tax_total), 0);
  const tTot = bills.reduce((s, b) => s + Number(b.grand_total), 0);
  rows.push([]);
  rows.push(["TOTAL", "", "", "", "", "", tTax.toFixed(2), tGst.toFixed(2), tTot.toFixed(2)]);
  const csv = [header, ...rows].map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `GST-${start.toISOString().slice(0, 10)}_to_${end.toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
