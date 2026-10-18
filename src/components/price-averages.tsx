import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useStoreId } from "@/lib/active-store";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { inr } from "@/lib/format";
import { downloadCSV, type Range } from "@/lib/analytics";
import { periodKey, type Period } from "@/lib/price-periods";

type Row = { key: string; product: string; period: string; buyQty: number; buyAmt: number; sellQty: number; sellAmt: number };

export function PriceAveragesTab({ range }: { range: Range }) {
  const storeId = useStoreId();
  const [period, setPeriod] = useState<Period>("month");
  const [search, setSearch] = useState("");
  const startIso = range.start.toISOString(), endIso = range.end.toISOString();

  const q = useQuery({
    queryKey: ["price-avg", storeId, startIso, endIso],
    queryFn: async () => {
      const [pur, sal] = await Promise.all([
        supabase.from("purchase_entries").select("created_at,purchase_items(product_id,name,qty,cost)")
          .eq("store_id", storeId).gte("created_at", startIso).lte("created_at", endIso),
        supabase.from("sales").select("created_at,sale_items(product_id,name,qty,unit_price)")
          .eq("store_id", storeId).neq("status", "void").gte("created_at", startIso).lte("created_at", endIso),
      ]);
      if (pur.error) throw pur.error;
      if (sal.error) throw sal.error;
      return { pur: pur.data ?? [], sal: sal.data ?? [] };
    },
  });

  const rows = useMemo(() => {
    const map = new Map<string, Row>();
    const get = (pid: string | null, name: string, at: string) => {
      const per = periodKey(new Date(at), period);
      const k = `${pid ?? name}|${per}`;
      let r = map.get(k);
      if (!r) { r = { key: k, product: name, period: per, buyQty: 0, buyAmt: 0, sellQty: 0, sellAmt: 0 }; map.set(k, r); }
      return r;
    };
    for (const e of q.data?.pur ?? []) for (const it of (e.purchase_items ?? []) as Array<{ product_id: string | null; name: string; qty: number; cost: number }>) {
      const r = get(it.product_id, it.name, e.created_at); r.buyQty += Number(it.qty); r.buyAmt += Number(it.qty) * Number(it.cost);
    }
    for (const s of q.data?.sal ?? []) for (const it of (s.sale_items ?? []) as Array<{ product_id: string | null; name: string; qty: number; unit_price: number }>) {
      const r = get(it.product_id, it.name.replace(/\s*\([\d.]+kg\)$/, ""), s.created_at); r.sellQty += Number(it.qty); r.sellAmt += Number(it.qty) * Number(it.unit_price);
    }
    const t = search.trim().toLowerCase();
    return [...map.values()].filter((r) => !t || r.product.toLowerCase().includes(t))
      .sort((a, b) => b.period.localeCompare(a.period) || a.product.localeCompare(b.product));
  }, [q.data, period, search]);

  const avg = (amt: number, qty: number) => (qty > 0 ? amt / qty : 0);

  return (
    <div className="space-y-4">
      <Card className="p-3 flex flex-wrap gap-2 items-center">
        {(["day", "week", "month", "year"] as Period[]).map((p) => (
          <Button key={p} size="sm" variant={period === p ? "default" : "outline"} onClick={() => setPeriod(p)} className="capitalize">{p === "day" ? "Daily" : p === "week" ? "Weekly" : p === "month" ? "Monthly" : "Yearly"}</Button>
        ))}
        <Input placeholder="Search product…" value={search} onChange={(e) => setSearch(e.target.value)} className="w-56 ml-auto" />
        <Button size="sm" variant="outline" onClick={() => downloadCSV("price-averages.csv",
          ["Period", "Product", "Qty bought", "Avg buying price", "Qty sold", "Avg selling price", "Margin / unit"],
          rows.map((r) => [r.period, r.product, r.buyQty.toFixed(3), avg(r.buyAmt, r.buyQty).toFixed(2), r.sellQty.toFixed(3), avg(r.sellAmt, r.sellQty).toFixed(2),
            (r.buyQty && r.sellQty ? avg(r.sellAmt, r.sellQty) - avg(r.buyAmt, r.buyQty) : 0).toFixed(2)]))}>Export CSV</Button>
      </Card>
      <Card className="p-0 overflow-hidden">
        {q.isLoading ? <div className="p-8 text-center text-sm text-muted-foreground">Loading…</div>
          : !rows.length ? <div className="p-8 text-center text-sm text-muted-foreground">No purchases or sales in this range.</div> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left"><tr>
                <th className="px-4 py-2.5">Period</th><th className="px-4 py-2.5">Product</th>
                <th className="px-4 py-2.5 text-right">Qty bought</th><th className="px-4 py-2.5 text-right">Avg buying price</th>
                <th className="px-4 py-2.5 text-right">Qty sold</th><th className="px-4 py-2.5 text-right">Avg selling price</th>
                <th className="px-4 py-2.5 text-right">Margin / unit</th>
              </tr></thead>
              <tbody className="divide-y">{rows.map((r) => {
                const b = avg(r.buyAmt, r.buyQty), s = avg(r.sellAmt, r.sellQty);
                return (
                  <tr key={r.key}>
                    <td className="px-4 py-2.5 font-mono text-xs">{r.period}</td>
                    <td className="px-4 py-2.5">{r.product}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{r.buyQty ? r.buyQty.toFixed(2) : "—"}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{r.buyQty ? inr(b) : "—"}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{r.sellQty ? r.sellQty.toFixed(2) : "—"}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{r.sellQty ? inr(s) : "—"}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{r.buyQty && r.sellQty ? inr(s - b) : "—"}</td>
                  </tr>
                );
              })}</tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
