import { createFileRoute } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useStoreId } from "@/lib/active-store";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { inr } from "@/lib/format";
import { BookOpen, Printer } from "lucide-react";

export const Route = createFileRoute("/_authenticated/day-book")({
  ssr: false,
  component: DayBook,
  head: () => ({
    meta: [
      { title: "Day Book — daily sales & expenses | Bazaar POS" },
      { name: "description", content: "See every bill and every expense for a single day with cash, UPI, card and credit totals." },
      { property: "og:title", content: "Day Book — daily sales & expenses | Bazaar POS" },
      { property: "og:description", content: "Every bill and expense of the day with payment-wise totals." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function DayBook() {
  const storeId = useStoreId();
  const [day, setDay] = useState(new Date().toISOString().slice(0, 10));

  const from = useMemo(() => new Date(day + "T00:00:00").toISOString(), [day]);
  const to = useMemo(() => new Date(day + "T23:59:59.999").toISOString(), [day]);

  const sales = useQuery({
    queryKey: ["daybook-sales", storeId, day],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales")
        .select("id,bill_no,created_at,customer_name,grand_total,payment_mode,amount_cash,amount_card,amount_upi,amount_other,credit_amount")
        .eq("store_id", storeId)
        .gte("created_at", from).lte("created_at", to)
        .order("created_at");
      if (error) throw error;
      return data ?? [];
    },
  });

  const expenses = useQuery({
    queryKey: ["daybook-expenses", storeId, day],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("expenses")
        .select("id,category,payee,amount,payment_mode,notes")
        .eq("store_id", storeId)
        .eq("spent_on", day)
        .order("created_at");
      if (error) throw error;
      return data ?? [];
    },
  });

  const t = useMemo(() => {
    const rows = sales.data ?? [];
    const sum = (k: "amount_cash" | "amount_card" | "amount_upi" | "amount_other" | "credit_amount" | "grand_total") =>
      rows.reduce((s, r) => s + Number(r[k] ?? 0), 0);
    const out = (expenses.data ?? []).reduce((s, r) => s + Number(r.amount), 0);
    return {
      bills: rows.length, gross: sum("grand_total"),
      cash: sum("amount_cash"), card: sum("amount_card"), upi: sum("amount_upi"),
      other: sum("amount_other"), credit: sum("credit_amount"), out,
    };
  }, [sales.data, expenses.data]);

  return (
    <div className="p-4 lg:p-6 space-y-6 max-w-6xl">
      <div className="flex items-end justify-between flex-wrap gap-3 print:hidden">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2"><BookOpen className="size-6" /> Day Book</h1>
          <p className="text-sm text-muted-foreground">All sales and expenses recorded on a single day.</p>
        </div>
        <div className="flex items-center gap-2">
          <Input type="date" className="w-44" value={day} onChange={(e) => setDay(e.target.value)} />
          <Button variant="outline" onClick={() => window.print()}><Printer className="size-4" /> Print</Button>
        </div>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Box label="Money in (sales)" value={inr(t.gross)} sub={`${t.bills} bills`} />
        <Box label="Money out (expenses)" value={inr(t.out)} sub={`${expenses.data?.length ?? 0} entries`} />
        <Box label="Net for the day" value={inr(t.gross - t.out)} sub={t.gross - t.out >= 0 ? "Positive" : "Negative"} />
        <Box label="Cash in hand (sales)" value={inr(t.cash)} sub={`UPI ${inr(t.upi)} · Card ${inr(t.card)} · Credit ${inr(t.credit)}`} />
      </div>

      <Card className="p-0 overflow-hidden">
        <div className="px-4 py-3 border-b font-semibold text-sm">Sales</div>
        {!sales.data?.length ? (
          <div className="p-8 text-center text-sm text-muted-foreground">No bills on this day.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left"><tr>
                <th className="px-4 py-2.5">Time</th><th className="px-4 py-2.5">Bill</th><th className="px-4 py-2.5">Customer</th>
                <th className="px-4 py-2.5">Mode</th>
                <th className="px-4 py-2.5 text-right">Credit</th><th className="px-4 py-2.5 text-right">Total</th>
              </tr></thead>
              <tbody className="divide-y">{sales.data.map((r) => (
                <tr key={r.id}>
                  <td className="px-4 py-2.5">{new Date(r.created_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}</td>
                  <td className="px-4 py-2.5 font-mono text-xs">{r.bill_no}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">{r.customer_name ?? "—"}</td>
                  <td className="px-4 py-2.5 capitalize">{r.payment_mode}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{Number(r.credit_amount) > 0 ? inr(r.credit_amount) : "—"}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums font-medium">{inr(r.grand_total)}</td>
                </tr>
              ))}</tbody>
              <tfoot><tr className="border-t bg-muted/30 font-semibold">
                <td className="px-4 py-2.5" colSpan={4}>Total</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{inr(t.credit)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{inr(t.gross)}</td>
              </tr></tfoot>
            </table>
          </div>
        )}
      </Card>

      <Card className="p-0 overflow-hidden">
        <div className="px-4 py-3 border-b font-semibold text-sm">Expenses</div>
        {!expenses.data?.length ? (
          <div className="p-8 text-center text-sm text-muted-foreground">No expenses on this day.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left"><tr>
                <th className="px-4 py-2.5">Category</th><th className="px-4 py-2.5">Payee</th>
                <th className="px-4 py-2.5">Mode</th><th className="px-4 py-2.5 text-right">Amount</th>
              </tr></thead>
              <tbody className="divide-y">{expenses.data.map((r) => (
                <tr key={r.id}>
                  <td className="px-4 py-2.5">{r.category}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">{r.payee ?? "—"}</td>
                  <td className="px-4 py-2.5 capitalize">{r.payment_mode}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums font-medium">{inr(r.amount)}</td>
                </tr>
              ))}</tbody>
              <tfoot><tr className="border-t bg-muted/30 font-semibold">
                <td className="px-4 py-2.5" colSpan={3}>Total</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{inr(t.out)}</td>
              </tr></tfoot>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

function Box({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <Card className="p-5">
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className="text-2xl font-semibold mt-1 tabular-nums">{value}</div>
      <div className="text-xs text-muted-foreground/70 mt-0.5 truncate">{sub}</div>
    </Card>
  );
}
