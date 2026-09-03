import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useStoreId } from "@/lib/active-store";
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
import {
  Receipt, Download, TrendingUp, PiggyBank, Package, Trophy, Snowflake, Users, CreditCard,
  Percent, Undo2, Wallet, ShoppingCart, Boxes, AlertTriangle, UserRound, Printer,
} from "lucide-react";
import { useMyRoles, canManage } from "@/hooks/use-role";
import {
  type Preset, type Range, type Sale, type SaleItem, type Prod, type Summary,
  PRESET_LABELS, rangeFor, previousRange, pct, summarize, makeCostOf, getCostingMethod, setCostingMethod,
  useSales, useProducts, useExpenses, useReturns, usePurchases, useDamages, useStaffNames,
  PALETTE, downloadCSV, ymd,
} from "@/lib/analytics";

export const Route = createFileRoute("/_authenticated/reports")({
  ssr: false,
  component: ReportsPage,
  head: () => ({
    meta: [
      { title: "Sales & Profit — business analytics | Bazaar POS" },
      { name: "description", content: "Sales, COGS, gross and net profit, product and category profitability, staff performance, discounts, returns and profit leaks." },
      { property: "og:title", content: "Sales & Profit — business analytics | Bazaar POS" },
      { property: "og:description", content: "A complete profitability dashboard for your shop." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

/* ================= shell ================= */

function ReportsPage() {
  const { data: roles, isLoading: rolesLoading } = useMyRoles();
  const [preset, setPreset] = useState<Preset>("mtd");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [costing, setCosting] = useState(() => getCostingMethod());
  const range = rangeFor(preset, from, to);

  if (!rolesLoading && !canManage(roles)) return <Navigate to="/dashboard" />;
  const isAdmin = (roles ?? []).includes("admin");

  return (
    <div className="p-4 lg:p-6 space-y-5 max-w-[1400px]">
      <div className="flex items-start justify-between gap-3 flex-wrap print:hidden">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Sales &amp; Profit</h1>
          <p className="text-sm text-muted-foreground">
            Sales → costs → gross profit → expenses → net profit, with product, staff and inventory insight.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={costing} onValueChange={(v) => { setCosting(v as "captured" | "average"); setCostingMethod(v as "captured" | "average"); }}>
            <SelectTrigger className="h-9 w-[190px] text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="captured">Costing: cost at sale (FIFO-ish)</SelectItem>
              <SelectItem value="average">Costing: current avg cost</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={() => window.print()}><Printer className="size-4" /> Print</Button>
        </div>
      </div>

      <RangePicker preset={preset} setPreset={setPreset} from={from} setFrom={setFrom} to={to} setTo={setTo} />

      <Tabs defaultValue="overview">
        <TabsList className="flex-wrap h-auto print:hidden">
          <TabsTrigger value="overview"><TrendingUp className="size-4" /> Overview</TabsTrigger>
          <TabsTrigger value="profit"><PiggyBank className="size-4" /> Profit analysis</TabsTrigger>
          <TabsTrigger value="products"><Package className="size-4" /> Products</TabsTrigger>
          <TabsTrigger value="categories"><Boxes className="size-4" /> Categories</TabsTrigger>
          <TabsTrigger value="movers"><Trophy className="size-4" /> Top &amp; slow</TabsTrigger>
          <TabsTrigger value="staff"><Users className="size-4" /> Staff</TabsTrigger>
          <TabsTrigger value="payments"><CreditCard className="size-4" /> Payments &amp; cash</TabsTrigger>
          <TabsTrigger value="discounts"><Percent className="size-4" /> Discounts</TabsTrigger>
          <TabsTrigger value="returns"><Undo2 className="size-4" /> Returns</TabsTrigger>
          <TabsTrigger value="expenses"><Wallet className="size-4" /> Expenses</TabsTrigger>
          <TabsTrigger value="customers"><UserRound className="size-4" /> Customers</TabsTrigger>
          <TabsTrigger value="purchases"><ShoppingCart className="size-4" /> Purchases</TabsTrigger>
          <TabsTrigger value="inventory"><Snowflake className="size-4" /> Inventory</TabsTrigger>
          <TabsTrigger value="leaks"><AlertTriangle className="size-4" /> Profit leaks</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4"><OverviewTab range={range} costing={costing} /></TabsContent>
        <TabsContent value="profit" className="mt-4"><ProfitTab range={range} costing={costing} /></TabsContent>
        <TabsContent value="products" className="mt-4"><ProductsTab range={range} costing={costing} /></TabsContent>
        <TabsContent value="categories" className="mt-4"><CategoriesTab range={range} costing={costing} /></TabsContent>
        <TabsContent value="movers" className="mt-4"><MoversTab range={range} costing={costing} /></TabsContent>
        <TabsContent value="staff" className="mt-4"><StaffTab range={range} costing={costing} /></TabsContent>
        <TabsContent value="payments" className="mt-4"><PaymentsTab range={range} /></TabsContent>
        <TabsContent value="discounts" className="mt-4"><DiscountsTab range={range} /></TabsContent>
        <TabsContent value="returns" className="mt-4"><ReturnsTab range={range} /></TabsContent>
        <TabsContent value="expenses" className="mt-4"><ExpensesTab range={range} /></TabsContent>
        <TabsContent value="customers" className="mt-4"><CustomersTab range={range} costing={costing} isAdmin={isAdmin} /></TabsContent>
        <TabsContent value="purchases" className="mt-4"><PurchasesTab range={range} /></TabsContent>
        <TabsContent value="inventory" className="mt-4"><InventoryTab /></TabsContent>
        <TabsContent value="leaks" className="mt-4"><LeaksTab range={range} costing={costing} /></TabsContent>
      </Tabs>
    </div>
  );
}

/* ================= shared bits ================= */

const PRESETS: Preset[] = ["today", "yday", "7d", "thisweek", "mtd", "lastmonth", "qtd", "ytd", "lastyear", "all"];

function RangePicker({ preset, setPreset, from, setFrom, to, setTo }:
  { preset: Preset; setPreset: (p: Preset) => void; from: string; setFrom: (s: string) => void; to: string; setTo: (s: string) => void }) {
  return (
    <Card className="p-3 flex flex-wrap items-center gap-2 print:hidden">
      {PRESETS.map((p) => (
        <Button key={p} size="sm" variant={preset === p ? "default" : "outline"} onClick={() => setPreset(p)}>
          {PRESET_LABELS[p]}
        </Button>
      ))}
      <div className="flex items-center gap-2 ml-auto">
        <Input type="date" value={from} onChange={(e) => { setFrom(e.target.value); if (to) setPreset("custom"); }} className="w-40" />
        <span className="text-muted-foreground">→</span>
        <Input type="date" value={to} onChange={(e) => { setTo(e.target.value); if (from) setPreset("custom"); }} className="w-40" />
      </div>
    </Card>
  );
}

function Kpi({ label, value, sub, tone, accent, onClick }:
  { label: string; value: string; sub?: string; tone?: "up" | "down"; accent?: boolean; onClick?: () => void }) {
  return (
    <Card
      onClick={onClick}
      className={`relative p-4 overflow-hidden ${onClick ? "cursor-pointer hover:border-primary/50 transition-colors" : ""} ${accent ? "bg-gradient-to-br from-primary/12 via-primary/5 to-transparent border-primary/30" : ""}`}
    >
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

function delta(now: number, before: number) {
  if (!before) return { sub: "no prior data", tone: undefined as "up" | "down" | undefined };
  const p = pct(now, before);
  return { sub: `${p >= 0 ? "▲" : "▼"} ${Math.abs(p).toFixed(1)}% vs prev`, tone: (p >= 0 ? "up" : "down") as "up" | "down" };
}

function Empty() { return <div className="grid place-items-center h-full p-8 text-sm text-muted-foreground">No data in this range.</div>; }

function Table({ head, children, exportCsv }: { head: string[]; children: React.ReactNode; exportCsv?: () => void }) {
  return (
    <Card className="p-0 overflow-hidden">
      {exportCsv && (
        <div className="flex justify-end p-2 border-b print:hidden">
          <Button size="sm" variant="outline" onClick={exportCsv}><Download className="size-4" /> CSV</Button>
        </div>
      )}
      <div className="overflow-x-auto max-h-[560px]">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left sticky top-0 z-10">
            <tr>{head.map((h, i) => <th key={h + i} className={`px-3 py-2.5 whitespace-nowrap ${i > 0 ? "text-right" : ""}`}>{h}</th>)}</tr>
          </thead>
          <tbody className="divide-y">{children}</tbody>
        </table>
      </div>
    </Card>
  );
}

const N = ({ children }: { children: React.ReactNode }) => <td className="px-3 py-2.5 text-right tabular-nums whitespace-nowrap">{children}</td>;
const T = ({ children }: { children: React.ReactNode }) => <td className="px-3 py-2.5">{children}</td>;

/** Everything a tab needs for a range: sales, costs, expenses, returns. */
function usePnl(range: Range, costing: "captured" | "average") {
  const sales = useSales(range);
  const products = useProducts();
  const expenses = useExpenses(range);
  const returns = useReturns(range);
  const costOf = useMemo(() => makeCostOf(products.data, costing), [products.data, costing]);
  const expenseTotal = (expenses.data ?? []).reduce((s, e) => s + Number(e.amount), 0);
  const productIds = useMemo(() => new Set((products.data ?? []).map((p) => p.id)), [products.data]);
  const storeReturns = useMemo(
    () => (returns.data ?? []).filter((r) => productIds.size === 0 || productIds.has(r.product_id)),
    [returns.data, productIds],
  );
  const returnTotal = storeReturns.reduce((s, r) => s + Number(r.refund_amount ?? 0), 0);
  const summary = useMemo(
    () => summarize(sales.data ?? [], costOf, expenseTotal, returnTotal),
    [sales.data, costOf, expenseTotal, returnTotal],
  );
  return { sales, products, expenses, returns: storeReturns, costOf, summary, loading: sales.isLoading };
}

/* ================= 1. OVERVIEW ================= */

type Metric = "sales" | "bills" | "items" | "gross" | "net";

function OverviewTab({ range, costing }: { range: Range; costing: "captured" | "average" }) {
  const cur = usePnl(range, costing);
  const prevR = previousRange(range);
  const prev = usePnl(prevR, costing);
  const [metric, setMetric] = useState<Metric>("sales");
  const [bucket, setBucket] = useState<"day" | "week" | "month" | "year">("day");

  const s = cur.summary, p = prev.summary;

  const series = useMemo(
    () => buildSeries(cur.sales.data ?? [], cur.costOf, bucket, cur.summary.expenses, range),
    [cur.sales.data, cur.costOf, bucket, cur.summary.expenses, range],
  );

  const key: Record<Metric, string> = { sales: "sales", bills: "bills", items: "items", gross: "gross", net: "net" };
  const isMoney = metric !== "bills" && metric !== "items";

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <Kpi accent label="Gross sales" value={inr(s.grossSales)} {...delta(s.grossSales, p.grossSales)} />
        <Kpi label="Net sales" value={inr(s.netSales)} {...delta(s.netSales, p.netSales)} />
        <Kpi label="COGS" value={inr(s.cogs)} {...delta(s.cogs, p.cogs)} />
        <Kpi accent label="Gross profit" value={inr(s.grossProfit)} {...delta(s.grossProfit, p.grossProfit)} />
        <Kpi label="Gross margin" value={`${s.grossMargin.toFixed(1)}%`} sub={`prev ${p.grossMargin.toFixed(1)}%`} />
        <Kpi label="Operating expenses" value={inr(s.expenses)} {...delta(s.expenses, p.expenses)} />
        <Kpi accent label="Net profit" value={inr(s.netProfit)} {...delta(s.netProfit, p.netProfit)} />
        <Kpi label="Net margin" value={`${s.netMargin.toFixed(1)}%`} sub={`prev ${p.netMargin.toFixed(1)}%`} />
        <Kpi label="Bills" value={String(s.bills)} {...delta(s.bills, p.bills)} />
        <Kpi label="Items sold" value={s.items.toFixed(2)} {...delta(s.items, p.items)} />
        <Kpi label="Average bill" value={inr(s.avgBill)} {...delta(s.avgBill, p.avgBill)} />
        <Kpi label="Total discounts" value={inr(s.discounts)} {...delta(s.discounts, p.discounts)} />
        <Kpi label="Returns / refunds" value={inr(s.returns)} {...delta(s.returns, p.returns)} />
        <Kpi label="Highest bill" value={inr(s.highBill)} />
        <Kpi label="Lowest bill" value={inr(s.lowBill)} />
      </div>

      <Card className="p-5">
        <div className="flex items-center justify-between gap-2 flex-wrap mb-3">
          <h3 className="font-semibold">Trend</h3>
          <div className="flex gap-2">
            <Select value={metric} onValueChange={(v) => setMetric(v as Metric)}>
              <SelectTrigger className="h-8 w-40 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="sales">Sales</SelectItem>
                <SelectItem value="bills">Number of bills</SelectItem>
                <SelectItem value="items">Items sold</SelectItem>
                <SelectItem value="gross">Gross profit</SelectItem>
                <SelectItem value="net">Net profit</SelectItem>
              </SelectContent>
            </Select>
            <Select value={bucket} onValueChange={(v) => setBucket(v as typeof bucket)}>
              <SelectTrigger className="h-8 w-32 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="day">Daily</SelectItem>
                <SelectItem value="week">Weekly</SelectItem>
                <SelectItem value="month">Monthly</SelectItem>
                <SelectItem value="year">Yearly</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="h-72">
          {series.length === 0 ? <Empty /> : (
            <ResponsiveContainer>
              <LineChart data={series}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v: number) => (isMoney ? inr(v) : v.toFixed(2))} />
                <Line type="monotone" dataKey={key[metric]} stroke="hsl(var(--primary))" strokeWidth={2} dot={false} name={PRESET_METRIC_LABEL[metric]} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </Card>

      <BillsTable sales={cur.sales.data ?? []} range={range} />
    </div>
  );
}

const PRESET_METRIC_LABEL: Record<Metric, string> = {
  sales: "Sales", bills: "Bills", items: "Items sold", gross: "Gross profit", net: "Net profit",
};

function bucketKey(d: Date, bucket: "day" | "week" | "month" | "year") {
  if (bucket === "year") return String(d.getFullYear());
  if (bucket === "month") return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  if (bucket === "week") {
    const t = new Date(d); t.setDate(t.getDate() - ((t.getDay() + 6) % 7));
    return `W ${ymd(t).slice(5)}`;
  }
  return ymd(d);
}

function buildSeries(
  sales: Sale[], costOf: (i: SaleItem) => number, bucket: "day" | "week" | "month" | "year",
  expenseTotal: number, range: Range,
) {
  const map = new Map<string, { label: string; sales: number; bills: number; items: number; gross: number; net: number }>();
  for (const s of sales) {
    const k = bucketKey(new Date(s.created_at), bucket);
    const row = map.get(k) ?? { label: k, sales: 0, bills: 0, items: 0, gross: 0, net: 0 };
    row.sales += Number(s.grand_total);
    row.bills += 1;
    let cogs = 0;
    for (const it of s.sale_items ?? []) { row.items += Number(it.qty); cogs += costOf(it) * Number(it.qty); }
    row.gross += Number(s.grand_total) - cogs;
    map.set(k, row);
  }
  const rows = Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label));
  // spread operating expenses evenly across the buckets in the range
  const perBucket = rows.length ? expenseTotal / rows.length : 0;
  void range;
  for (const r of rows) r.net = r.gross - perBucket;
  return rows.map((r) => ({ ...r, sales: round2(r.sales), gross: round2(r.gross), net: round2(r.net), items: round2(r.items) }));
}

const round2 = (n: number) => Math.round(n * 100) / 100;

function BillsTable({ sales, range }: { sales: Sale[]; range: Range }) {
  const [q, setQ] = useState("");
  const rows = sales.filter((s) =>
    !q || s.bill_no.toLowerCase().includes(q.toLowerCase()) || (s.customer_name ?? "").toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 flex-wrap print:hidden">
        <Input placeholder="Search bill no or customer…" value={q} onChange={(e) => setQ(e.target.value)} className="w-64" />
        <div className="text-xs text-muted-foreground">{rows.length} bill(s)</div>
        <div className="ml-auto flex gap-2">
          <GstExport />
          <Button size="sm" variant="outline" onClick={() => exportGSTCSV(rows, range.start, range.end)}>
            <Download className="size-4" /> Export range
          </Button>
        </div>
      </div>
      {rows.length === 0 ? <Card className="h-32"><Empty /></Card> : (
        <Table head={["Bill #", "Date", "Customer", "Mode", "Discount", "Total", ""]}>
          {rows.slice(0, 500).map((b) => (
            <tr key={b.id}>
              <T><span className="font-mono text-xs">{b.bill_no}</span></T>
              <N>{new Date(b.created_at).toLocaleString("en-IN")}</N>
              <N>{b.customer_name ?? "—"}</N>
              <N className="capitalize">{b.payment_mode}</N>
              <N>{inr(Number(b.line_discount) + Number(b.bill_discount))}</N>
              <N>{inr(b.grand_total)}</N>
              <N>
                <Button asChild size="sm" variant="ghost">
                  <Link to="/i/$billNo" params={{ billNo: b.bill_no }} target="_blank"><Receipt className="size-3.5" /></Link>
                </Button>
              </N>
            </tr>
          ))}
        </Table>
      )}
    </div>
  );
}

/* ================= 2. PROFIT ANALYSIS ================= */

function ProfitTab({ range, costing }: { range: Range; costing: "captured" | "average" }) {
  const { summary: s, sales, costOf } = usePnl(range, costing);
  const lines: Array<[string, number, boolean?]> = [
    ["Gross sales", s.grossSales],
    ["− Discounts (already applied in bills)", -s.discounts],
    ["− Returns / refunds", -s.returns],
    ["Net sales", s.netSales, true],
    ["− Cost of goods sold", -s.cogs],
    ["Gross profit", s.grossProfit, true],
    ["− Operating expenses", -s.expenses],
    ["Net profit", s.netProfit, true],
  ];
  const compare = [
    { name: "Net sales", value: round2(s.netSales) },
    { name: "COGS", value: round2(s.cogs) },
    { name: "Gross profit", value: round2(s.grossProfit) },
    { name: "Expenses", value: round2(s.expenses) },
    { name: "Net profit", value: round2(s.netProfit) },
  ];
  const daily = useMemo(() => buildSeries(sales.data ?? [], costOf, "day", s.expenses, range), [sales.data, costOf, s.expenses, range]);

  return (
    <div className="space-y-4">
      <div className="grid lg:grid-cols-2 gap-4">
        <Card className="p-0 overflow-hidden">
          <div className="px-4 py-3 border-b font-semibold text-sm">Profit &amp; loss</div>
          <table className="w-full text-sm">
            <tbody className="divide-y">
              {lines.map(([label, value, strong]) => (
                <tr key={label} className={strong ? "bg-muted/40 font-semibold" : ""}>
                  <td className="px-4 py-2.5">{label}</td>
                  <td className={`px-4 py-2.5 text-right tabular-nums ${value < 0 ? "text-destructive" : ""}`}>{inr(value)}</td>
                </tr>
              ))}
              <tr><td className="px-4 py-2.5">Gross profit margin</td><td className="px-4 py-2.5 text-right tabular-nums">{s.grossMargin.toFixed(1)}%</td></tr>
              <tr><td className="px-4 py-2.5">Net profit margin</td><td className="px-4 py-2.5 text-right tabular-nums">{s.netMargin.toFixed(1)}%</td></tr>
            </tbody>
          </table>
        </Card>
        <Card className="p-5">
          <h3 className="font-semibold mb-3">Sales vs cost vs profit</h3>
          <div className="h-72">
            <ResponsiveContainer>
              <BarChart data={compare}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v: number) => inr(v)} />
                <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                  {compare.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>
      <Card className="p-5">
        <h3 className="font-semibold mb-3">Gross profit vs net profit over time</h3>
        <div className="h-72">
          {daily.length === 0 ? <Empty /> : (
            <ResponsiveContainer>
              <LineChart data={daily}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v: number) => inr(v)} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Line type="monotone" dataKey="sales" name="Sales" stroke={PALETTE[1]} strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="gross" name="Gross profit" stroke={PALETTE[2]} strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="net" name="Net profit" stroke={PALETTE[3]} strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </Card>
    </div>
  );
}

/* ================= product aggregation ================= */

type ProdRow = {
  id: string; name: string; barcode: string; category: string; qty: number; sales: number;
  cogs: number; discount: number; returnsQty: number; returnsValue: number;
  avgSell: number; avgCost: number; profit: number; margin: number; stock: number;
};

function useProductRows(range: Range, costing: "captured" | "average") {
  const { sales, products, returns, costOf } = usePnl(range, costing);
  return useMemo(() => {
    const pmap = new Map((products.data ?? []).map((p) => [p.id, p]));
    const acc = new Map<string, ProdRow>();
    const get = (id: string, name: string) => {
      let r = acc.get(id);
      if (!r) {
        const p = pmap.get(id);
        r = {
          id, name: p?.name ?? name, barcode: p?.barcode ?? "—",
          category: p?.categories?.name ?? "Other",
          qty: 0, sales: 0, cogs: 0, discount: 0, returnsQty: 0, returnsValue: 0,
          avgSell: 0, avgCost: 0, profit: 0, margin: 0, stock: Number(p?.stock_qty ?? 0),
        };
        acc.set(id, r);
      }
      return r;
    };
    for (const s of sales.data ?? []) for (const it of s.sale_items ?? []) {
      const r = get(it.product_id ?? it.name, it.name);
      r.qty += Number(it.qty);
      r.sales += Number(it.line_total);
      r.cogs += costOf(it) * Number(it.qty);
      r.discount += Number(it.line_discount ?? 0);
    }
    for (const ret of returns) {
      const p = pmap.get(ret.product_id);
      const r = get(ret.product_id, p?.name ?? "Unknown");
      r.returnsQty += Number(ret.qty);
      r.returnsValue += Number(ret.refund_amount ?? 0);
    }
    for (const r of acc.values()) {
      const net = r.sales - r.returnsValue;
      r.avgSell = r.qty ? r.sales / r.qty : 0;
      r.avgCost = r.qty ? r.cogs / r.qty : 0;
      r.profit = net - r.cogs;
      r.margin = net > 0 ? (r.profit / net) * 100 : 0;
    }
    return Array.from(acc.values());
  }, [sales.data, products.data, returns, costOf]);
}

/* ================= 3. PRODUCTS ================= */

type SortKey = "sales" | "sales_asc" | "profit" | "profit_asc" | "margin" | "margin_asc" | "qty" | "qty_asc";

function ProductsTab({ range, costing }: { range: Range; costing: "captured" | "average" }) {
  const rows = useProductRows(range, costing);
  const [sort, setSort] = useState<SortKey>("profit");
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("all");

  const categories = useMemo(() => Array.from(new Set(rows.map((r) => r.category))).sort(), [rows]);
  const filtered = useMemo(() => {
    const list = rows.filter((r) =>
      (cat === "all" || r.category === cat) &&
      (!q || r.name.toLowerCase().includes(q.toLowerCase()) || r.barcode.includes(q)));
    const cmp: Record<SortKey, (a: ProdRow, b: ProdRow) => number> = {
      sales: (a, b) => b.sales - a.sales, sales_asc: (a, b) => a.sales - b.sales,
      profit: (a, b) => b.profit - a.profit, profit_asc: (a, b) => a.profit - b.profit,
      margin: (a, b) => b.margin - a.margin, margin_asc: (a, b) => a.margin - b.margin,
      qty: (a, b) => b.qty - a.qty, qty_asc: (a, b) => a.qty - b.qty,
    };
    return [...list].sort(cmp[sort]);
  }, [rows, sort, q, cat]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <Input placeholder="Search product or barcode…" value={q} onChange={(e) => setQ(e.target.value)} className="w-60" />
        <Select value={cat} onValueChange={setCat}>
          <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {categories.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
          <SelectTrigger className="w-52"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="sales">Highest sales</SelectItem>
            <SelectItem value="sales_asc">Lowest sales</SelectItem>
            <SelectItem value="profit">Highest profit</SelectItem>
            <SelectItem value="profit_asc">Lowest profit</SelectItem>
            <SelectItem value="margin">Highest margin</SelectItem>
            <SelectItem value="margin_asc">Lowest margin</SelectItem>
            <SelectItem value="qty">Highest quantity sold</SelectItem>
            <SelectItem value="qty_asc">Lowest quantity sold</SelectItem>
          </SelectContent>
        </Select>
        <div className="text-xs text-muted-foreground ml-auto">{filtered.length} product(s)</div>
      </div>
      <Table
        head={["Product", "Barcode", "Category", "Qty sold", "Sales", "Avg sell", "Avg cost", "COGS", "Gross profit", "Margin %", "Discount", "Returns"]}
        exportCsv={() => downloadCSV(
          `product-profitability-${ymd(range.start)}_${ymd(range.end)}.csv`,
          ["Product", "Barcode", "Category", "Qty", "Sales", "Avg sell", "Avg cost", "COGS", "Profit", "Margin %", "Discount", "Returns"],
          filtered.map((r) => [r.name, r.barcode, r.category, r.qty.toFixed(2), r.sales.toFixed(2), r.avgSell.toFixed(2), r.avgCost.toFixed(2), r.cogs.toFixed(2), r.profit.toFixed(2), r.margin.toFixed(1), r.discount.toFixed(2), r.returnsValue.toFixed(2)]),
        )}
      >
        {filtered.map((r) => (
          <tr key={r.id}>
            <T>{r.name}</T>
            <N><span className="font-mono text-xs">{r.barcode}</span></N>
            <N>{r.category}</N>
            <N>{r.qty.toFixed(2)}</N>
            <N>{inr(r.sales)}</N>
            <N>{r.avgSell.toFixed(2)}</N>
            <N>{r.avgCost.toFixed(2)}</N>
            <N>{inr(r.cogs)}</N>
            <N><span className={r.profit >= 0 ? "text-primary" : "text-destructive"}>{inr(r.profit)}</span></N>
            <N>{r.margin.toFixed(1)}%</N>
            <N>{inr(r.discount)}</N>
            <N>{r.returnsQty ? `${r.returnsQty} · ${inr(r.returnsValue)}` : "—"}</N>
          </tr>
        ))}
      </Table>
    </div>
  );
}

/* ================= 4. CATEGORIES ================= */

function CategoriesTab({ range, costing }: { range: Range; costing: "captured" | "average" }) {
  const rows = useProductRows(range, costing);
  const cats = useMemo(() => {
    const map = new Map<string, { name: string; qty: number; sales: number; cogs: number; profit: number; margin: number }>();
    for (const r of rows) {
      const c = map.get(r.category) ?? { name: r.category, qty: 0, sales: 0, cogs: 0, profit: 0, margin: 0 };
      c.qty += r.qty; c.sales += r.sales - r.returnsValue; c.cogs += r.cogs; c.profit += r.profit;
      map.set(r.category, c);
    }
    const list = Array.from(map.values());
    for (const c of list) c.margin = c.sales > 0 ? (c.profit / c.sales) * 100 : 0;
    return list.sort((a, b) => b.sales - a.sales);
  }, [rows]);

  return (
    <div className="space-y-4">
      <div className="grid lg:grid-cols-2 gap-4">
        <Card className="p-5">
          <h3 className="font-semibold mb-3">Sales by category</h3>
          <div className="h-72">
            {cats.length === 0 ? <Empty /> : (
              <ResponsiveContainer>
                <PieChart>
                  <Pie data={cats.map((c) => ({ name: c.name, value: round2(c.sales) }))} dataKey="value" nameKey="name" innerRadius={50} outerRadius={100}>
                    {cats.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v: number) => inr(v)} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>
        <Card className="p-5">
          <h3 className="font-semibold mb-3">Profit by category</h3>
          <div className="h-72">
            {cats.length === 0 ? <Empty /> : (
              <ResponsiveContainer>
                <BarChart data={cats.map((c) => ({ name: c.name, profit: round2(c.profit), sales: round2(c.sales) }))}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} angle={-25} textAnchor="end" height={70} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v: number) => inr(v)} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="sales" name="Net sales" fill={PALETTE[1]} radius={[4, 4, 0, 0]} />
                  <Bar dataKey="profit" name="Gross profit" fill={PALETTE[2]} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>
      </div>
      <Table
        head={["Category", "Qty sold", "Net sales", "COGS", "Gross profit", "Margin %"]}
        exportCsv={() => downloadCSV(`category-profit-${ymd(range.start)}.csv`, ["Category", "Qty", "Net sales", "COGS", "Profit", "Margin %"],
          cats.map((c) => [c.name, c.qty.toFixed(2), c.sales.toFixed(2), c.cogs.toFixed(2), c.profit.toFixed(2), c.margin.toFixed(1)]))}
      >
        {cats.map((c) => (
          <tr key={c.name}>
            <T>{c.name}</T><N>{c.qty.toFixed(2)}</N><N>{inr(c.sales)}</N><N>{inr(c.cogs)}</N>
            <N><span className={c.profit >= 0 ? "text-primary" : "text-destructive"}>{inr(c.profit)}</span></N>
            <N>{c.margin.toFixed(1)}%</N>
          </tr>
        ))}
      </Table>
    </div>
  );
}

/* ================= 5. TOP & SLOW ================= */

function MoversTab({ range, costing }: { range: Range; costing: "captured" | "average" }) {
  const rows = useProductRows(range, costing);
  const [limit, setLimit] = useState("10");
  const [by, setBy] = useState<"qty" | "sales" | "profit">("qty");
  const [days, setDays] = useState("30");
  const products = useProducts();

  const top = useMemo(() => {
    const cmp = by === "qty" ? (a: ProdRow, b: ProdRow) => b.qty - a.qty
      : by === "sales" ? (a: ProdRow, b: ProdRow) => b.sales - a.sales
      : (a: ProdRow, b: ProdRow) => b.profit - a.profit;
    return [...rows].sort(cmp).slice(0, Number(limit));
  }, [rows, by, limit]);

  const slow = useMemo(() => {
    const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - Number(days));
    return (products.data ?? [])
      .filter((p) => p.is_active && Number(p.stock_qty) > 0 && (!p.last_sold_at || new Date(p.last_sold_at) < cutoff))
      .map((p) => ({ ...p, value: Number(p.stock_qty) * Number(p.purchase_price) }))
      .sort((a, b) => b.value - a.value);
  }, [products.data, days]);
  const blocked = slow.reduce((s, p) => s + p.value, 0);

  return (
    <div className="space-y-4">
      <Card className="p-3 flex flex-wrap items-center gap-2 print:hidden">
        <span className="text-sm font-medium">Top sellers by</span>
        <Select value={by} onValueChange={(v) => setBy(v as typeof by)}>
          <SelectTrigger className="w-40 h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="qty">Quantity sold</SelectItem>
            <SelectItem value="sales">Revenue</SelectItem>
            <SelectItem value="profit">Profit</SelectItem>
          </SelectContent>
        </Select>
        <Select value={limit} onValueChange={setLimit}>
          <SelectTrigger className="w-32 h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="10">Top 10</SelectItem>
            <SelectItem value="25">Top 25</SelectItem>
            <SelectItem value="50">Top 50</SelectItem>
          </SelectContent>
        </Select>
      </Card>
      <Card className="p-5">
        <div className="h-72">
          {top.length === 0 ? <Empty /> : (
            <ResponsiveContainer>
              <BarChart data={top.map((r) => ({ name: r.name, qty: round2(r.qty), sales: round2(r.sales), profit: round2(r.profit) }))}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} angle={-30} textAnchor="end" height={80} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v: number, k) => (k === "qty" ? String(v) : inr(v))} />
                <Bar dataKey={by} fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} name={by === "qty" ? "Qty sold" : by === "sales" ? "Revenue" : "Profit"} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </Card>
      <Table head={["#", "Product", "Qty", "Revenue", "Profit", "Margin %"]}>
        {top.map((r, i) => (
          <tr key={r.id}>
            <T><span className="text-muted-foreground">{i + 1}</span></T>
            <N>{r.name}</N><N>{r.qty.toFixed(2)}</N><N>{inr(r.sales)}</N><N>{inr(r.profit)}</N><N>{r.margin.toFixed(1)}%</N>
          </tr>
        ))}
      </Table>

      <Card className="p-3 flex flex-wrap items-center gap-2 print:hidden">
        <span className="text-sm font-medium">Slow moving — not sold in the last</span>
        <Select value={days} onValueChange={setDays}>
          <SelectTrigger className="w-32 h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            {["7", "15", "30", "60", "90"].map((d) => <SelectItem key={d} value={d}>{d} days</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="ml-auto text-sm"><span className="text-muted-foreground">Blocked stock value:</span> <b>{inr(blocked)}</b></div>
      </Card>
      <Table
        head={["Product", "Company", "Stock", "Last sold", "Stock value"]}
        exportCsv={() => downloadCSV(`slow-moving-${days}d.csv`, ["Product", "Company", "Stock", "Last sold", "Stock value"],
          slow.map((p) => [p.name, p.brand ?? "", String(p.stock_qty), p.last_sold_at ?? "Never", p.value.toFixed(2)]))}
      >
        {slow.map((p) => (
          <tr key={p.id}>
            <T>{p.name}</T><N>{p.brand ?? "—"}</N><N>{Number(p.stock_qty)} {p.unit}</N>
            <N>{p.last_sold_at ? new Date(p.last_sold_at).toLocaleDateString("en-IN") : "Never"}</N>
            <N>{inr(p.value)}</N>
          </tr>
        ))}
      </Table>
    </div>
  );
}

/* ================= 6. STAFF ================= */

function StaffTab({ range, costing }: { range: Range; costing: "captured" | "average" }) {
  const { sales, costOf, returns } = usePnl(range, costing);
  const names = useStaffNames();
  const [who, setWho] = useState("all");

  const rows = useMemo(() => {
    const map = new Map<string, { id: string; name: string; bills: number; sales: number; items: number; discounts: number; cogs: number; cash: number; returns: number }>();
    for (const s of sales.data ?? []) {
      const id = s.cashier_id;
      const r = map.get(id) ?? { id, name: names.data?.get(id) ?? "Staff", bills: 0, sales: 0, items: 0, discounts: 0, cogs: 0, cash: 0, returns: 0 };
      r.bills++; r.sales += Number(s.grand_total);
      r.discounts += Number(s.line_discount) + Number(s.bill_discount);
      r.cash += Number(s.amount_cash);
      for (const it of s.sale_items ?? []) { r.items += Number(it.qty); r.cogs += costOf(it) * Number(it.qty); }
      map.set(id, r);
    }
    for (const ret of returns) {
      const r = map.get(ret.created_by);
      if (r) r.returns += Number(ret.refund_amount ?? 0);
    }
    return Array.from(map.values())
      .map((r) => ({
        ...r,
        avg: r.bills ? r.sales / r.bills : 0,
        profit: r.sales - r.returns - r.cogs,
        margin: r.sales > 0 ? ((r.sales - r.returns - r.cogs) / r.sales) * 100 : 0,
        discPct: r.sales > 0 ? (r.discounts / r.sales) * 100 : 0,
      }))
      .filter((r) => who === "all" || r.id === who)
      .sort((a, b) => b.sales - a.sales);
  }, [sales.data, names.data, costOf, returns, who]);

  const staffOptions = Array.from(new Map((sales.data ?? []).map((s) => [s.cashier_id, names.data?.get(s.cashier_id) ?? "Staff"])).entries());

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 print:hidden">
        <Select value={who} onValueChange={setWho}>
          <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All staff</SelectItem>
            {staffOptions.map(([id, n]) => <SelectItem key={id} value={id}>{n}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <Table
        head={["Employee", "Bills", "Total sales", "Items", "Avg bill", "Discounts", "Disc %", "Returns", "Gross profit", "Margin %", "Cash collected"]}
        exportCsv={() => downloadCSV(`staff-performance-${ymd(range.start)}.csv`,
          ["Employee", "Bills", "Sales", "Items", "Avg bill", "Discounts", "Disc %", "Returns", "Profit", "Margin %", "Cash"],
          rows.map((r) => [r.name, r.bills, r.sales.toFixed(2), r.items.toFixed(2), r.avg.toFixed(2), r.discounts.toFixed(2), r.discPct.toFixed(1), r.returns.toFixed(2), r.profit.toFixed(2), r.margin.toFixed(1), r.cash.toFixed(2)]))}
      >
        {rows.map((r) => {
          const flagged = r.discPct > 10 || (r.sales > 0 && r.returns / r.sales > 0.1);
          return (
            <tr key={r.id} className={flagged ? "bg-destructive/5" : ""}>
              <T>
                {r.name}
                {flagged && <span className="ml-2 text-[10px] rounded-full bg-destructive/10 text-destructive px-2 py-0.5">unusual discounts / returns</span>}
              </T>
              <N>{r.bills}</N><N>{inr(r.sales)}</N><N>{r.items.toFixed(2)}</N><N>{inr(r.avg)}</N>
              <N>{inr(r.discounts)}</N><N>{r.discPct.toFixed(1)}%</N><N>{inr(r.returns)}</N>
              <N>{inr(r.profit)}</N><N>{r.margin.toFixed(1)}%</N><N>{inr(r.cash)}</N>
            </tr>
          );
        })}
      </Table>
    </div>
  );
}

/* ================= 7. PAYMENTS & CASH ================= */

function PaymentsTab({ range }: { range: Range }) {
  const sales = useSales(range);
  const expenses = useExpenses(range);
  const returns = useReturns(range);
  const [opening, setOpening] = useState("0");
  const [actual, setActual] = useState("");

  const bills = sales.data ?? [];
  const modes = useMemo(() => {
    const acc = { cash: 0, upi: 0, card: 0, credit: 0, other: 0 };
    const counts = { cash: 0, upi: 0, card: 0, credit: 0, other: 0 };
    for (const s of bills) {
      const parts: Array<[keyof typeof acc, number]> = [
        ["cash", Number(s.amount_cash)], ["upi", Number(s.amount_upi)], ["card", Number(s.amount_card)],
        ["credit", Number(s.credit_amount)], ["other", Number(s.amount_other)],
      ];
      for (const [k, v] of parts) if (v > 0) { acc[k] += v; counts[k]++; }
    }
    const total = Object.values(acc).reduce((a, b) => a + b, 0) || 1;
    return (Object.keys(acc) as Array<keyof typeof acc>).map((k) => ({
      name: k.toUpperCase(), value: round2(acc[k]), count: counts[k], share: (acc[k] / total) * 100,
    })).filter((r) => r.value > 0 || r.count > 0);
  }, [bills]);

  const cashSales = bills.reduce((s, b) => s + Number(b.amount_cash), 0);
  const cashExp = (expenses.data ?? []).filter((e) => e.payment_mode === "cash").reduce((s, e) => s + Number(e.amount), 0);
  const cashRefunds = (returns.data ?? []).reduce((s, r) => s + Number(r.refund_amount ?? 0), 0);
  const expected = Number(opening || 0) + cashSales - cashExp - cashRefunds;
  const diff = actual === "" ? 0 : Number(actual) - expected;

  return (
    <div className="space-y-4">
      <div className="grid lg:grid-cols-2 gap-4">
        <Card className="p-5">
          <h3 className="font-semibold mb-3">Sales by payment method</h3>
          <div className="h-64">
            {modes.length === 0 ? <Empty /> : (
              <ResponsiveContainer>
                <PieChart>
                  <Pie data={modes} dataKey="value" nameKey="name" innerRadius={45} outerRadius={95}>
                    {modes.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v: number) => inr(v)} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>
        <Card className="p-0 overflow-hidden">
          <div className="px-4 py-3 border-b font-semibold text-sm">Daily cash reconciliation</div>
          <div className="p-4 space-y-2 text-sm">
            <Row label="Opening cash">
              <Input value={opening} onChange={(e) => setOpening(e.target.value)} type="number" className="h-8 w-32 text-right" />
            </Row>
            <Row label="Cash sales"><b className="tabular-nums">{inr(cashSales)}</b></Row>
            <Row label="Cash expenses"><b className="tabular-nums text-destructive">− {inr(cashExp)}</b></Row>
            <Row label="Cash refunds"><b className="tabular-nums text-destructive">− {inr(cashRefunds)}</b></Row>
            <Row label="Expected cash"><b className="tabular-nums">{inr(expected)}</b></Row>
            <Row label="Actual cash counted">
              <Input value={actual} onChange={(e) => setActual(e.target.value)} type="number" placeholder="0" className="h-8 w-32 text-right" />
            </Row>
            <Row label="Difference">
              <b className={`tabular-nums ${diff === 0 ? "" : diff > 0 ? "text-primary" : "text-destructive"}`}>{inr(diff)}</b>
            </Row>
          </div>
        </Card>
      </div>
      <Table head={["Method", "Amount", "Transactions", "% of sales"]}>
        {modes.map((m) => (
          <tr key={m.name}><T>{m.name}</T><N>{inr(m.value)}</N><N>{m.count}</N><N>{m.share.toFixed(1)}%</N></tr>
        ))}
      </Table>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b last:border-0 py-1.5">
      <span className="text-muted-foreground">{label}</span>{children}
    </div>
  );
}

/* ================= 8. DISCOUNTS ================= */

function DiscountsTab({ range }: { range: Range }) {
  const { sales, summary } = usePnl(range, getCostingMethod());
  const names = useStaffNames();
  const [limitPct, setLimitPct] = useState("5");

  const bills = sales.data ?? [];
  const byStaff = useMemo(() => {
    const map = new Map<string, { name: string; disc: number; sales: number }>();
    for (const s of bills) {
      const id = s.cashier_id;
      const r = map.get(id) ?? { name: names.data?.get(id) ?? "Staff", disc: 0, sales: 0 };
      r.disc += Number(s.line_discount) + Number(s.bill_discount);
      r.sales += Number(s.grand_total);
      map.set(id, r);
    }
    return Array.from(map.values()).sort((a, b) => b.disc - a.disc);
  }, [bills, names.data]);

  const topBills = useMemo(
    () => [...bills].map((b) => ({ ...b, disc: Number(b.line_discount) + Number(b.bill_discount) }))
      .sort((a, b) => b.disc - a.disc).slice(0, 20),
    [bills],
  );

  const discPct = summary.grossSales > 0 ? (summary.discounts / summary.grossSales) * 100 : 0;
  const over = discPct > Number(limitPct || 0);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Kpi accent label="Total discounts" value={inr(summary.discounts)} />
        <Kpi label="Discount % of sales" value={`${discPct.toFixed(1)}%`} tone={over ? "down" : "up"} sub={over ? "above limit" : "within limit"} />
        <Kpi label="Bills with discount" value={String(bills.filter((b) => Number(b.line_discount) + Number(b.bill_discount) > 0).length)} />
        <Card className="p-4">
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Alert limit (% of sales)</div>
          <Input value={limitPct} onChange={(e) => setLimitPct(e.target.value)} type="number" className="mt-2 h-9" />
        </Card>
      </div>
      {over && (
        <Card className="p-4 border-destructive/40 bg-destructive/5 text-sm flex items-center gap-2">
          <AlertTriangle className="size-4 text-destructive" />
          Discounts are {discPct.toFixed(1)}% of sales ({inr(summary.discounts)}), above your {limitPct}% limit.
        </Card>
      )}
      <div className="grid lg:grid-cols-2 gap-4">
        <Table head={["Employee", "Discount given", "Sales", "% of their sales"]}>
          {byStaff.map((r) => (
            <tr key={r.name}>
              <T>{r.name}</T><N>{inr(r.disc)}</N><N>{inr(r.sales)}</N>
              <N>{r.sales > 0 ? ((r.disc / r.sales) * 100).toFixed(1) : "0.0"}%</N>
            </tr>
          ))}
        </Table>
        <Table head={["Bill #", "Date", "Discount", "Total"]}>
          {topBills.map((b) => (
            <tr key={b.id}>
              <T><span className="font-mono text-xs">{b.bill_no}</span></T>
              <N>{new Date(b.created_at).toLocaleDateString("en-IN")}</N>
              <N>{inr(b.disc)}</N><N>{inr(b.grand_total)}</N>
            </tr>
          ))}
        </Table>
      </div>
    </div>
  );
}

/* ================= 9. RETURNS ================= */

function ReturnsTab({ range }: { range: Range }) {
  const returns = useReturns(range);
  const products = useProducts();
  const names = useStaffNames();
  const pmap = new Map((products.data ?? []).map((p) => [p.id, p]));
  const rows = (returns.data ?? []).filter((r) => pmap.size === 0 || pmap.has(r.product_id));
  const total = rows.reduce((s, r) => s + Number(r.refund_amount ?? 0), 0);
  const qty = rows.reduce((s, r) => s + Number(r.qty), 0);

  const trend = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of rows) {
      const k = ymd(new Date(r.created_at));
      map.set(k, (map.get(k) ?? 0) + Number(r.refund_amount ?? 0));
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([date, value]) => ({ date, value: round2(value) }));
  }, [rows]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Kpi accent label="Returns" value={String(rows.length)} />
        <Kpi label="Return value" value={inr(total)} />
        <Kpi label="Quantity returned" value={qty.toFixed(2)} />
        <Kpi label="Profit impact" value={`− ${inr(total)}`} tone="down" />
      </div>
      <Card className="p-5">
        <h3 className="font-semibold mb-3">Return trend</h3>
        <div className="h-56">
          {trend.length === 0 ? <Empty /> : (
            <ResponsiveContainer>
              <BarChart data={trend}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v: number) => inr(v)} />
                <Bar dataKey="value" fill={PALETTE[4]} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </Card>
      <Table
        head={["Date", "Product", "Qty", "Refund", "Reason", "Processed by"]}
        exportCsv={() => downloadCSV(`returns-${ymd(range.start)}.csv`, ["Date", "Product", "Qty", "Refund", "Reason", "By"],
          rows.map((r) => [new Date(r.created_at).toLocaleString("en-IN"), pmap.get(r.product_id)?.name ?? "", String(r.qty), String(r.refund_amount), r.reason ?? "", names.data?.get(r.created_by) ?? ""]))}
      >
        {rows.map((r) => (
          <tr key={r.id}>
            <T>{new Date(r.created_at).toLocaleString("en-IN")}</T>
            <N>{pmap.get(r.product_id)?.name ?? "—"}</N>
            <N>{Number(r.qty)}</N><N>{inr(r.refund_amount)}</N>
            <N>{r.reason ?? "—"}</N><N>{names.data?.get(r.created_by) ?? "—"}</N>
          </tr>
        ))}
      </Table>
    </div>
  );
}

