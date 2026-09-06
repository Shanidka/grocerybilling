import { createFileRoute } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useStoreId } from "@/lib/active-store";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { inr, dt } from "@/lib/format";
import { HandCoins, Phone, ChevronDown, IndianRupee } from "lucide-react";

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
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [openKey, setOpenKey] = useState<string | null>(null);

  const [collect, setCollect] = useState<{ key: string; name: string; phone: string | null; due: number } | null>(null);

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

  const paid = useQuery({
    queryKey: ["credit-collections", storeId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("credit_collections")
        .select("id,customer_key,customer_name,amount,payment_mode,notes,collected_at")
        .eq("store_id", storeId)
        .order("collected_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const paidByKey = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of paid.data ?? []) m.set(p.customer_key, (m.get(p.customer_key) ?? 0) + Number(p.amount));
    return m;
  }, [paid.data]);

  const groups = useMemo(() => {
    const rows = list.data ?? [];
    const map = new Map<string, { key: string; name: string; phone: string | null; total: number; bills: typeof rows }>();
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
      .map((g) => {
        const collected = paidByKey.get(g.key) ?? 0;
        return { ...g, collected, due: Math.max(0, g.total - collected) };
      })
      .filter((g) => !term || g.name.toLowerCase().includes(term) || (g.phone ?? "").includes(term))
      .sort((a, b) => b.due - a.due);
  }, [list.data, q, paidByKey]);

  const outstanding = groups.reduce((s, g) => s + g.due, 0);
  const collectedTotal = groups.reduce((s, g) => s + g.collected, 0);
  const pendingCount = groups.filter((g) => g.due > 0.01).length;

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
          <div className="text-sm text-muted-foreground">Collected so far</div>
          <div className="text-3xl font-semibold mt-1 tabular-nums">{inr(collectedTotal)}</div>
        </Card>
        <Card className="p-5">
          <div className="text-sm text-muted-foreground">Customers pending</div>
          <div className="text-3xl font-semibold mt-1">{pendingCount}</div>
        </Card>
      </div>

      <Card className="p-0 overflow-hidden">
        {!groups.length ? (
          <div className="p-8 text-center text-sm text-muted-foreground">No pending credit. </div>
        ) : (
          <div className="divide-y">
            {groups.map((g) => (
              <div key={g.key}>
                <div className="w-full px-4 py-3 flex items-center gap-3 hover:bg-muted/40">
                  <button
                    type="button"
                    onClick={() => setOpenKey(openKey === g.key ? null : g.key)}
                    className="min-w-0 flex-1 text-left"
                  >
                    <div className="font-medium truncate">{g.name}</div>
                    <div className="text-xs text-muted-foreground flex items-center gap-1">
                      {g.phone ? <><Phone className="size-3" /> {g.phone}</> : "No phone"} · {g.bills.length} bill(s)
                      {g.collected > 0 && <> · paid {inr(g.collected)}</>}
                    </div>
                  </button>
                  <div className="text-right tabular-nums font-semibold">{inr(g.due)}</div>
                  <Button
                    size="sm"
                    disabled={g.due <= 0.01}
                    onClick={() => setCollect({ key: g.key, name: g.name, phone: g.phone, due: g.due })}
                  >
                    <IndianRupee className="size-4" /> Collect
                  </Button>
                  <button type="button" onClick={() => setOpenKey(openKey === g.key ? null : g.key)}>
                    <ChevronDown className={`size-4 transition-transform ${openKey === g.key ? "rotate-180" : ""}`} />
                  </button>
                </div>
                {openKey === g.key && (
                  <div className="bg-muted/20 px-4 pb-3 space-y-3">
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
                    {(paid.data ?? []).filter((p) => p.customer_key === g.key).length > 0 && (
                      <div>
                        <div className="text-xs font-medium text-muted-foreground mb-1">Collections received</div>
                        <div className="space-y-1">
                          {(paid.data ?? []).filter((p) => p.customer_key === g.key).map((p) => (
                            <div key={p.id} className="flex items-center justify-between text-sm">
                              <span className="text-muted-foreground">
                                {dt(p.collected_at)} · {p.payment_mode}{p.notes ? ` · ${p.notes}` : ""}
                              </span>
                              <span className="tabular-nums font-medium">{inr(Number(p.amount))}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      <CollectDialog
        info={collect}
        storeId={storeId}
        onClose={() => setCollect(null)}
        onDone={() => {
          setCollect(null);
          qc.invalidateQueries({ queryKey: ["credit-collections", storeId] });
        }}
      />
    </div>
  );
}

function CollectDialog({
  info, storeId, onClose, onDone,
}: {
  info: { key: string; name: string; phone: string | null; due: number } | null;
  storeId: string | undefined;
  onClose: () => void;
  onDone: () => void;
}) {
  const [amount, setAmount] = useState("");
  const [mode, setMode] = useState("cash");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const open = !!info;
  const due = info?.due ?? 0;

  const save = async () => {
    const amt = Number(amount || due);
    if (!info || !(amt > 0)) { toast.error("Enter an amount"); return; }
    if (amt > due + 0.01) { toast.error("Amount is more than the pending due"); return; }
    setSaving(true);
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase.from("credit_collections").insert({
      store_id: storeId ?? null,
      customer_key: info.key,
      customer_name: info.name,
      customer_phone: info.phone,
      amount: amt,
      payment_mode: mode,
      notes: notes || null,
      collected_by: u.user?.id ?? null,
    });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success(`Collected ${inr(amt)} from ${info.name}`);
    setAmount(""); setNotes(""); setMode("cash");
    onDone();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Collect credit</DialogTitle>
          <DialogDescription>{info?.name} · pending {inr(due)}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Amount received</Label>
            <Input
              type="number" inputMode="decimal" autoFocus
              placeholder={String(due.toFixed(2))}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
            <button type="button" className="text-xs text-primary" onClick={() => setAmount(due.toFixed(2))}>
              Full amount {inr(due)}
            </button>
          </div>
          <div className="space-y-1.5">
            <Label>Payment mode</Label>
            <Select value={mode} onValueChange={setMode}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="cash">Cash</SelectItem>
                <SelectItem value="upi">UPI</SelectItem>
                <SelectItem value="card">Card</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Note (optional)</Label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. part payment" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Record payment"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
