import { createFileRoute, Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { inr } from "@/lib/format";
import { ScanBarcode, AlertTriangle, CalendarClock, Boxes, IndianRupee, Receipt } from "lucide-react";

export const Route = createFileRoute("/_authenticated/dashboard")({
  ssr: false,
  component: Dashboard,
  head: () => ({ meta: [{ title: "Dashboard — Bazaar POS" }] }),
});

function Dashboard() {
  const today = useQuery({
    queryKey: ["dash-today"],
    queryFn: async () => {
      const start = new Date(); start.setHours(0, 0, 0, 0);
      const { data, error } = await supabase
        .from("sales")
        .select("grand_total")
        .gte("created_at", start.toISOString());
      if (error) throw error;
      const total = (data ?? []).reduce((s, r) => s + Number(r.grand_total), 0);
      return { total, count: data?.length ?? 0 };
    },
  });

  const month = useQuery({
    queryKey: ["dash-month"],
    queryFn: async () => {
      const start = new Date(); start.setDate(1); start.setHours(0, 0, 0, 0);
      const { data, error } = await supabase
        .from("sales")
        .select("grand_total")
        .gte("created_at", start.toISOString());
      if (error) throw error;
      const total = (data ?? []).reduce((s, r) => s + Number(r.grand_total), 0);
      return { total, count: data?.length ?? 0 };
    },
  });

  const lowStock = useQuery({
    queryKey: ["dash-low"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id,name,stock_qty,min_qty")
        .eq("is_active", true);
      if (error) throw error;
      return (data ?? []).filter((p) => Number(p.stock_qty) <= Number(p.min_qty) && Number(p.min_qty) > 0);
    },
  });

  const expiring = useQuery({
    queryKey: ["dash-expiring"],
    queryFn: async () => {
      const in30 = new Date(); in30.setDate(in30.getDate() + 30);
      const { data, error } = await supabase
        .from("products")
        .select("id,name,expiry_date,stock_qty")
        .eq("is_active", true)
        .not("expiry_date", "is", null)
        .lte("expiry_date", in30.toISOString().slice(0, 10));
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-7xl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground">Quick snapshot of your store today.</p>
        </div>
        <Button asChild size="lg" className="h-11">
          <Link to="/billing"><ScanBarcode className="size-4" /> New bill</Link>
        </Button>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat icon={IndianRupee} label="Today's sales" value={inr(today.data?.total ?? 0)} sub={`${today.data?.count ?? 0} bills`} tone="primary" />
        <Stat icon={Receipt} label="This month" value={inr(month.data?.total ?? 0)} sub={`${month.data?.count ?? 0} bills`} />
        <Stat icon={AlertTriangle} label="Low stock" value={String(lowStock.data?.length ?? 0)} sub="products to reorder" tone="warning" />
        <Stat icon={CalendarClock} label="Expiring ≤ 30d" value={String(expiring.data?.length ?? 0)} sub="check before sale" tone="warning" />
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <Card className="p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold">Low stock alerts</h3>
            <span className="text-xs text-muted-foreground">{lowStock.data?.length ?? 0} items</span>
          </div>
          {!lowStock.data?.length ? (
            <Empty msg="All products are above their minimum stock." />
          ) : (
            <ul className="divide-y">
              {lowStock.data.slice(0, 8).map((p) => (
                <li key={p.id} className="py-2 flex items-center justify-between text-sm">
                  <span className="truncate">{p.name}</span>
                  <span className="text-warning font-medium">{Number(p.stock_qty)} / min {Number(p.min_qty)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold">Expiring soon</h3>
            <span className="text-xs text-muted-foreground">next 30 days</span>
          </div>
          {!expiring.data?.length ? (
            <Empty msg="Nothing expiring in the next 30 days." />
          ) : (
            <ul className="divide-y">
              {expiring.data.slice(0, 8).map((p) => (
                <li key={p.id} className="py-2 flex items-center justify-between text-sm">
                  <span className="truncate">{p.name}</span>
                  <span className="text-muted-foreground">exp {p.expiry_date}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card className="p-5">
        <div className="flex items-start gap-3">
          <div className="size-9 rounded-lg bg-accent grid place-items-center"><Boxes className="size-4 text-accent-foreground" /></div>
          <div>
            <div className="font-medium">More modules are coming next.</div>
            <div className="text-sm text-muted-foreground">Products, Inventory, Reports, Expiry tab, Dead stock tab — we'll build them screen by screen.</div>
          </div>
        </div>
      </Card>
    </div>
  );
}

function Stat({ icon: Icon, label, value, sub, tone }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string; sub: string; tone?: "primary" | "warning" }) {
  const toneBg = tone === "primary" ? "bg-primary text-primary-foreground" : tone === "warning" ? "bg-warning text-warning-foreground" : "bg-secondary text-secondary-foreground";
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between">
        <div className={`size-10 rounded-xl grid place-items-center ${toneBg}`}><Icon className="size-5" /></div>
      </div>
      <div className="mt-4 text-2xl font-semibold tracking-tight">{value}</div>
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className="text-xs text-muted-foreground/70 mt-0.5">{sub}</div>
    </Card>
  );
}

function Empty({ msg }: { msg: string }) {
  return <div className="text-sm text-muted-foreground py-6 text-center">{msg}</div>;
}