/* ================= 10. EXPENSES ================= */

function ExpensesTab({ range }: { range: Range }) {
  const expenses = useExpenses(range);
  const rows = expenses.data ?? [];
  const total = rows.reduce((s, e) => s + Number(e.amount), 0);

  const byCat = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of rows) map.set(e.category, (map.get(e.category) ?? 0) + Number(e.amount));
    return Array.from(map.entries()).map(([name, value]) => ({ name, value: round2(value) })).sort((a, b) => b.value - a.value);
  }, [rows]);

  const byDay = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of rows) map.set(e.spent_on, (map.get(e.spent_on) ?? 0) + Number(e.amount));
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([date, value]) => ({ date, value: round2(value) }));
  }, [rows]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Kpi accent label="Total expenses" value={inr(total)} />
        <Kpi label="Entries" value={String(rows.length)} />
        <Kpi label="Largest category" value={byCat[0]?.name ?? "—"} sub={byCat[0] ? inr(byCat[0].value) : undefined} />
        <Card className="p-4 flex items-center">
          <Button asChild size="sm" variant="outline"><Link to="/expenses">Add / edit expenses</Link></Button>
        </Card>
      </div>
      <div className="grid lg:grid-cols-2 gap-4">
        <Card className="p-5">
          <h3 className="font-semibold mb-3">Expenses by category</h3>
          <div className="h-64">
            {byCat.length === 0 ? <Empty /> : (
              <ResponsiveContainer>
                <PieChart>
                  <Pie data={byCat} dataKey="value" nameKey="name" innerRadius={45} outerRadius={95}>
                    {byCat.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v: number) => inr(v)} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>
        <Card className="p-5">
          <h3 className="font-semibold mb-3">Expense trend</h3>
          <div className="h-64">
            {byDay.length === 0 ? <Empty /> : (
              <ResponsiveContainer>
                <BarChart data={byDay}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v: number) => inr(v)} />
                  <Bar dataKey="value" fill={PALETTE[3]} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>
      </div>
      <Table
        head={["Date", "Category", "Payee", "Mode", "Amount"]}
        exportCsv={() => downloadCSV(`expenses-${ymd(range.start)}.csv`, ["Date", "Category", "Payee", "Mode", "Amount"],
          rows.map((e) => [e.spent_on, e.category, e.payee ?? "", e.payment_mode, String(e.amount)]))}
      >
        {rows.map((e) => (
          <tr key={e.id}>
            <T>{e.spent_on}</T><N>{e.category}</N><N>{e.payee ?? "—"}</N>
            <N className="capitalize">{e.payment_mode}</N><N>{inr(e.amount)}</N>
          </tr>
        ))}
      </Table>
    </div>
  );
}

