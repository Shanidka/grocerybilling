import { createFileRoute, Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { inr } from "@/lib/format";
import { ScanBarcode, AlertTriangle, CalendarClock, IndianRupee, Receipt, ArrowDownCircle, ArrowUpCircle } from "lucide-react";

export const Route = createFileRoute("/_authenticated/dashboard")({
  ssr: false,
  component: Dashboard,
  head: () => ({ meta: [{ title: "Dashboard — Bazaar POS" }] }),
});

function Dashboard() {
  const start = new Date(); start.setHours(0, 0, 0, 0);
  const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);

  const today = useQuery({
    queryKey: ["dash-today"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales").select("grand_total")
        .gte("created_at", start.toISOString());
      if (error) throw error;
      const total = (data ?? []).reduce((s, r) => s + Number(r.grand_total), 0);
      return { total, count: data?.length ?? 0 };
    },
  });

  const month = useQuery({
    queryKey: ["dash-month"],
    queryFn: async () => {
      const { data, error } = await supabase.from("sales").select("grand_total")
        .gte("created_at", monthStart.toISOString());
      if (error) throw error;
      return { total: (data ?? []).reduce((s, r) => s + Number(r.grand_total), 0), count: data?.length ?? 0 };
    },
  });

  // Money OUT today: purchases + damage loss + refunds
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

  const lowStock = useQuery({
    queryKey: ["dash-low"],
    queryFn: async () => {
      const { data, error } = await supabase.from("products")
        .select("id,name,stock_qty,min_qty,max_qty,unit").eq("is_active", true);
      if (error) throw error;
      return (data ?? []).filter((p) => Number(p.stock_qty) <= Number(p.min_qty) && Number(p.min_qty) > 0);
    },
    refetchInterval: 2 * 60 * 60 * 1000,
  });

  const expiring = useQuery({
    queryKey: ["dash-expiring"],
    queryFn: async () => {
      const in30 = new Date(); in30.setDate(in30.getDate() + 30);
      const { data, error } = await supabase.from("products")
        .select("id,name,expiry_date,stock_qty,unit").eq("is_active", true)
        .not("expiry_date", "is", null).lte("expiry_date", in30.toISOString().slice(0, 10));
      if (error) throw error;
      return data ?? [];
    },
  });

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
            <Link to="/alerts"><AlertTriangle className="size-4" /> Alerts {lowStock.data?.length ? `(${lowStock.data.length})` : ""}</Link>
          </Button>
          <Button asChild size="lg" className="h-11">
            <Link to="/billing"><ScanBarcode className="size-4" /> New bill</Link>
          </Button>
        </div>
      </div>

      {/* Money in / out */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat icon={ArrowDownCircle} label="Money IN today" value={inr(today.data?.total ?? 0)} sub={`${today.data?.count ?? 0} bills`} tone="primary" />
        <Stat icon={ArrowUpCircle} label="Money OUT today" value={inr(moneyOut.data?.total ?? 0)} sub={`Purch ${inr(moneyOut.data?.purchases ?? 0)} · Loss ${inr(moneyOut.data?.damage ?? 0)} · Refund ${inr(moneyOut.data?.refunds ?? 0)}`} tone="warning" />
        <Stat icon={IndianRupee} label="Net today" value={inr(netToday)} sub={netToday >= 0 ? "Positive" : "Negative"} />
        <Stat icon={Receipt} label="This month" value={inr(month.data?.total ?? 0)} sub={`${month.data?.count ?? 0} bills`} />
      </div>

      {/* Alerts tabs */}
      <Card className="p-4">
        <Tabs defaultValue="low">
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <TabsList>
              <TabsTrigger value="low">
                <AlertTriangle className="size-3.5" /> Below minimum ({lowStock.data?.length ?? 0})
              </TabsTrigger>
              <TabsTrigger value="exp">
                <CalendarClock className="size-3.5" /> About to expire ({expiring.data?.length ?? 0})
              </TabsTrigger>
            </TabsList>
            <Button asChild variant="ghost" size="sm"><Link to="/alerts">Open Alerts →</Link></Button>
          </div>

          <TabsContent value="low">
            {!lowStock.data?.length ? <Empty msg="All products are above minimum." /> : (
              <ul className="divide-y">
                {lowStock.data.slice(0, 10).map((p) => (
                  <li key={p.id} className="py-2.5 flex items-center justify-between text-sm">
                    <span className="truncate">{p.name}</span>
                    <div className="flex gap-4 items-center">
                      <span className="text-warning font-medium">{Number(p.stock_qty)} / min {Number(p.min_qty)}</span>
                      <span className="text-xs text-muted-foreground">need {Math.max(0, Number(p.max_qty) - Number(p.stock_qty))} {p.unit}</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </TabsContent>

          <TabsContent value="exp">
            {!expiring.data?.length ? <Empty msg="Nothing expiring in the next 30 days." /> : (
              <ul className="divide-y">
                {expiring.data.slice(0, 10).map((p) => (
                  <li key={p.id} className="py-2.5 flex items-center justify-between text-sm">
                    <span className="truncate">{p.name}</span>
                    <span className="text-muted-foreground">exp {p.expiry_date} · {Number(p.stock_qty)} {p.unit}</span>
                  </li>
                ))}
              </ul>
            )}
          </TabsContent>
        </Tabs>
      </Card>
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

function Empty({ msg }: { msg: string }) {
  return <div className="text-sm text-muted-foreground py-6 text-center">{msg}</div>;
}
