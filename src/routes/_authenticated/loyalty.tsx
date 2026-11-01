import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Gift, Search, Loader2, Users } from "lucide-react";
import { pageMeta } from "@/lib/page-meta";
import { useCustomers, useLoyaltyMembership } from "@/lib/customers";
import { useStoreId } from "@/lib/active-store";
import { loyaltyEligible } from "@/lib/loyalty-rules";
import { useShopSettings } from "@/lib/shop-settings";
import { CustomerDetails } from "@/components/customer-details";
import { LoyaltySettings } from "@/components/loyalty-settings";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { num } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/loyalty")({
  ssr: false,
  component: LoyaltyPage,
  head: () => pageMeta("Customer loyalty — Bazaar POS", "Manage loyalty membership, customer points history and reward program settings."),
});

function LoyaltyPage() {
  const customers = useCustomers();
  const membership = useLoyaltyMembership();
  const { data: shop } = useShopSettings();
  const storeId = useStoreId();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [selected, setSelected] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  useEffect(() => { setSelected(null); }, [storeId]);
  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return (customers.data ?? []).filter((c) => (!s || c.name.toLowerCase().includes(s) || (c.phone ?? "").includes(s)) && (filter === "all" || (filter === "members" ? c.loyalty_enabled : !c.loyalty_enabled)));
  }, [customers.data, search, filter]);
  const members = (customers.data ?? []).filter((c) => c.loyalty_enabled);
  return <div className="p-4 lg:p-6 max-w-5xl space-y-6">
    <header className="flex justify-between items-start gap-4 flex-wrap"><h1 className="text-2xl font-semibold flex items-center gap-2"><Gift className="size-6 text-primary" /> Loyalty</h1><span className={`text-sm font-medium ${shop?.loyalty_enabled ? "text-success" : "text-muted-foreground"}`}>{shop?.loyalty_enabled ? "Program active" : "Program paused"}</span></header>
    <div className="flex flex-wrap gap-8 border-y py-4">
      <div><div className="text-sm text-muted-foreground">Members</div><div className="text-2xl font-semibold tabular-nums">{members.length}</div></div>
      <div><div className="text-sm text-muted-foreground">Total member points</div><div className="text-2xl font-semibold tabular-nums">{num(members.reduce((s, c) => s + Number(c.loyalty_points), 0))}</div></div>
      <div><div className="text-sm text-muted-foreground">Current rewards</div><div className="text-sm font-medium mt-1">Rs.{num(shop?.loyalty_earn_per ?? 100)} = 1 pt · {num(1 / (Number(shop?.loyalty_point_value) || 0.1))} pts = Rs.1</div></div>
    </div>
    <Tabs defaultValue="members">
      <TabsList><TabsTrigger value="members"><Users className="size-4 mr-2" />Customers</TabsTrigger><TabsTrigger value="settings">Program settings</TabsTrigger></TabsList>
      <TabsContent value="members" className="pt-4 space-y-4">
        <div className="flex gap-3 flex-wrap"><div className="relative flex-1 min-w-48"><Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" /><Input aria-label="Search loyalty customers" placeholder="Search name or phone…" className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} /></div><Select value={filter} onValueChange={setFilter}><SelectTrigger className="w-40" aria-label="Membership filter"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All customers</SelectItem><SelectItem value="members">Members</SelectItem><SelectItem value="nonmembers">Not enrolled</SelectItem></SelectContent></Select></div>
        {customers.isLoading ? <Loader2 className="size-5 animate-spin" /> : customers.error ? <p className="text-destructive">Unable to load customers.</p> : !filtered.length ? <p className="py-8 text-center text-muted-foreground">No matching customers.</p> : <div className="divide-y border-y">{filtered.map((c) => <div className="flex gap-4 items-center py-4" key={c.id}>
          <Button variant="link" className="flex-1 min-w-0 h-auto p-0 block text-left whitespace-normal" onClick={() => setSelected(c.id)}><span className="block font-medium break-words">{c.name}</span><span className="block text-xs text-muted-foreground mt-1">{c.phone || "No phone number"}</span></Button>
          <div className="text-right shrink-0"><div className="font-medium tabular-nums">{num(c.loyalty_points)} pts</div><div className="text-xs text-muted-foreground">{c.loyalty_enabled ? "Member" : "Not enrolled"}</div></div>
          <Switch aria-label={`Loyalty for ${c.name}`} checked={c.loyalty_enabled} disabled={busyId === c.id || !loyaltyEligible(c.phone)} onCheckedChange={async (v) => {
            setBusyId(c.id); try { await membership(c, v); toast.success(v ? "Customer joined loyalty" : "Membership disabled"); } catch (e) { toast.error(e instanceof Error ? e.message : "Unable to update loyalty"); } finally { setBusyId(null); }
          }} />
        </div>)}</div>}
      </TabsContent>
      <TabsContent value="settings" className="pt-5"><LoyaltySettings /></TabsContent>
    </Tabs>
    <CustomerDetails customerId={selected} onClose={() => setSelected(null)} />
  </div>;
}