import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { AlertTriangle, IndianRupee, Package, Receipt, ArrowRight } from "lucide-react";
import { inr, num } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: Dashboard,
  head: () => ({ meta: [{ title: "Dashboard — FreshMart POS" }] }),
});

function Dashboard() {
  const stats = useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: async () => {
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const [salesToday, lowStock, productCount, recentSales] = await Promise.all([
        supabase.from("sales").select("grand_total").gte("created_at", today.toISOString()),
        supabase.from("products").select("id,name,stock_qty,min_qty,unit").eq("active", true),
        supabase.from("products").select("id", { count: "exact", head: true }).eq("active", true),
        supabase.from("sales").select("id,bill_no,grand_total,created_at,payment_mode").order("created_at", { ascending: false }).limit(6),
      ]);
      const todayTotal = (salesToday.data ?? []).reduce((s, r) => s + Number(r.grand_total), 0);
      const todayCount = salesToday.data?.length ?? 0;
      const low = (lowStock.data ?? []).filter((p) => Number(p.stock_qty) <= Number(p.min_qty));
      return {
        todayTotal,
        todayCount,
        productCount: productCount.count ?? 0,
        low,
        recentSales: recentSales.data ?? [],
      };
    },
    refetchInterval: 30000,
  });

  const s = stats.data;

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-semibold">Dashboard</h1>
        <p className="text-muted-foreground text-sm">Today at a glance</p>
      </div>

      {s && s.low.length > 0 && (
        <div className="rounded-xl border border-warning/40 bg-warning/15 p-4 flex items-start gap-3">
          <AlertTriangle className="size-5 text-warning-foreground shrink-0 mt-0.5" />
          <div className="flex-1">
            <div className="font-medium text-warning-foreground">
              {s.low.length} product{s.low.length > 1 ? "s" : ""} at or below minimum stock
            </div>
            <div className="text-sm text-warning-foreground/80 mt-1">
              Reorder soon — these will be auto-drafted once the distributor app is connected.
            </div>
          </div>
          <Link to="/products" className="text-sm font-medium text-warning-foreground hover:underline flex items-center gap-1">
            Review <ArrowRight className="size-3.5" />
          </Link>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard label="Today's sales" value={inr(s?.todayTotal ?? 0)} icon={IndianRupee} hint={`${s?.todayCount ?? 0} bills`} />
        <StatCard label="Active products" value={num(s?.productCount ?? 0, 0)} icon={Package} />
        <StatCard label="Low stock items" value={num(s?.low.length ?? 0, 0)} icon={AlertTriangle} tone={s && s.low.length > 0 ? "warn" : "default"} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold">Low stock alerts</h2>
            <Link to="/products" className="text-xs text-primary hover:underline">Manage products</Link>
          </div>
          {!s?.low.length ? (
            <p className="text-sm text-muted-foreground">All stocked up. </p>
          ) : (
            <ul className="divide-y">
              {s.low.slice(0, 8).map((p) => (
                <li key={p.id} className="py-2.5 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-medium truncate">{p.name}</div>
                    <div className="text-xs text-muted-foreground">
                      Stock {num(p.stock_qty)} {p.unit} · min {num(p.min_qty)} {p.unit}
                    </div>
                  </div>
                  <span className="text-xs px-2 py-1 rounded-md bg-warning/20 text-warning-foreground font-medium">
                    Reorder
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold">Recent bills</h2>
            <Link to="/sales" className="text-xs text-primary hover:underline flex items-center gap-1"><Receipt className="size-3.5" /> All sales</Link>
          </div>
          {!s?.recentSales.length ? (
            <p className="text-sm text-muted-foreground">No sales yet.</p>
          ) : (
            <ul className="divide-y">
              {s.recentSales.map((b) => (
                <li key={b.id} className="py-2.5 flex items-center justify-between text-sm">
                  <div>
                    <div className="font-medium">{b.bill_no}</div>
                    <div className="text-xs text-muted-foreground">{new Date(b.created_at).toLocaleString("en-IN")}</div>
                  </div>
                  <div className="text-right">
                    <div className="font-semibold">{inr(b.grand_total)}</div>
                    <div className="text-xs text-muted-foreground capitalize">{b.payment_mode}</div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}

function StatCard({
  label, value, hint, icon: Icon, tone = "default",
}: {
  label: string; value: string; hint?: string;
  icon: React.ComponentType<{ className?: string }>;
  tone?: "default" | "warn";
}) {
  return (
    <Card className="p-5 flex items-center gap-4 shadow-soft">
      <div className={`size-11 rounded-lg grid place-items-center ${tone === "warn" ? "bg-warning/20 text-warning-foreground" : "bg-primary/10 text-primary"}`}>
        <Icon className="size-5" />
      </div>
      <div>
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="text-2xl font-semibold leading-tight">{value}</div>
        {hint && <div className="text-xs text-muted-foreground mt-0.5">{hint}</div>}
      </div>
    </Card>
  );
}
