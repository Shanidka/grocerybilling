import { createFileRoute, Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { inr } from "@/lib/format";
import { ScanBarcode, AlertTriangle, IndianRupee, Receipt, ArrowDownCircle, ArrowUpCircle, Boxes } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar, CartesianGrid } from "recharts";
import { useMyRoles, canManage } from "@/hooks/use-role";

export const Route = createFileRoute("/_authenticated/dashboard")({
  ssr: false,
  component: Dashboard,
  head: () => ({ meta: [{ title: "Dashboard — Bazaar POS" }] }),
});

function Dashboard() {
  const { data: roles } = useMyRoles();
  const showCharts = canManage(roles);
  const start = new Date(); start.setHours(0, 0, 0, 0);
  const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
  const trendStart = new Date(); trendStart.setDate(trendStart.getDate() - 29); trendStart.setHours(0, 0, 0, 0);

  const today = useQuery({
    queryKey: ["dash-today"],
    queryFn: async () => {
      const { data, error } = await supabase.from("sales").select("grand_total").gte("created_at", start.toISOString());
      if (error) throw error;
      return { total: (data ?? []).reduce((s, r) => s + Number(r.grand_total), 0), count: data?.length ?? 0 };
    },
  });

  const month = useQuery({
    queryKey: ["dash-month"],
    queryFn: async () => {
      const { data, error } = await supabase.from("sales").select("grand_total").gte("created_at", monthStart.toISOString());
      if (error) throw error;
      return { total: (data ?? []).reduce((s, r) => s + Number(r.grand_total), 0), count: data?.length ?? 0 };
    },
  });

  const moneyOut = useQuery({
    queryKey: ["dash-moneyout"],
    queryFn: async () => {
      const [pur, dam, ret] = await Promise.all([
        supabase.from("purchase_entries").select("total").gte("created_at", start.toISOString()),
        supabase.from("damaged_products").select("loss_value").gte("created_at", start.toISOString()),
        supabase.from("product_returns").select("refund_amount").gte("created_at", start.toISOString()),
      ]);
      const purTot = (pur.data ?? []).reduce((s, r) => s + Number(r.total ?? 0), 0);
      const damTot = (dam.data ?? []).reduce((s, r) => s + Number(r.loss_value ?? 0), 0);
      const retTot = (ret.data ?? []).reduce((s, r) => s + Number(r.refund_amount ?? 0), 0);
      return { purchases: purTot, damage: damTot, refunds: retTot, total: purTot + damTot + retTot };
    },
  });

  const lowStockCount = useQuery({
    queryKey: ["dash-low-count"],
    queryFn: async () => {
      const { data, error } = await supabase.from("products").select("stock_qty,min_qty").eq("is_active", true);
      if (error) throw error;
      return (data ?? []).filter((p) => Number(p.stock_qty) <= Number(p.min_qty) && Number(p.min_qty) > 0).length;
    },
    refetchInterval: 2 * 60 * 60 * 1000,
  });

  const trend = useQuery({
    enabled: showCharts,
    queryKey: ["dash-trend-30d"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales").select("grand_total,created_at,sale_items(name,qty,line_total)")
        .gte("created_at", trendStart.toISOString());
      if (error) throw error;
      return data ?? [];
    },
  });

  const trendSeries = useMemo(() => {
    const rows = trend.data ?? [];
    const map = new Map<string, number>();
    for (let i = 0; i < 30; i++) {
      const d = new Date(trendStart); d.setDate(d.getDate() + i);
      map.set(d.toISOString().slice(0, 10), 0);
    }
    for (const r of rows) {
      const k = new Date(r.created_at).toISOString().slice(0, 10);
      map.set(k, (map.get(k) ?? 0) + Number(r.grand_total));
    }
    return Array.from(map.entries()).map(([date, total]) => ({ date: date.slice(5), total: Math.round(total) }));
  }, [trend.data]);

  const topProducts = useMemo(() => {
    const map = new Map<string, { name: string; revenue: number }>();
    for (const s of trend.data ?? []) {
      for (const it of (s.sale_items ?? []) as Array<{ name: string; line_total: number | string }>) {
        const cur = map.get(it.name) ?? { name: it.name, revenue: 0 };
        cur.revenue += Number(it.line_total);
        map.set(it.name, cur);
      }
    }
    return Array.from(map.values()).sort((a, b) => b.revenue - a.revenue).slice(0, 8);
  }, [trend.data]);

  const netToday = (today.data?.total ?? 0) - (moneyOut.data?.total ?? 0);

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-7xl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground">Snapshot of your store today.</p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline" className="h-11">
            <Link to="/alerts"><AlertTriangle className="size-4" /> Alerts{lowStockCount.data ? ` (${lowStockCount.data})` : ""}</Link>
          </Button>
          <Button asChild variant="outline" className="h-11">
            <Link to="/inventory"><Boxes className="size-4" /> Inventory</Link>
          </Button>
          <Button asChild size="lg" className="h-11">
            <Link to="/billing"><ScanBarcode className="size-4" /> New bill</Link>
          </Button>
        </div>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat icon={ArrowDownCircle} label="Money IN today" value={inr(today.data?.total ?? 0)} sub={`${today.data?.count ?? 0} bills`} tone="primary" />
        <Stat icon={ArrowUpCircle} label="Money OUT today" value={inr(moneyOut.data?.total ?? 0)} sub={`Purch ${inr(moneyOut.data?.purchases ?? 0)} · Loss ${inr(moneyOut.data?.damage ?? 0)} · Refund ${inr(moneyOut.data?.refunds ?? 0)}`} tone="warning" />
        <Stat icon={IndianRupee} label="Net today" value={inr(netToday)} sub={netToday >= 0 ? "Positive" : "Negative"} />
        <Stat icon={Receipt} label="This month" value={inr(month.data?.total ?? 0)} sub={`${month.data?.count ?? 0} bills`} />
      </div>

      {showCharts && (
        <div className="grid lg:grid-cols-2 gap-4">
          <Card className="p-5">
            <h3 className="font-semibold mb-3">Sales — last 30 days</h3>
            <div className="h-64">
              <ResponsiveContainer>
                <LineChart data={trendSeries}>
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
            <h3 className="font-semibold mb-3">Top products — 30d</h3>
            <div className="h-64">
              <ResponsiveContainer>
                <BarChart data={topProducts}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} angle={-25} textAnchor="end" height={60} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v: number) => inr(v)} />
                  <Bar dataKey="revenue" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

function Stat({ icon: Icon, label, value, sub, tone }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string; sub: string; tone?: "primary" | "warning" }) {
  const toneBg = tone === "primary" ? "bg-primary text-primary-foreground" : tone === "warning" ? "bg-warning text-warning-foreground" : "bg-secondary text-secondary-foreground";
  return (
    <Card className="p-5">
      <div className={`size-10 rounded-xl grid place-items-center ${toneBg}`}><Icon className="size-5" /></div>
      <div className="mt-4 text-2xl font-semibold tracking-tight">{value}</div>
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className="text-xs text-muted-foreground/70 mt-0.5 truncate">{sub}</div>
    </Card>
  );
}