/* ================= 11. CUSTOMERS ================= */

function CustomersTab({ range, costing, isAdmin }: { range: Range; costing: "captured" | "average"; isAdmin: boolean }) {
  const { sales, costOf } = usePnl(range, costing);
  const rows = useMemo(() => {
    const map = new Map<string, { key: string; name: string; phone: string; bills: number; sales: number; cogs: number; credit: number }>();
    for (const s of sales.data ?? []) {
      const key = (s.customer_phone || s.customer_name || "walk-in").toLowerCase();
      const r = map.get(key) ?? { key, name: s.customer_name || "Walk-in", phone: s.customer_phone ?? "", bills: 0, sales: 0, cogs: 0, credit: 0 };
      r.bills++; r.sales += Number(s.grand_total); r.credit += Number(s.credit_amount);
      for (const it of s.sale_items ?? []) r.cogs += costOf(it) * Number(it.qty);
      map.set(key, r);
    }
    return Array.from(map.values()).map((r) => ({ ...r, profit: r.sales - r.cogs, avg: r.bills ? r.sales / r.bills : 0 }))
      .sort((a, b) => b.sales - a.sales);
  }, [sales.data, costOf]);

  const mask = (p: string) => (isAdmin ? p : p ? `${p.slice(0, 2)}••••${p.slice(-2)}` : "—");
  const repeat = rows.filter((r) => r.bills > 1).length;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Kpi accent label="Customers billed" value={String(rows.length)} />
        <Kpi label="Returning customers" value={String(repeat)} />
        <Kpi label="Average spend" value={inr(rows.length ? rows.reduce((s, r) => s + r.sales, 0) / rows.length : 0)} />
        <Kpi label="Outstanding credit" value={inr(rows.reduce((s, r) => s + r.credit, 0))} />
      </div>
      <Table head={["Customer", "Phone", "Bills", "Sales", "Avg spend", "Gross profit", "Credit due"]}>
        {rows.map((r) => (
          <tr key={r.key}>
            <T>{r.name}</T><N>{mask(r.phone)}</N><N>{r.bills}</N><N>{inr(r.sales)}</N>
            <N>{inr(r.avg)}</N><N>{inr(r.profit)}</N><N>{r.credit > 0 ? inr(r.credit) : "—"}</N>
          </tr>
        ))}
      </Table>
    </div>
  );
}

