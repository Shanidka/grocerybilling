import { createFileRoute } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useStoreId } from "@/lib/active-store";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { inr, dt } from "@/lib/format";
import { HandCoins, Phone, ChevronDown } from "lucide-react";

export const Route = createFileRoute("/_authenticated/credit")({
  ssr: false,
  component: CreditPage,
  head: () => ({
    meta: [
      { title: "Credit Customers — outstanding dues | Bazaar POS" },
      { name: "description", content: "See which customers owe money, how much is outstanding and which bills the credit came from." },
      { property: "og:title", content: "Credit Customers — outstanding dues | Bazaar POS" },
      { property: "og:description", content: "Customer-wise outstanding credit with the bills behind it." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function CreditPage() {
  const storeId = useStoreId();
  const [q, setQ] = useState("");
  const [openKey, setOpenKey] = useState<string | null>(null);

  const list = useQuery({
    queryKey: ["credit-sales", storeId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales")
        .select("id,bill_no,created_at,customer_name,customer_phone,grand_total,credit_amount")
        .eq("store_id", storeId)
        .gt("credit_amount", 0)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const groups = useMemo(() => {
    const map = new Map<string, { key: string; name: string; phone: string | null; total: number; bills: typeof rows }>();
    const rows = list.data ?? [];
    for (const r of rows) {
      const key = (r.customer_phone || r.customer_name || "Walk-in").toLowerCase();
      const g = map.get(key) ?? { key, name: r.customer_name || "Walk-in", phone: r.customer_phone, total: 0, bills: [] as typeof rows };
      g.total += Number(r.credit_amount);
      g.bills.push(r);
      if (!g.phone && r.customer_phone) g.phone = r.customer_phone;
      map.set(key, g);
    }
    const term = q.trim().toLowerCase();
    return Array.from(map.values())
      .filter((g) => !term || g.name.toLowerCase().includes(term) || (g.phone ?? "").includes(term))
      .sort((a, b) => b.total - a.total);
  }, [list.data, q]);

  const outstanding = groups.reduce((s, g) => s + g.total, 0);

  return (
    <div className="p-4 lg:p-6 space-y-6 max-w-5xl">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2"><HandCoins className="size-6" /> Credit</h1>
          <p className="text-sm text-muted-foreground">Customers with unpaid amounts from credit or split-payment bills.</p>
        </div>
        <Input className="w-64" placeholder="Search name or phone…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      <div className="grid sm:grid-cols-3 gap-4">
        <Card className="p-5">
          <div className="text-sm text-muted-foreground">Total outstanding</div>
          <div className="text-3xl font-semibold mt-1 tabular-nums">{inr(outstanding)}</div>
        </Card>
        <Card className="p-5">
          <div className="text-sm text-muted-foreground">Customers with credit</div>
          <div className="text-3xl font-semibold mt-1">{groups.length}</div>
        </Card>
        <Card className="p-5">
          <div className="text-sm text-muted-foreground">Credit bills</div>
          <div className="text-3xl font-semibold mt-1">{list.data?.length ?? 0}</div>
        </Card>
      </div>

      <Card className="p-0 overflow-hidden">
        {!groups.length ? (
          <div className="p-8 text-center text-sm text-muted-foreground">No pending credit. </div>
        ) : (
          <div className="divide-y">
            {groups.map((g) => (
              <div key={g.key}>
                <button
                  type="button"
                  onClick={() => setOpenKey(openKey === g.key ? null : g.key)}
                  className="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-muted/40"
                >
                  <div className="min-w-0 flex-1">
                    <div className="font-medium truncate">{g.name}</div>
                    <div className="text-xs text-muted-foreground flex items-center gap-1">
                      {g.phone ? <><Phone className="size-3" /> {g.phone}</> : "No phone"} · {g.bills.length} bill(s)
                    </div>
                  </div>
                  <div className="text-right tabular-nums font-semibold">{inr(g.total)}</div>
                  <ChevronDown className={`size-4 transition-transform ${openKey === g.key ? "rotate-180" : ""}`} />
                </button>
                {openKey === g.key && (
                  <div className="bg-muted/20 px-4 pb-3">
                    <table className="w-full text-sm">
                      <thead className="text-left text-xs text-muted-foreground"><tr>
                        <th className="py-2">Bill</th><th className="py-2">Date</th>
                        <th className="py-2 text-right">Bill total</th><th className="py-2 text-right">Credit</th>
                      </tr></thead>
                      <tbody>{g.bills.map((b) => (
                        <tr key={b.id}>
                          <td className="py-1.5 font-mono text-xs">{b.bill_no}</td>
                          <td className="py-1.5 text-muted-foreground">{dt(b.created_at)}</td>
                          <td className="py-1.5 text-right tabular-nums">{inr(b.grand_total)}</td>
                          <td className="py-1.5 text-right tabular-nums font-medium">{inr(b.credit_amount)}</td>
                        </tr>
                      ))}</tbody>
                    </table>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
