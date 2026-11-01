import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { canManage, useMyRoles } from "@/hooks/use-role";
import { useStoreId } from "@/lib/active-store";
import { useCustomers } from "@/lib/customers";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Save } from "lucide-react";
import { toast } from "sonner";

export function CustomerCreditSettings({ customerId }: { customerId: string }) {
  const { data: roles } = useMyRoles();
  const editable = canManage(roles);
  const { data } = useCustomers();
  const c = data?.find((r) => r.id === customerId);
  const [limit, setLimit] = useState("");
  const [days, setDays] = useState("30");
  const [saving, setSaving] = useState(false);
  const storeId = useStoreId();
  const qc = useQueryClient();
  useEffect(() => { if (c) { setLimit(c.credit_limit == null ? "" : String(c.credit_limit)); setDays(String(c.credit_days ?? 30)); } }, [c]);
  const save = async () => {
    if (!editable) return;
    const cap = limit.trim() ? Number(limit) : null;
    const d = Number(days);
    if ((cap !== null && (!Number.isFinite(cap) || cap < 0)) || !Number.isInteger(d) || d <= 0) return toast.error("Enter a non-negative limit and a positive number of days");
    setSaving(true);
    const { error } = await supabase.from("customers").update({ credit_limit: cap, credit_days: d }).eq("id", customerId).eq("store_id", storeId);
    setSaving(false);
    if (error) return toast.error(error.message);
    await qc.invalidateQueries({ queryKey: ["customers"] });
    toast.success("Credit terms saved");
  };
  return <div className="space-y-4">
    <div className="space-y-1.5"><Label htmlFor="customer-credit-limit">Credit limit (Rs.)</Label><Input id="customer-credit-limit" type="number" min="0" step="0.01" placeholder="No limit" value={limit} onChange={(e) => setLimit(e.target.value)} disabled={!editable || saving} /></div>
    <div className="space-y-1.5"><Label htmlFor="customer-credit-days">Payment due after (days)</Label><Input id="customer-credit-days" type="number" min="1" step="1" value={days} onChange={(e) => setDays(e.target.value)} disabled={!editable || saving} /></div>
    {editable && <div className="flex justify-end"><Button onClick={save} disabled={saving}><Save className="size-4" /> Save credit terms</Button></div>}
  </div>;
}