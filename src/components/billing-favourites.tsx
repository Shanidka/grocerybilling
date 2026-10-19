import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronUp, Star, Save, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useActiveStore } from "@/lib/active-store";
import { canManage, useMyRoles } from "@/hooks/use-role";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { inr } from "@/lib/format";
import { toast } from "sonner";
import { logActivity } from "@/lib/activity-log";

export const MAX_FAVOURITES = 16;
type PickProduct = { id: string; name: string; selling_price: number; sold_by: string; price_per_kg: number; mrp: number };

export function BillingFavourites<T extends PickProduct>({ products, onAdd }: { products: T[]; onAdd: (product: T) => void }) {
  const { store } = useActiveStore();
  const [expanded, setExpanded] = useState(true);
  const ids = store?.billing_favourite_ids ?? [];
  const favourites = ids.flatMap((id) => { const p = products.find((item) => item.id === id); return p ? [p] : []; });
  if (!favourites.length) return null;
  return <div className="px-4 py-2 border-b bg-surface">
    <Button variant="ghost" size="sm" className="px-0 mb-1" onClick={() => setExpanded(!expanded)} aria-expanded={expanded}>
      <Star className="text-primary" /> Favourites {expanded ? <ChevronUp /> : <ChevronDown />}
    </Button>
    {expanded && <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-2 pb-2">
      {favourites.map((p) => <Button key={p.id} variant="outline" className="h-16 min-w-0 flex-col items-start gap-1 px-3" onClick={() => onAdd(p)} title={`${p.name} · MRP ${inr(p.mrp)}`}>
        <span className="w-full truncate text-left">{p.name}</span>
        <span className="text-xs text-muted-foreground">{inr(p.sold_by === "weight" ? p.price_per_kg : p.selling_price)}{p.sold_by === "weight" ? "/kg" : ""}</span>
      </Button>)}
    </div>}
  </div>;
}

export function FavouritesSettings() {
  const { storeId, store } = useActiveStore();
  const { data: roles } = useMyRoles();
  const qc = useQueryClient();
  const [selected, setSelected] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const allowed = canManage(roles);
  const products = useQuery({
    queryKey: ["favourite-products", storeId], enabled: allowed,
    queryFn: async () => {
      const { data, error } = await supabase.from("products").select("id,name,selling_price,mrp,sold_by,price_per_kg,barcode").eq("store_id", storeId).eq("is_active", true).order("name");
      if (error) throw error;
      return data ?? [];
    },
  });
  useEffect(() => { setSelected(store?.billing_favourite_ids ?? []); setSearch(""); }, [store]);
  const filtered = useMemo(() => (products.data ?? []).filter((p) => `${p.name} ${p.barcode ?? ""}`.toLowerCase().includes(search.toLowerCase())), [products.data, search]);
  if (!allowed) return null;
  const save = async () => {
    setSaving(true);
    try {
      const { data, error } = await supabase.from("stores").update({ billing_favourite_ids: selected }).eq("id", storeId).select("id").single();
      if (error || !data) throw error ?? new Error("Could not save favourites");
      await qc.invalidateQueries({ queryKey: ["stores"] });
      void logActivity("settings", "billing-favourites", "Updated billing favourites", { storeId, details: { product_ids: selected } });
      toast.success("Billing favourites saved");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Could not save favourites"); }
    finally { setSaving(false); }
  };
  return <section className="mt-6 border-t pt-6 space-y-4">
    <div className="flex justify-between items-center gap-2"><h2 className="font-semibold">Billing favourites · {store?.name}</h2><span className="text-sm text-muted-foreground">{selected.length}/{MAX_FAVOURITES}</span></div>
    <Input aria-label="Search favourites" placeholder="Search product or barcode" value={search} onChange={(e) => setSearch(e.target.value)} />
    <div className="border rounded-md max-h-72 overflow-auto divide-y">
      {products.isPending ? <div className="p-4"><Loader2 className="size-5 animate-spin" /></div> : products.isError ? <p className="p-4 text-sm text-destructive">Couldn't load products.</p> : filtered.length ? filtered.map((p) => <label key={p.id} className="flex gap-3 items-center px-3 py-3 cursor-pointer">
        <Checkbox checked={selected.includes(p.id)} disabled={saving || (!selected.includes(p.id) && selected.length >= MAX_FAVOURITES)} onCheckedChange={(checked) => setSelected((ids) => checked ? [...ids, p.id] : ids.filter((id) => id !== p.id))} />
        <span className="min-w-0 flex-1"><span className="block text-sm font-medium truncate">{p.name}</span><span className="block text-xs text-muted-foreground">{p.barcode ?? "No barcode"} · MRP {inr(p.mrp)}</span></span>
        <span className="text-sm shrink-0">{inr(p.sold_by === "weight" ? p.price_per_kg : p.selling_price)}</span>
      </label>) : <p className="p-4 text-sm text-muted-foreground">No products found.</p>}
    </div>
    <div className="flex justify-end"><Button onClick={save} disabled={saving || !store || products.isPending}>{saving ? <Loader2 className="animate-spin" /> : <Save />} Save favourites</Button></div>
  </section>;
}