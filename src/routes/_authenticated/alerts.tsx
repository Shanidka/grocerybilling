import { createFileRoute } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useStoreId } from "@/lib/active-store";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertTriangle, CalendarClock, PackageX } from "lucide-react";
import { inr } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/alerts")({
  ssr: false,
  component: AlertsPage,
  head: () => ({ meta: [{ title: "Alerts — Bazaar POS" }] }),
});

type ExpiryBucket = "expired" | "7d" | "30d" | "90d" | "all";

function AlertsPage() {
  const storeId = useStoreId();
  const q = useQuery({
    queryKey: ["alerts-products", storeId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id,name,brand,stock_qty,min_qty,max_qty,expiry_date,last_sold_at,selling_price,unit")
        .eq("store_id", storeId)
        .eq("is_active", true);
      if (error) throw error;
      return data ?? [];
    },
    refetchInterval: 2 * 60 * 60 * 1000, // 2 hours
  });

  const products = q.data ?? [];
  const today = new Date();
  const dead = new Date(); dead.setDate(today.getDate() - 60);

  const low = products.filter((p) => Number(p.min_qty) > 0 && Number(p.stock_qty) <= Number(p.min_qty));
  const deadStock = products.filter((p) => Number(p.stock_qty) > 0 && (!p.last_sold_at || new Date(p.last_sold_at) <= dead));

  const [bucket, setBucket] = useState<ExpiryBucket>("30d");
  const expiring = useMemo(() => {
    return products
      .filter((p) => p.expiry_date)
      .map((p) => ({ ...p, days: Math.ceil((new Date(p.expiry_date!).getTime() - today.getTime()) / 86400000) }))
      .filter((p) => {
        if (bucket === "expired") return p.days < 0;
        if (bucket === "7d") return p.days >= 0 && p.days <= 7;
        if (bucket === "30d") return p.days >= 0 && p.days <= 30;
        if (bucket === "90d") return p.days >= 0 && p.days <= 90;
        return true;
      })
      .sort((a, b) => a.days - b.days);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [products, bucket]);

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-6xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Alerts</h1>
        <p className="text-sm text-muted-foreground">Auto-refresh every 2 hours. Click a range to drill into expiry.</p>
      </div>

      <div className="grid sm:grid-cols-3 gap-4">
        <StatCard icon={AlertTriangle} label="Low stock" count={low.length} tone="warning" />
        <StatCard icon={CalendarClock} label="Expiring ≤ 30 days" count={products.filter(p => p.expiry_date && (new Date(p.expiry_date).getTime() - today.getTime())/86400000 <= 30 && (new Date(p.expiry_date).getTime() - today.getTime())/86400000 >= 0).length} tone="warning" />
        <StatCard icon={PackageX} label="Dead stock (60d)" count={deadStock.length} tone="danger" />
      </div>

      <Tabs defaultValue="low">
        <TabsList>
          <TabsTrigger value="low">Low stock ({low.length})</TabsTrigger>
          <TabsTrigger value="expiring">Expiry</TabsTrigger>
          <TabsTrigger value="dead">Dead stock ({deadStock.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="low">
          <Card className="p-0 overflow-hidden">
            <Table
              headers={["Product", "Stock", "Min", "Reorder to Max", "Price"]}
              rows={low.map((p) => [
                <div key="n"><div className="font-medium">{p.name}</div>{p.brand && <div className="text-xs text-muted-foreground">{p.brand}</div>}</div>,
                <span className="text-warning font-semibold">{Number(p.stock_qty)} {p.unit}</span>,
                <>{Number(p.min_qty)}</>,
                <>{Math.max(0, Number(p.max_qty) - Number(p.stock_qty))} {p.unit}</>,
                inr(p.selling_price),
              ])}
              empty="All products above minimum stock."
            />
          </Card>
        </TabsContent>

        <TabsContent value="expiring" className="space-y-4">
          <div className="flex gap-2 flex-wrap">
            {([
              ["expired", "Already expired"],
              ["7d", "Next 7 days"],
              ["30d", "Next 30 days"],
              ["90d", "Next 90 days"],
              ["all", "All with expiry"],
            ] as [ExpiryBucket, string][]).map(([k, label]) => (
              <Button key={k} size="sm" variant={bucket === k ? "default" : "outline"} onClick={() => setBucket(k)}>{label}</Button>
            ))}
          </div>
          <Card className="p-0 overflow-hidden">
            <Table
              headers={["Product", "Expiry", "Days", "Stock", "Value"]}
              rows={expiring.map((p) => [
                <div key="n"><div className="font-medium">{p.name}</div>{p.brand && <div className="text-xs text-muted-foreground">{p.brand}</div>}</div>,
                <>{p.expiry_date}</>,
                <Badge variant={p.days < 0 || p.days <= 7 ? "destructive" : "secondary"}>{p.days < 0 ? `expired ${-p.days}d ago` : `${p.days}d left`}</Badge>,
                <>{Number(p.stock_qty)} {p.unit}</>,
                inr(Number(p.stock_qty) * Number(p.selling_price)),
              ])}
              empty="Nothing in this range."
            />
          </Card>
        </TabsContent>

        <TabsContent value="dead">
          <Card className="p-0 overflow-hidden">
            <Table
              headers={["Product", "Stock", "Last sold", "Value locked"]}
              rows={deadStock.map((p) => [
                <div key="n"><div className="font-medium">{p.name}</div>{p.brand && <div className="text-xs text-muted-foreground">{p.brand}</div>}</div>,
                <>{Number(p.stock_qty)} {p.unit}</>,
                <span className="text-muted-foreground">{p.last_sold_at ? new Date(p.last_sold_at).toLocaleDateString("en-IN") : "never"}</span>,
                inr(Number(p.stock_qty) * Number(p.selling_price)),
              ])}
              empty="No dead stock — everything is moving."
            />
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function StatCard({ icon: Icon, label, count, tone }: { icon: React.ComponentType<{ className?: string }>; label: string; count: number; tone: "warning" | "danger" }) {
  const bg = tone === "danger" ? "bg-destructive/10 text-destructive" : "bg-warning/15 text-warning";
  return (
    <Card className="p-5">
      <div className={`size-10 rounded-xl grid place-items-center ${bg}`}><Icon className="size-5" /></div>
      <div className="mt-4 text-3xl font-semibold tracking-tight">{count}</div>
      <div className="text-sm text-muted-foreground">{label}</div>
    </Card>
  );
}

function Table({ headers, rows, empty }: { headers: string[]; rows: React.ReactNode[][]; empty: string }) {
  if (!rows.length) return <div className="p-8 text-center text-sm text-muted-foreground">{empty}</div>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-left">
          <tr>{headers.map((h) => <th key={h} className="px-4 py-2.5 font-medium text-muted-foreground">{h}</th>)}</tr>
        </thead>
        <tbody className="divide-y">
          {rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j} className="px-4 py-3">{c}</td>)}</tr>)}
        </tbody>
      </table>
    </div>
  );
}