/* ================= 12. PURCHASES ================= */

function PurchasesTab({ range }: { range: Range }) {
  const purchases = usePurchases(range);
  const products = useProducts();
  const entries = purchases.data ?? [];
  const total = entries.reduce((s, e) => s + Number(e.total), 0);

  const bySupplier = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of entries) map.set(e.supplier || "Unknown", (map.get(e.supplier || "Unknown") ?? 0) + Number(e.total));
    return Array.from(map.entries()).map(([name, value]) => ({ name, value: round2(value) })).sort((a, b) => b.value - a.value);
  }, [entries]);

  const priceChanges = useMemo(() => {
    const pmap = new Map((products.data ?? []).map((p) => [p.id, p]));
    const latest = new Map<string, { name: string; first: number; last: number; when: string }>();
    for (const e of [...entries].sort((a, b) => a.created_at.localeCompare(b.created_at))) {
      for (const it of e.purchase_items ?? []) {
        if (!it.product_id) continue;
        const unit = Number(it.qty) > 0 ? Number(it.cost) : 0;
        if (!unit) continue;
        const cur = latest.get(it.product_id);
        if (!cur) latest.set(it.product_id, { name: pmap.get(it.product_id)?.name ?? it.name, first: unit, last: unit, when: e.created_at });
        else { cur.last = unit; cur.when = e.created_at; }
      }
    }
    return Array.from(latest.entries())
      .map(([id, v]) => {
        const p = pmap.get(id);
        const change = v.first > 0 ? ((v.last - v.first) / v.first) * 100 : 0;
        const sell = Number(p?.selling_price ?? 0);
        return { id, ...v, change, sell, margin: sell > 0 ? ((sell - v.last) / sell) * 100 : 0 };
      })
      .filter((r) => Math.abs(r.change) > 0.5)
      .sort((a, b) => b.change - a.change);
  }, [entries, products.data]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Kpi accent label="Total purchases" value={inr(total)} />
        <Kpi label="Entries" value={String(entries.length)} />
        <Kpi label="Suppliers" value={String(bySupplier.length)} />
        <Kpi label="Cost increases" value={String(priceChanges.filter((r) => r.change > 0).length)} tone={priceChanges.some((r) => r.change > 10) ? "down" : undefined} />
      </div>
      <div className="grid lg:grid-cols-2 gap-4">
        <Card className="p-5">
          <h3 className="font-semibold mb-3">Supplier-wise purchases</h3>
          <div className="h-64">
            {bySupplier.length === 0 ? <Empty /> : (
              <ResponsiveContainer>
                <BarChart data={bySupplier.slice(0, 12)}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} angle={-25} textAnchor="end" height={70} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v: number) => inr(v)} />
                  <Bar dataKey="value" fill={PALETTE[0]} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>
        <Table head={["Product", "Old cost", "New cost", "Change %", "Current margin %"]}>
          {priceChanges.map((r) => (
            <tr key={r.id} className={r.change > 10 ? "bg-destructive/5" : ""}>
              <T>{r.name}</T><N>{r.first.toFixed(2)}</N><N>{r.last.toFixed(2)}</N>
              <N><span className={r.change > 0 ? "text-destructive" : "text-primary"}>{r.change.toFixed(1)}%</span></N>
              <N>{r.margin.toFixed(1)}%</N>
            </tr>
          ))}
        </Table>
      </div>
    </div>
  );
}

