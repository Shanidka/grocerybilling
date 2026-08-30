import { createFileRoute, Navigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useStoreId } from "@/lib/active-store";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { inr } from "@/lib/format";
import { Plus, Trash2, Wallet } from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from "recharts";
import { useMyRoles, canManage } from "@/hooks/use-role";

export const Route = createFileRoute("/_authenticated/expenses")({
  ssr: false,
  component: ExpensesPage,
  head: () => ({ meta: [{ title: "Expenses — Bazaar POS" }] }),
});

const CATEGORIES = [
  "Purchase payments", "Supplier payments", "Salary", "Rent", "Electricity",
  "Water", "Internet", "Maintenance", "Transportation", "Fuel", "Packaging",
  "Repairs", "Marketing", "Miscellaneous",
];
const PALETTE = ["#4f46e5","#0ea5e9","#10b981","#f59e0b","#ef4444","#ec4899","#8b5cf6","#14b8a6","#f97316","#84cc16","#6366f1","#06b6d4","#a855f7","#eab308"];

function ExpensesPage() {
  const { data: roles, isLoading } = useMyRoles();
  if (!isLoading && !canManage(roles)) return <Navigate to="/dashboard" />;

  const qc = useQueryClient();
  const storeId = useStoreId();
  const [range, setRange] = useState<"7d" | "30d" | "mtd" | "ytd" | "custom">("30d");
  const [cFrom, setCFrom] = useState("");
  const [cTo, setCTo] = useState("");
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [amount, setAmount] = useState("");
  const [payee, setPayee] = useState("");
  const [mode, setMode] = useState("cash");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");

  const { start, end } = useMemo(() => {
    const e = new Date(); e.setHours(23, 59, 59, 999);
    const s = new Date(); s.setHours(0, 0, 0, 0);
    if (range === "7d") s.setDate(s.getDate() - 6);
    else if (range === "30d") s.setDate(s.getDate() - 29);
    else if (range === "mtd") s.setDate(1);
    else if (range === "ytd") { s.setMonth(0); s.setDate(1); }
    else if (range === "custom") {
      return {
        start: cFrom ? new Date(cFrom + "T00:00:00") : new Date(2000, 0, 1),
        end: cTo ? new Date(cTo + "T23:59:59") : e,
      };
    }
    return { start: s, end: e };
  }, [range, cFrom, cTo]);

  const list = useQuery({
    queryKey: ["expenses", storeId, range, cFrom, cTo],
    queryFn: async () => {
      const { data, error } = await supabase.from("expenses")
        .select("id,category,amount,spent_on,payee,payment_mode,notes,created_at")
        .eq("store_id", storeId)
        .gte("spent_on", start.toISOString().slice(0, 10))
        .lte("spent_on", end.toISOString().slice(0, 10))
        .order("spent_on", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });


  const totals = useMemo(() => {
    const rows = list.data ?? [];
    const total = rows.reduce((s, r) => s + Number(r.amount), 0);
    const byCat = new Map<string, number>();
    for (const r of rows) byCat.set(r.category, (byCat.get(r.category) ?? 0) + Number(r.amount));
    return { total, byCat: Array.from(byCat.entries()).map(([name, value]) => ({ name, value: Math.round(value) })).sort((a, b) => b.value - a.value) };
  }, [list.data]);

  const save = async () => {
    if (!amount || Number(amount) <= 0) return toast.error("Amount required");
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase.from("expenses").insert({
      store_id: storeId,
      category, amount: Number(amount), spent_on: date, payee: payee || null,
      payment_mode: mode, notes: notes || null, created_by: u.user!.id,
    });
    if (error) return toast.error(error.message);
    toast.success("Expense recorded");
    setOpen(false); setAmount(""); setPayee(""); setNotes("");
    qc.invalidateQueries({ queryKey: ["expenses"] });
    qc.invalidateQueries({ queryKey: ["dash-moneyout"] });
  };

  const remove = async (id: string) => {
    const { error } = await supabase.from("expenses").delete().eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["expenses"] });
  };

  return (
    <div className="p-4 lg:p-6 space-y-6 max-w-6xl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2"><Wallet className="size-6" /> Expenses</h1>
          <p className="text-sm text-muted-foreground">Everything going out — rent, salaries, utilities, purchases and more.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={range} onValueChange={(v) => setRange(v as typeof range)}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="7d">Last 7 days</SelectItem>
              <SelectItem value="30d">Last 30 days</SelectItem>
              <SelectItem value="mtd">This month</SelectItem>
              <SelectItem value="ytd">This year</SelectItem>
              <SelectItem value="custom">Custom dates</SelectItem>
            </SelectContent>
          </Select>
          {range === "custom" && (
            <div className="flex items-center gap-2">
              <Input type="date" className="w-40" value={cFrom} onChange={(e) => setCFrom(e.target.value)} />
              <span className="text-muted-foreground">→</span>
              <Input type="date" className="w-40" value={cTo} onChange={(e) => setCTo(e.target.value)} />
            </div>
          )}

          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button><Plus className="size-4" /> Add expense</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>New expense</DialogTitle></DialogHeader>
              <div className="grid sm:grid-cols-2 gap-3">
                <div><Label>Category</Label>
                  <Select value={category} onValueChange={setCategory}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div><Label>Amount</Label><Input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
                <div><Label>Date</Label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
                <div><Label>Payment mode</Label>
                  <Select value={mode} onValueChange={setMode}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cash">Cash</SelectItem>
                      <SelectItem value="upi">UPI</SelectItem>
                      <SelectItem value="card">Card</SelectItem>
                      <SelectItem value="bank">Bank transfer</SelectItem>
                      <SelectItem value="wallet">Wallet</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="sm:col-span-2"><Label>Payee</Label><Input value={payee} onChange={(e) => setPayee(e.target.value)} placeholder="Vendor / person paid" /></div>
                <div className="sm:col-span-2"><Label>Notes</Label><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
              </div>
              <DialogFooter><Button onClick={save}>Save</Button></DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <Card className="p-5">
          <div className="text-sm text-muted-foreground">Total in range</div>
          <div className="text-3xl font-semibold mt-1">{inr(totals.total)}</div>
          <div className="text-xs text-muted-foreground mt-1">{list.data?.length ?? 0} entries</div>
        </Card>
        <Card className="p-5 lg:col-span-2">
          <div className="text-sm font-semibold mb-2">By category</div>
          <div className="h-56">
            {totals.byCat.length === 0 ? (
              <div className="grid place-items-center h-full text-sm text-muted-foreground">No expenses in this range.</div>
            ) : (
              <ResponsiveContainer>
                <PieChart>
                  <Pie data={totals.byCat} dataKey="value" nameKey="name" innerRadius={40} outerRadius={80}>
                    {totals.byCat.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
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
        {!list.data?.length ? (
          <div className="p-8 text-center text-sm text-muted-foreground">No expenses yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left"><tr>
                <th className="px-4 py-2.5">Date</th>
                <th className="px-4 py-2.5">Category</th>
                <th className="px-4 py-2.5">Payee</th>
                <th className="px-4 py-2.5">Mode</th>
                <th className="px-4 py-2.5 text-right">Amount</th>
                <th className="px-4 py-2.5 text-right"></th>
              </tr></thead>
              <tbody className="divide-y">{list.data.map((r) => (
                <tr key={r.id}>
                  <td className="px-4 py-3">{r.spent_on}</td>
                  <td className="px-4 py-3">{r.category}</td>
                  <td className="px-4 py-3 text-muted-foreground">{r.payee ?? "—"}</td>
                  <td className="px-4 py-3 capitalize">{r.payment_mode}</td>
                  <td className="px-4 py-3 text-right tabular-nums font-medium">{inr(r.amount)}</td>
                  <td className="px-4 py-3 text-right"><Button size="icon" variant="ghost" onClick={() => remove(r.id)}><Trash2 className="size-4" /></Button></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
