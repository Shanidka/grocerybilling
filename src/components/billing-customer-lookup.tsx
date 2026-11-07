import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useStoreId } from "@/lib/active-store";
import { useCustomers, useCustomerAccount } from "@/lib/customers";
import { creditAvailable } from "@/lib/credit-rules";
import { inr, num } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, UserPlus, UserCheck } from "lucide-react";
import { toast } from "sonner";

const digits = (s: string) => s.replace(/\D/g, "");

/** Shows the matched customer for a 10-digit phone, or an inline quick-add. */
export function BillingCustomerLookup({ phone, name, onName }: { phone: string; name: string; onName: (n: string) => void }) {
  const storeId = useStoreId();
  const qc = useQueryClient();
  const customers = useCustomers();
  const d = digits(phone);
  const ready = d.length === 10;
  const match = ready ? customers.data?.find((c) => digits(c.phone ?? "").slice(-10) === d) : undefined;
  const account = useCustomerAccount(match ?? null);
  const [newLimit, setNewLimit] = useState("");
  const [saving, setSaving] = useState(false);

  // Auto-fill the name from the directory when a number matches
  useEffect(() => {
    if (match && !name.trim()) onName(match.name);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [match?.id]);

  if (!ready) return null;
  if (customers.isLoading) return <p className="text-xs text-muted-foreground">Looking up customer…</p>;

  if (match) {
    const avail = creditAvailable(match.credit_limit, account.data?.outstanding ?? 0);
    return (
      <div className="rounded-md border bg-card p-2 text-xs grid grid-cols-3 gap-2" aria-label="Customer account">
        <div className="col-span-3 flex items-center gap-1.5 font-medium text-sm"><UserCheck className="size-4 text-primary" /> {match.name}</div>
        <div><div className="text-muted-foreground">Khata due</div><div className="font-semibold tabular-nums">{account.isLoading ? "…" : inr(account.data?.outstanding ?? 0)}</div></div>
        <div><div className="text-muted-foreground">Credit limit</div><div className="font-semibold tabular-nums">{match.credit_limit == null ? "No limit" : `${inr(match.credit_limit)}${avail != null ? ` (${inr(avail)} left)` : ""}`}</div></div>
        <div><div className="text-muted-foreground">Points</div><div className="font-semibold tabular-nums">{match.loyalty_enabled ? `${num(match.loyalty_points)} pts` : "Not a member"}</div></div>
      </div>
    );
  }

  const quickAdd = async () => {
    if (!name.trim()) return toast.error("Enter the customer name first");
    setSaving(true);
    try {
      const { data, error } = await supabase.from("customers").insert({ store_id: storeId, name: name.trim(), phone: d }).select("id").single();
      if (error) throw error;
      if (newLimit.trim()) {
        const { error: le } = await supabase.from("customers").update({ credit_limit: Number(newLimit) }).eq("id", data.id);
        if (le) toast.warning("Customer saved; only a manager can set a credit limit");
      }
      await qc.invalidateQueries({ queryKey: ["customers"] });
      toast.success(`${name.trim()} saved`);
      setNewLimit("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save customer");
    } finally { setSaving(false); }
  };

  return (
    <div className="rounded-md border border-dashed p-2 space-y-2 text-xs">
      <div className="text-muted-foreground">New customer — add without leaving billing</div>
      <div className="flex gap-2">
        <Input className="h-8" type="number" min={0} placeholder="Credit limit (optional)" value={newLimit} onChange={(e) => setNewLimit(e.target.value)} />
        <Button size="sm" className="h-8" onClick={quickAdd} disabled={saving}>
          {saving ? <Loader2 className="size-3.5 animate-spin" /> : <UserPlus className="size-3.5" />} Save customer
        </Button>
      </div>
    </div>
  );
}