/* ================= 13. INVENTORY ================= */

function InventoryTab() {
  const products = useProducts();
  const list = (products.data ?? []).filter((p) => p.is_active);
  const value = list.reduce((s, p) => s + Number(p.stock_qty) * Number(p.purchase_price), 0);
  const retail = list.reduce((s, p) => s + Number(p.stock_qty) * Number(p.selling_price), 0);
  const now = new Date();
  const soon = new Date(); soon.setDate(soon.getDate() + 30);
  const expired = list.filter((p) => p.expiry_date && new Date(p.expiry_date) < now);
  const nearExpiry = list.filter((p) => p.expiry_date && new Date(p.expiry_date) >= now && new Date(p.expiry_date) <= soon);
  const dead = list.filter((p) => Number(p.stock_qty) > 0 && (!p.last_sold_at || (now.getTime() - new Date(p.last_sold_at).getTime()) / 86400000 > 90));

  const byCat = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of list) {
      const c = p.categories?.name ?? "Other";
      map.set(c, (map.get(c) ?? 0) + Number(p.stock_qty) * Number(p.purchase_price));
    }
    return Array.from(map.entries()).map(([name, v]) => ({ name, value: round2(v) })).sort((a, b) => b.value - a.value);
  }, [list]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Kpi accent label="Inventory value (cost)" value={inr(value)} />
        <Kpi label="Retail value" value={inr(retail)} />
        <Kpi label="Profit held in stock" value={inr(retail - value)} />
        <Kpi label="Dead stock (90d+)" value={String(dead.length)} sub={inr(dead.reduce((s, p) => s + Number(p.stock_qty) * Number(p.purchase_price), 0))} />
        <Kpi label="Near expiry (30d)" value={String(nearExpiry.length)} />
        <Kpi label="Expired" value={String(expired.length)} tone={expired.length ? "down" : undefined} />
      </div>
      <Card className="p-5">
        <h3 className="font-semibold mb-3">Inventory value by category</h3>
        <div className="h-72">
          {byCat.length === 0 ? <Empty /> : (
            <ResponsiveContainer>
              <BarChart data={byCat}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} angle={-25} textAnchor="end" height={70} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v: number) => inr(v)} />
                <Bar dataKey="value" fill={PALETTE[2]} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </Card>
      <Table head={["Product", "Stock", "Cost value", "Retail value", "Expiry", "Last sold"]}>
        {[...list].sort((a, b) => Number(b.stock_qty) * Number(b.purchase_price) - Number(a.stock_qty) * Number(a.purchase_price)).slice(0, 200).map((p) => (
          <tr key={p.id}>
            <T>{p.name}</T><N>{Number(p.stock_qty)} {p.unit}</N>
            <N>{inr(Number(p.stock_qty) * Number(p.purchase_price))}</N>
            <N>{inr(Number(p.stock_qty) * Number(p.selling_price))}</N>
            <N>{p.expiry_date ?? "—"}</N>
            <N>{p.last_sold_at ? new Date(p.last_sold_at).toLocaleDateString("en-IN") : "Never"}</N>
          </tr>
        ))}
      </Table>
    </div>
  );
}

