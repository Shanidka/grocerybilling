import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useStoreId } from "@/lib/active-store";
import { useCustomers, useLoyaltyMembership } from "@/lib/customers";
import { loyaltyEligible, loyaltyReward } from "@/lib/loyalty-rules";
import { useShopSettings } from "@/lib/shop-settings";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Loader2, Save } from "lucide-react";
import { dt, num } from "@/lib/format";
import { toast } from "sonner";

export function CustomerDetails({ customerId, onClose }: { customerId: string | null; onClose: () => void }) {
  const storeId = useStoreId();
  const customers = useCustomers();
  const customer = customers.data?.find((c) => c.id === customerId);
  const { data: shop } = useShopSettings();
  const membership = useLoyaltyMembership();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ name: "", phone: "", email: "", notes: "" });
  useEffect(() => {
    if (customer) setForm({ name: customer.name, phone: customer.phone ?? "", email: customer.email ?? "", notes: customer.notes ?? "" });
  }, [customer]);
  const history = useQuery({
    queryKey: ["loyalty-history", storeId, customerId],
    enabled: Boolean(customer),
    queryFn: async () => {
      if (!customerId) return [];
      const { data, error } = await supabase.from("loyalty_transactions").select("id,kind,points,note,created_at,sales(bill_no)").eq("customer_id", customerId).eq("store_id", storeId).order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
  const save = async () => {
    if (!customer || !form.name.trim()) return toast.error("Name required");
    if (customer.loyalty_enabled && !loyaltyEligible(form.phone)) return toast.error("A loyalty member needs a phone number");
    setBusy(true);
    try {
      const { error } = await supabase.from("customers").update({ name: form.name.trim(), phone: form.phone.trim() || null, email: form.email.trim() || null, notes: form.notes.trim() || null }).eq("id", customer.id).eq("store_id", storeId);
      if (error) throw error;
      await qc.invalidateQueries({ queryKey: ["customers"] });
      await qc.invalidateQueries({ queryKey: ["loyalty-member"] });
      toast.success("Customer updated");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Unable to save customer"); }
    finally { setBusy(false); }
  };
  return <Dialog open={Boolean(customerId)} onOpenChange={(v) => { if (!v) onClose(); }}>
    <DialogContent className="max-w-xl max-h-[85dvh] overflow-y-auto">
      <DialogHeader><DialogTitle>{customer?.name ?? "Customer details"}</DialogTitle><DialogDescription>{customer?.phone || "No phone number"}</DialogDescription></DialogHeader>
      {!customer ? <p className="text-muted-foreground">{customers.isLoading ? "Loading customer…" : "Customer unavailable in this branch."}</p> : <Tabs defaultValue="loyalty" key={`${storeId}-${customer.id}`}>
        <TabsList><TabsTrigger value="loyalty">Loyalty</TabsTrigger><TabsTrigger value="contact">Contact details</TabsTrigger></TabsList>
        <TabsContent value="loyalty" className="space-y-5 pt-3">
          <div className="flex items-center justify-between gap-3"><Label htmlFor="customer-membership">Loyalty membership</Label><Switch id="customer-membership" checked={customer.loyalty_enabled} disabled={busy || !loyaltyEligible(customer.phone)} onCheckedChange={async (v) => {
            setBusy(true); try { await membership(customer, v); toast.success(v ? "Customer joined loyalty" : "Membership disabled"); } catch (e) { toast.error(e instanceof Error ? e.message : "Unable to update membership"); } finally { setBusy(false); }
          }} /></div>
          <div className="flex gap-8 flex-wrap border-y py-4">
            <div><div className="text-sm text-muted-foreground">Points balance</div><div className="text-2xl font-semibold tabular-nums">{num(customer.loyalty_points)} pts</div></div>
            <div><div className="text-sm text-muted-foreground">Reward value</div><div className="text-2xl font-semibold tabular-nums">Rs.{num(loyaltyReward(Number(customer.loyalty_points), shop?.loyalty_point_value ?? 0.1))}</div></div>
          </div>
          {!shop?.loyalty_enabled && <p className="text-sm text-warning">Program paused</p>}
          {!loyaltyEligible(customer.phone) && <p className="text-sm text-muted-foreground">Phone number required for membership</p>}
          <h3 className="font-medium">Points history</h3>
          {history.isLoading ? <Loader2 className="size-4 animate-spin" /> : history.error ? <p className="text-destructive text-sm">Unable to load points history.</p> : !history.data?.length ? <p className="text-sm text-muted-foreground">No points transactions yet.</p> : <div className="divide-y">{history.data.map((t) => <div key={t.id} className="py-3 flex gap-3 justify-between">
            <div className="min-w-0"><div className="capitalize font-medium">{t.kind}{t.sales?.bill_no ? ` · ${t.sales.bill_no}` : ""}</div><div className="text-xs text-muted-foreground">{dt(t.created_at)}</div>{t.note && <p className="text-sm break-words">{t.note}</p>}</div>
            <span className="shrink-0 font-medium tabular-nums">{t.kind === "redeem" ? "−" : Number(t.points) >= 0 ? "+" : ""}{num(t.kind === "redeem" ? Math.abs(Number(t.points)) : Number(t.points))} pts</span>
          </div>)}</div>}
        </TabsContent>
        <TabsContent value="contact" className="space-y-4 pt-3">
          <div className="space-y-1.5"><Label htmlFor="detail-name">Name *</Label><Input id="detail-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          <div className="space-y-1.5"><Label htmlFor="detail-phone">Phone</Label><Input id="detail-phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
          <div className="space-y-1.5"><Label htmlFor="detail-email">Email</Label><Input id="detail-email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
          <div className="space-y-1.5"><Label htmlFor="detail-notes">Notes</Label><Textarea id="detail-notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
          <div className="flex justify-end"><Button onClick={save} disabled={busy}>{busy ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />} Save customer</Button></div>
        </TabsContent>
      </Tabs>}
    </DialogContent>
  </Dialog>;
}