/* ================= 14. PROFIT LEAKS ================= */

function LeaksTab({ range, costing }: { range: Range; costing: "captured" | "average" }) {
  const rows = useProductRows(range, costing);
  const products = useProducts();
  const { summary } = usePnl(range, costing);
  const damages = useDamages(range);
  const [target, setTarget] = useState("15");
  const [open, setOpen] = useState<string | null>(null);

  const belowTarget = rows.filter((r) => r.qty > 0 && r.margin < Number(target || 0));
  const belowCost = rows.filter((r) => r.qty > 0 && r.profit < 0);
  const highReturns = rows.filter((r) => r.sales > 0 && r.returnsValue / r.sales > 0.1);
  const heavyDiscount = rows.filter((r) => r.sales > 0 && r.discount / r.sales > 0.1);
  const damageLoss = (damages.data ?? []).reduce((s, d) => s + Number(d.loss_value ?? 0), 0);
  const mispriced = (products.data ?? []).filter((p) => Number(p.selling_price) > 0 && Number(p.selling_price) < Number(p.purchase_price));

  const cards: Array<{ id: string; text: string; tone: "warn" | "bad"; rows: ProdRow[] | null }> = [
    { id: "target", text: `${belowTarget.length} products are selling below the ${target}% target margin.`, tone: "warn", rows: belowTarget },
    { id: "cost", text: `${belowCost.length} products were sold below cost in this period.`, tone: "bad", rows: belowCost },
    { id: "disc", text: `${inr(summary.discounts)} was given as discounts (${heavyDiscount.length} products discounted over 10%).`, tone: "warn", rows: heavyDiscount },
    { id: "ret", text: `${highReturns.length} products have a return rate above 10%.`, tone: "warn", rows: highReturns },
    { id: "dam", text: `${inr(damageLoss)} estimated loss from damaged/expired stock.`, tone: "bad", rows: null },
    { id: "price", text: `${mispriced.length} products have a selling price below their purchase price.`, tone: "bad", rows: null },
  ];

  return (
    <div className="space-y-4">
      <Card className="p-3 flex items-center gap-2 print:hidden">
        <span className="text-sm text-muted-foreground">Target gross margin %</span>
        <Input value={target} onChange={(e) => setTarget(e.target.value)} type="number" className="h-9 w-24" />
      </Card>
      <div className="grid sm:grid-cols-2 gap-3">
        {cards.map((c) => (
          <Card key={c.id} onClick={() => setOpen(open === c.id ? null : c.id)}
            className={`p-4 cursor-pointer text-sm flex items-start gap-3 ${c.tone === "bad" ? "border-destructive/40 bg-destructive/5" : "border-warning/40"}`}>
            <AlertTriangle className={`size-4 mt-0.5 ${c.tone === "bad" ? "text-destructive" : "text-muted-foreground"}`} />
            <span>{c.text}</span>
          </Card>
        ))}
      </div>
      {open === "price" ? (
        <Table head={["Product", "Cost", "Selling price", "Loss per unit"]}>
          {mispriced.map((p) => (
            <tr key={p.id}>
              <T>{p.name}</T><N>{Number(p.purchase_price).toFixed(2)}</N><N>{Number(p.selling_price).toFixed(2)}</N>
              <N><span className="text-destructive">{inr(Number(p.purchase_price) - Number(p.selling_price))}</span></N>
            </tr>
          ))}
        </Table>
      ) : open === "dam" ? (
        <Table head={["Date", "Qty", "Reason", "Loss value"]}>
          {(damages.data ?? []).map((d) => (
            <tr key={d.id}>
              <T>{new Date(d.created_at).toLocaleDateString("en-IN")}</T>
              <N>{Number(d.qty)}</N><N>{d.reason ?? "—"}</N><N>{inr(d.loss_value)}</N>
            </tr>
          ))}
        </Table>
      ) : open ? (
        <Table head={["Product", "Qty sold", "Sales", "COGS", "Profit", "Margin %", "Discount", "Returns"]}>
          {(cards.find((c) => c.id === open)?.rows ?? []).map((r) => (
            <tr key={r.id}>
              <T>{r.name}</T><N>{r.qty.toFixed(2)}</N><N>{inr(r.sales)}</N><N>{inr(r.cogs)}</N>
              <N><span className={r.profit >= 0 ? "" : "text-destructive"}>{inr(r.profit)}</span></N>
              <N>{r.margin.toFixed(1)}%</N><N>{inr(r.discount)}</N><N>{inr(r.returnsValue)}</N>
            </tr>
          ))}
        </Table>
      ) : (
        <Card className="p-4 text-xs text-muted-foreground">Tap any alert above to see the affected products or transactions.</Card>
      )}
    </div>
  );
}

/* ================= GST export (unchanged behaviour) ================= */

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
  const storeId = useStoreId();
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
        .select("id,bill_no,grand_total,tax_total,line_discount,bill_discount,payment_mode,customer_name,customer_phone,created_at")
        .eq("store_id", storeId)
        .gte("created_at", start.toISOString()).lte("created_at", end.toISOString())
        .order("created_at");
      if (error) throw error;
      exportGSTCSV((data ?? []) as unknown as Sale[], start, end);
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

function exportGSTCSV(bills: Sale[], start: Date, end: Date) {
  const header = ["Bill No", "Date", "Customer", "Phone", "Payment", "Discount", "Taxable", "GST", "Total"];
  const rows = bills.map((b) => {
    const total = Number(b.grand_total);
    const gst = Number(b.tax_total);
    const disc = Number(b.line_discount) + Number(b.bill_discount);
    return [b.bill_no, ymd(new Date(b.created_at)), b.customer_name ?? "", b.customer_phone ?? "", b.payment_mode, disc.toFixed(2), (total - gst).toFixed(2), gst.toFixed(2), total.toFixed(2)];
  });
  const tGst = bills.reduce((s, b) => s + Number(b.tax_total), 0);
  const tTax = bills.reduce((s, b) => s + Number(b.grand_total) - Number(b.tax_total), 0);
  const tTot = bills.reduce((s, b) => s + Number(b.grand_total), 0);
  rows.push(["TOTAL", "", "", "", "", "", tTax.toFixed(2), tGst.toFixed(2), tTot.toFixed(2)]);
  downloadCSV(`GST-${ymd(start)}_to_${ymd(end)}.csv`, header, rows);
}

/* re-exported for tabs that need typed products */
export type { Prod, Summary };
