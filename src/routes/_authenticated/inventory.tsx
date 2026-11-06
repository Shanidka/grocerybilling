import { pageMeta } from "@/lib/page-meta";
import { createFileRoute } from "@tanstack/react-router";
import { logActivity } from "@/lib/activity-log";
import { supabase } from "@/integrations/supabase/client";
import { useStoreId } from "@/lib/active-store";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { inr } from "@/lib/format";
import {
  Plus, Camera, Boxes, Sliders, PackageX,
  Undo2, AlertTriangle, CalendarClock, ChevronDown, ShoppingCart, Trash2,
} from "lucide-react";
import { CameraScanner } from "@/components/camera-scanner";

export const Route = createFileRoute("/_authenticated/inventory")({
  ssr: false,
  validateSearch: (search: Record<string, unknown>): { tab?: string } =>
    typeof search.tab === "string" ? { tab: search.tab } : {},
  component: InventoryPage,
  head: () => pageMeta("Inventory — Bazaar POS", "Track stock levels, purchases, adjustments, damage and returns."),
});

type TabDef = { value: string; label: string; icon: React.ComponentType<{ className?: string }>; desc: string; tone: string };
const TABS: TabDef[] = [
  { value: "stock", label: "Stock", icon: Boxes, desc: "All products & levels", tone: "text-primary" },
  { value: "adjustments", label: "Adjustments", icon: Sliders, desc: "Recounts & corrections", tone: "text-primary" },
  { value: "damaged", label: "Damaged", icon: PackageX, desc: "Expired / broken items", tone: "text-destructive" },
  { value: "returns", label: "Returns", icon: Undo2, desc: "Customer returns", tone: "text-primary" },
  { value: "belowmin", label: "Below minimum", icon: AlertTriangle, desc: "Restock needed", tone: "text-warning" },
  { value: "expiring", label: "About to expire", icon: CalendarClock, desc: "Near expiry", tone: "text-warning" },
];

function InventoryPage() {
  const { tab } = Route.useSearch();
  const navigate = Route.useNavigate();
  const active = TABS.some((t) => t.value === tab) ? (tab as string) : "stock";
  return (
    <div className="p-4 lg:p-6 space-y-6 max-w-7xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Inventory</h1>
        <p className="text-sm text-muted-foreground">Track stock, adjustments, damages, and returns.{" "}
            <a href="/purchases" className="underline text-primary">Record a supplier bill in Purchase entry →</a></p>
      </div>

      <Tabs value={active} onValueChange={(v) => navigate({ search: { tab: v }, replace: true })} orientation="vertical" className="flex flex-col lg:flex-row gap-6">
        <TabsList className="h-auto bg-transparent p-0 flex flex-row lg:flex-col gap-2 lg:w-64 overflow-x-auto lg:overflow-visible shrink-0">
          {TABS.map((t) => {
            const Icon = t.icon;
            return (
              <TabsTrigger
                key={t.value}
                value={t.value}
                className="justify-start gap-3 w-full lg:w-full min-w-max px-3 py-2.5 rounded-lg border border-transparent data-[state=active]:border-border data-[state=active]:bg-card data-[state=active]:shadow-sm hover:bg-muted/60 transition-all"
              >
                <span className={`grid place-items-center size-8 rounded-md bg-muted ${t.tone}`}>
                  <Icon className="size-4" />
                </span>
                <span className="flex flex-col items-start text-left">
                  <span className="text-sm font-medium">{t.label}</span>
                  <span className="hidden lg:block text-[11px] text-muted-foreground font-normal">{t.desc}</span>
                </span>
              </TabsTrigger>
            );
          })}
        </TabsList>
        <div className="flex-1 min-w-0">
          <TabsContent value="stock" className="mt-0"><StockTab /></TabsContent>
                    <TabsContent value="adjustments" className="mt-0"><AdjustmentsTab /></TabsContent>
          <TabsContent value="damaged" className="mt-0"><DamagedTab /></TabsContent>
          <TabsContent value="returns" className="mt-0"><ReturnsTab /></TabsContent>
          <TabsContent value="belowmin" className="mt-0"><BelowMinTab /></TabsContent>
          <TabsContent value="expiring" className="mt-0"><ExpiringTab /></TabsContent>
        </div>
      </Tabs>
    </div>
  );
}

function useProductsList() {
  const storeId = useStoreId();
  return useQuery({
    queryKey: ["inv-products", storeId],
    queryFn: async () => {
      const { data, error } = await supabase.from("products")
        .select("id,name,unit,barcode,brand,purchase_price,selling_price,mrp,stock_qty")
        .eq("store_id", storeId).eq("is_active", true).order("name");
      if (error) throw error;
      return data ?? [];
    },
  });
}

function useSuppliersList() {
  const storeId = useStoreId();
  return useQuery({
    queryKey: ["inv-suppliers", storeId],
    queryFn: async () => {
      const { data, error } = await supabase.from("suppliers").select("id,name").eq("store_id", storeId).order("name");
      if (error) throw error;
      return data ?? [];
    },
  });
}

/* All products stock */
function StockTab() {
  const [search, setSearch] = useState("");
  const [brand, setBrand] = useState("__all");
  const storeId = useStoreId();
  const [valueBasis, setValueBasis] = useState<"cost" | "selling">("cost");
  const q = useQuery({
    queryKey: ["inv-stock", storeId],
    queryFn: async () => {
      const { data, error } = await supabase.from("products")
        .select("id,name,brand,unit,stock_qty,min_qty,max_qty,purchase_price,selling_price,updated_at")
        .eq("store_id", storeId).eq("is_active", true).order("name");
      if (error) throw error;
      return data ?? [];
    },
  });
  const brands = useMemo(() => Array.from(new Set((q.data ?? []).map((p) => p.brand).filter(Boolean) as string[])).sort(), [q.data]);
  const unitValue = (p: { purchase_price: number | null; selling_price: number | null }) =>
    Number((valueBasis === "cost" ? p.purchase_price : p.selling_price) ?? 0);
  const rows = useMemo(() => (q.data ?? []).filter((p) => {
    if (brand !== "__all" && (p.brand ?? "") !== brand) return false;
    if (search && !p.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  }), [q.data, brand, search]);

  const allValue = useMemo(
    () => (q.data ?? []).reduce((s, p) => s + Number(p.stock_qty) * unitValue(p), 0),
    [q.data, valueBasis],
  );
  const filteredValue = useMemo(
    () => rows.reduce((s, p) => s + Number(p.stock_qty) * unitValue(p), 0),
    [rows, valueBasis],
  );
  const byCompany = useMemo(() => {
    const m = new Map<string, { qty: number; value: number; count: number }>();
    for (const p of q.data ?? []) {
      const k = p.brand || "Unbranded";
      const cur = m.get(k) ?? { qty: 0, value: 0, count: 0 };
      cur.qty += Number(p.stock_qty);
      cur.value += Number(p.stock_qty) * unitValue(p);
      cur.count += 1;
      m.set(k, cur);
    }
    return Array.from(m.entries()).map(([name, v]) => ({ name, ...v })).sort((a, b) => b.value - a.value);
  }, [q.data, valueBasis]);

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">Total stock value (all products)</div>
          <div className="text-2xl font-semibold mt-1">{inr(allValue)}</div>
          <div className="text-[11px] text-muted-foreground mt-1">{(q.data ?? []).length} product(s)</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">Value in current view</div>
          <div className="text-2xl font-semibold mt-1">{inr(filteredValue)}</div>
          <div className="text-[11px] text-muted-foreground mt-1">{rows.length} product(s)</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground mb-1">Value based on</div>
          <Select value={valueBasis} onValueChange={(v) => setValueBasis(v as "cost" | "selling")}>
            <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="cost">Purchase cost</SelectItem>
              <SelectItem value="selling">Selling price</SelectItem>
            </SelectContent>
          </Select>
        </Card>
      </div>

      <Card className="p-0 overflow-hidden">
        <div className="px-4 py-2.5 text-sm font-medium bg-muted/50">Company-wise stock value</div>
        <div className="overflow-x-auto max-h-64 overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/30 text-left"><tr>
              <th className="px-4 py-2">Company</th><th className="px-4 py-2">Products</th>
              <th className="px-4 py-2">Total qty</th><th className="px-4 py-2">Stock value</th>
            </tr></thead>
            <tbody className="divide-y">
              {byCompany.map((c) => (
                <tr key={c.name} className="cursor-pointer hover:bg-muted/40" onClick={() => setBrand(c.name === "Unbranded" ? "__all" : c.name)}>
                  <td className="px-4 py-2 font-medium">{c.name}</td>
                  <td className="px-4 py-2 text-muted-foreground">{c.count}</td>
                  <td className="px-4 py-2">{Math.round(c.qty * 1000) / 1000}</td>
                  <td className="px-4 py-2 font-medium">{inr(c.value)}</td>
                </tr>
              ))}
              <tr className="bg-muted/40 font-semibold">
                <td className="px-4 py-2">All companies</td><td className="px-4 py-2"></td><td className="px-4 py-2"></td>
                <td className="px-4 py-2">{inr(allValue)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </Card>

      <div className="flex items-center gap-2 flex-wrap">
        <Input className="max-w-xs" placeholder="Search product…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <Select value={brand} onValueChange={setBrand}>
          <SelectTrigger className="w-48"><SelectValue placeholder="All companies" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all">All companies</SelectItem>
            {brands.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="text-xs text-muted-foreground ml-auto">{rows.length} product(s)</div>
        <a href="/purchase-orders" className="text-xs underline text-primary">Create purchase order →</a>
      </div>
      <Card className="p-0 overflow-hidden">
        {!rows.length ? <div className="p-8 text-center text-sm text-muted-foreground">No products yet. Add products from the Products page.</div> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left"><tr>
                <th className="px-4 py-2.5">Product</th><th className="px-4 py-2.5">Company</th>
                <th className="px-4 py-2.5">Stock</th><th className="px-4 py-2.5">Min</th>
                <th className="px-4 py-2.5">Max</th><th className="px-4 py-2.5">Price</th>
                <th className="px-4 py-2.5">Stock value</th>
              </tr></thead>
              <tbody className="divide-y">{rows.map((p) => {
                const low = Number(p.stock_qty) <= Number(p.min_qty) && Number(p.min_qty) > 0;
                return (
                  <tr key={p.id}>
                    <td className="px-4 py-3 font-medium">{p.name}</td>
                    <td className="px-4 py-3 text-muted-foreground">{p.brand ?? "—"}</td>
                    <td className={`px-4 py-3 font-medium ${low ? "text-destructive" : ""}`}>{Number(p.stock_qty)} {p.unit}{low && <Badge variant="destructive" className="ml-2 text-[10px]">Low</Badge>}</td>
                    <td className="px-4 py-3">{Number(p.min_qty)}</td>
                    <td className="px-4 py-3">{Number(p.max_qty)}</td>
                    <td className="px-4 py-3">{inr(p.selling_price)}</td>
                    <td className="px-4 py-3 font-medium">{inr(Number(p.stock_qty) * unitValue(p))}</td>
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

/* Adjustments */
function AdjustmentsTab() {
  const qc = useQueryClient();
  const { data: products } = useProductsList();
  const q = useQuery({
    queryKey: ["inv-adjust"],
    queryFn: async () => {
      const { data, error } = await supabase.from("stock_adjustments").select("id,product_id,delta,reason,notes,created_at,products(name,unit)").order("created_at", { ascending: false }).limit(50);
      if (error) throw error;
      return data ?? [];
    },
  });
  const [open, setOpen] = useState(false);
  const [pid, setPid] = useState(""); const [delta, setDelta] = useState(""); const [reason, setReason] = useState("recount"); const [notes, setNotes] = useState("");
  const save = async () => {
    if (!pid || !delta) return toast.error("Product and delta required");
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase.from("stock_adjustments").insert({ product_id: pid, delta: Number(delta), reason, notes, created_by: u.user!.id });
    if (error) return toast.error(error.message);
    void logActivity("stock", "adjust", `Stock adjustment ${Number(delta) > 0 ? "+" : ""}${Number(delta)} on ${products?.find((p) => p.id === pid)?.name ?? pid} (${reason})`, { entityId: pid, details: { delta: Number(delta), reason, notes } });
    toast.success("Adjustment saved");
    setOpen(false); setPid(""); setDelta(""); setNotes("");
    qc.invalidateQueries({ queryKey: ["inv-adjust"] });
    qc.invalidateQueries({ queryKey: ["inv-products"] });
    qc.invalidateQueries({ queryKey: ["inv-stock"] });
  };
  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><Plus className="size-4" /> New adjustment</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Stock adjustment</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>Product</Label>
                <Select value={pid} onValueChange={setPid}><SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>{products?.map((p) => <SelectItem key={p.id} value={p.id}>{p.name} (stock {Number(p.stock_qty)})</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Delta (use negative to reduce)</Label><Input type="number" step="0.001" value={delta} onChange={(e) => setDelta(e.target.value)} /></div>
              <div><Label>Reason</Label>
                <Select value={reason} onValueChange={setReason}><SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="recount">Recount</SelectItem>
                    <SelectItem value="theft">Theft/Missing</SelectItem>
                    <SelectItem value="correction">Correction</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Notes</Label><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
            </div>
            <DialogFooter><Button onClick={save}>Save</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
      <Card className="p-0 overflow-hidden">
        {!q.data?.length ? <div className="p-8 text-center text-sm text-muted-foreground">No adjustments yet.</div> : (
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left"><tr><th className="px-4 py-2.5">Date</th><th className="px-4 py-2.5">Product</th><th className="px-4 py-2.5">Delta</th><th className="px-4 py-2.5">Reason</th><th className="px-4 py-2.5">Notes</th></tr></thead>
            <tbody className="divide-y">{q.data.map((r) => (
              <tr key={r.id}><td className="px-4 py-3">{new Date(r.created_at).toLocaleDateString("en-IN")}</td><td className="px-4 py-3">{(r.products as { name?: string } | null)?.name ?? "—"}</td><td className={`px-4 py-3 font-medium ${Number(r.delta) < 0 ? "text-destructive" : "text-primary"}`}>{Number(r.delta) > 0 ? "+" : ""}{Number(r.delta)}</td><td className="px-4 py-3">{r.reason}</td><td className="px-4 py-3 text-muted-foreground">{r.notes ?? "—"}</td></tr>
            ))}</tbody>
          </table>
        )}
      </Card>
    </div>
  );
}

/* Damaged */
function DamagedTab() {
  const qc = useQueryClient();
  const { data: products } = useProductsList();
  const q = useQuery({
    queryKey: ["inv-damaged"],
    queryFn: async () => {
      const { data, error } = await supabase.from("damaged_products").select("id,product_id,qty,reason,loss_value,created_at,products(name,unit)").order("created_at", { ascending: false }).limit(50);
      if (error) throw error;
      return data ?? [];
    },
  });
  const [open, setOpen] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);
  const [pid, setPid] = useState(""); const [qty, setQty] = useState("1"); const [reason, setReason] = useState(""); const [loss, setLoss] = useState("");
  const applyProduct = (product_id: string, quantity?: string) => {
    const p = products?.find((x) => x.id === product_id);
    setPid(product_id);
    const q = quantity ?? qty;
    if (p) setLoss((Number(q || 0) * Number(p.purchase_price || 0)).toFixed(2));
  };
  const onScan = (code: string) => {
    const p = products?.find((x) => x.barcode === code);
    if (!p) { toast.error(`No product for ${code}`); return; }
    applyProduct(p.id);
    toast.success(`Loaded ${p.name}`);
    setScanOpen(false);
  };
  const save = async () => {
    if (!pid || !qty) return toast.error("Product and qty required");
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase.from("damaged_products").insert({ product_id: pid, qty: Number(qty), reason, loss_value: Number(loss || 0), created_by: u.user!.id });
    if (error) return toast.error(error.message);
    void logActivity("stock", "damage", `Damage ${Number(qty)} of ${products?.find((p) => p.id === pid)?.name ?? pid}`, { entityId: pid, details: { qty: Number(qty), reason, loss_value: Number(loss || 0) } });
    toast.success("Damage logged");
    setOpen(false); setPid(""); setQty("1"); setReason(""); setLoss("");
    qc.invalidateQueries({ queryKey: ["inv-damaged"] });
    qc.invalidateQueries({ queryKey: ["inv-products"] });
    qc.invalidateQueries({ queryKey: ["inv-stock"] });
  };
  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><Plus className="size-4" /> Log damage</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Damaged / expired stock</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div className="flex gap-2 items-end">
                <div className="flex-1"><Label>Product</Label>
                  <Select value={pid} onValueChange={(v) => applyProduct(v)}>
                    <SelectTrigger><SelectValue placeholder="Select or scan" /></SelectTrigger>
                    <SelectContent>{products?.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <Button type="button" variant="outline" onClick={() => setScanOpen(true)}><Camera className="size-4" /> Scan</Button>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Qty</Label><Input type="number" step="0.001" value={qty} onChange={(e) => { setQty(e.target.value); if (pid) applyProduct(pid, e.target.value); }} /></div>
                <div><Label>Loss value (₹)</Label><Input type="number" step="0.01" value={loss} onChange={(e) => setLoss(e.target.value)} /></div>
              </div>
              <div className="text-xs text-muted-foreground">Loss auto-filled from purchase price × qty. Edit if needed.</div>
              <div><Label>Reason</Label><Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="expired, spillage, breakage…" /></div>
            </div>
            <DialogFooter><Button onClick={save}>Save</Button></DialogFooter>
          </DialogContent>
        </Dialog>
        <CameraScanner open={scanOpen} onClose={() => setScanOpen(false)} onScan={onScan} title="Scan damaged item" />
      </div>
      <Card className="p-0 overflow-hidden">
        {!q.data?.length ? <div className="p-8 text-center text-sm text-muted-foreground">Nothing logged.</div> : (
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left"><tr><th className="px-4 py-2.5">Date</th><th className="px-4 py-2.5">Product</th><th className="px-4 py-2.5">Qty</th><th className="px-4 py-2.5">Reason</th><th className="px-4 py-2.5">Loss</th></tr></thead>
            <tbody className="divide-y">{q.data.map((r) => (
              <tr key={r.id}><td className="px-4 py-3">{new Date(r.created_at).toLocaleDateString("en-IN")}</td><td className="px-4 py-3">{(r.products as { name?: string } | null)?.name ?? "—"}</td><td className="px-4 py-3">{Number(r.qty)}</td><td className="px-4 py-3">{r.reason ?? "—"}</td><td className="px-4 py-3">{inr(r.loss_value)}</td></tr>
            ))}</tbody>
          </table>
        )}
      </Card>
    </div>
  );
}

/* Returns */
function ReturnsTab() {
  const qc = useQueryClient();
  const { data: products } = useProductsList();
  const q = useQuery({
    queryKey: ["inv-returns"],
    queryFn: async () => {
      const { data, error } = await supabase.from("product_returns").select("id,product_id,qty,refund_amount,reason,restock,created_at,products(name)").order("created_at", { ascending: false }).limit(50);
      if (error) throw error;
      return data ?? [];
    },
  });
  const [open, setOpen] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);
  const [pid, setPid] = useState(""); const [qty, setQty] = useState("1"); const [refund, setRefund] = useState(""); const [reason, setReason] = useState(""); const [restock, setRestock] = useState("true");
  const applyProduct = (product_id: string, quantity?: string) => {
    const p = products?.find((x) => x.id === product_id);
    setPid(product_id);
    const q = quantity ?? qty;
    if (p) setRefund((Number(q || 0) * Number(p.selling_price || 0)).toFixed(2));
  };
  const onScan = (code: string) => {
    const p = products?.find((x) => x.barcode === code);
    if (!p) { toast.error(`No product for ${code}`); return; }
    applyProduct(p.id);
    setScanOpen(false);
    toast.success(`Loaded ${p.name}`);
  };
  const save = async () => {
    if (!pid || !qty) return toast.error("Product and qty required");
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase.from("product_returns").insert({ product_id: pid, qty: Number(qty), refund_amount: Number(refund || 0), reason, restock: restock === "true", created_by: u.user!.id });
    if (error) return toast.error(error.message);
    void logActivity("stock", "return", `Return ${Number(qty)} of ${products?.find((p) => p.id === pid)?.name ?? pid}`, { entityId: pid, details: { qty: Number(qty), refund: Number(refund || 0), restock: restock === "true", reason } });
    toast.success("Return recorded");
    setOpen(false); setPid(""); setQty("1"); setRefund(""); setReason("");
    qc.invalidateQueries({ queryKey: ["inv-returns"] });
    qc.invalidateQueries({ queryKey: ["inv-products"] });
    qc.invalidateQueries({ queryKey: ["inv-stock"] });
  };
  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><Plus className="size-4" /> New return</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Customer return</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div className="flex gap-2 items-end">
                <div className="flex-1"><Label>Product</Label>
                  <Select value={pid} onValueChange={(v) => applyProduct(v)}>
                    <SelectTrigger><SelectValue placeholder="Select or scan" /></SelectTrigger>
                    <SelectContent>{products?.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <Button type="button" variant="outline" onClick={() => setScanOpen(true)}><Camera className="size-4" /> Scan</Button>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Qty</Label><Input type="number" step="0.001" value={qty} onChange={(e) => { setQty(e.target.value); if (pid) applyProduct(pid, e.target.value); }} /></div>
                <div><Label>Refund (₹)</Label><Input type="number" step="0.01" value={refund} onChange={(e) => setRefund(e.target.value)} /></div>
              </div>
              <div><Label>Reason</Label><Input value={reason} onChange={(e) => setReason(e.target.value)} /></div>
              <div><Label>Add back to stock?</Label>
                <Select value={restock} onValueChange={setRestock}><SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="true">Yes, restock</SelectItem><SelectItem value="false">No, discard</SelectItem></SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter><Button onClick={save}>Save</Button></DialogFooter>
          </DialogContent>
        </Dialog>
        <CameraScanner open={scanOpen} onClose={() => setScanOpen(false)} onScan={onScan} title="Scan returned item" />
      </div>
      <Card className="p-0 overflow-hidden">
        {!q.data?.length ? <div className="p-8 text-center text-sm text-muted-foreground">No returns.</div> : (
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left"><tr><th className="px-4 py-2.5">Date</th><th className="px-4 py-2.5">Product</th><th className="px-4 py-2.5">Qty</th><th className="px-4 py-2.5">Refund</th><th className="px-4 py-2.5">Reason</th><th className="px-4 py-2.5">Restocked?</th></tr></thead>
            <tbody className="divide-y">{q.data.map((r) => (
              <tr key={r.id}><td className="px-4 py-3">{new Date(r.created_at).toLocaleDateString("en-IN")}</td><td className="px-4 py-3">{(r.products as { name?: string } | null)?.name ?? "—"}</td><td className="px-4 py-3">{Number(r.qty)}</td><td className="px-4 py-3">{inr(r.refund_amount)}</td><td className="px-4 py-3">{r.reason ?? "—"}</td><td className="px-4 py-3">{r.restock ? "Yes" : "No"}</td></tr>
            ))}</tbody>
          </table>
        )}
      </Card>
    </div>
  );
}

/* Below minimum stock — with Create Order draft */
type DraftLine = { product_id: string; name: string; unit: string; qty: number };

function BelowMinTab() {
  const qc = useQueryClient();
  const [brand, setBrand] = useState("__all");
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState<DraftLine[]>([]);
  const [showDraft, setShowDraft] = useState(false);
  const [supplierName, setSupplierName] = useState("");

  const storeId = useStoreId();
  const q = useQuery({
    queryKey: ["inv-belowmin", storeId],
    queryFn: async () => {
      const { data, error } = await supabase.from("products")
        .select("id,name,brand,unit,stock_qty,min_qty,max_qty,purchase_price,mrp,net_weight_g").eq("store_id", storeId).eq("is_active", true);
      if (error) throw error;
      return (data ?? []).filter((p) => Number(p.stock_qty) <= Number(p.min_qty) && Number(p.min_qty) > 0);
    },
    refetchInterval: 2 * 60 * 60 * 1000,
  });
  const brands = useMemo(() => {
    const s = new Set<string>();
    (q.data ?? []).forEach((p) => { if (p.brand) s.add(p.brand); });
    return Array.from(s).sort();
  }, [q.data]);
  const rows = useMemo(() => {
    return (q.data ?? []).filter((p) => {
      if (brand !== "__all" && (p.brand ?? "") !== brand) return false;
      if (search && !p.name.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [q.data, brand, search]);

  const addToDraft = (pid: string, name: string, unit: string, qty: number) => {
    if (qty <= 0) return;
    setDraft((d) => {
      const idx = d.findIndex((x) => x.product_id === pid);
      if (idx >= 0) { const c = [...d]; c[idx] = { ...c[idx], qty }; return c; }
      return [...d, { product_id: pid, name, unit, qty }];
    });
    toast.success(`${name} added to order`);
  };
  const addAllFiltered = () => {
    let added = 0;
    setDraft((d) => {
      const map = new Map(d.map((x) => [x.product_id, x]));
      for (const p of rows) {
        const need = Math.max(0, Number(p.max_qty) - Number(p.stock_qty));
        if (need <= 0) continue;
        map.set(p.id, { product_id: p.id, name: p.name, unit: p.unit, qty: need });
        added++;
      }
      return Array.from(map.values());
    });
    toast.success(`${added} product(s) added`);
  };
  const removeFromDraft = (pid: string) => setDraft((d) => d.filter((x) => x.product_id !== pid));
  const updateDraftQty = (pid: string, qty: number) =>
    setDraft((d) => d.map((x) => x.product_id === pid ? { ...x, qty } : x));

  const createOrder = async () => {
    if (draft.length === 0) return toast.error("Draft is empty");
    const { data: u } = await supabase.auth.getUser();
    const order_no = `PO-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${Math.floor(Math.random() * 10000).toString().padStart(4, "0")}`;
    const supplier = supplierName || (brand !== "__all" ? brand : "");
    const { data: po, error } = await supabase.from("purchase_orders")
      .insert({ order_no, supplier_name: supplier, status: "draft", created_by: u.user!.id, store_id: storeId })
      .select().single();
    if (error) return toast.error(error.message);
    const { error: e2 } = await supabase.from("purchase_order_items").insert(
      draft.map((l) => {
        const prod = (q.data ?? []).find((p) => p.id === l.product_id);
        return {
          po_id: po.id, product_id: l.product_id, product_name: l.name, qty: l.qty, unit: l.unit,
          weight_g: prod?.net_weight_g ?? null,
          unit_cost: Number(prod?.purchase_price ?? 0),
          mrp: Number(prod?.mrp ?? 0),
        };
      })
    );
    if (e2) return toast.error(e2.message);
    toast.success(`Order ${order_no} created`);
    setDraft([]); setShowDraft(false); setSupplierName("");
    qc.invalidateQueries({ queryKey: ["purchase-orders"] });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <Input className="max-w-xs" placeholder="Search product…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <Select value={brand} onValueChange={setBrand}>
          <SelectTrigger className="w-48"><SelectValue placeholder="All companies" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all">All companies</SelectItem>
            {brands.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}
          </SelectContent>
        </Select>
        {brand !== "__all" && rows.length > 0 && (
          <Button variant="secondary" size="sm" onClick={addAllFiltered}>
            <Plus className="size-4" /> Add all {brand} to order
          </Button>
        )}
        <div className="text-xs text-muted-foreground ml-auto flex items-center gap-2">
          <span>{rows.length} item(s)</span>
          {draft.length > 0 && (
            <Button size="sm" variant="outline" onClick={() => setShowDraft(true)}>
              <ShoppingCart className="size-4" /> Draft ({draft.length})
            </Button>
          )}
        </div>
      </div>

      <Card className="p-0 overflow-hidden">
        {!rows.length ? <div className="p-8 text-center text-sm text-muted-foreground">Nothing matches. 🎉</div> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left"><tr>
                <th className="px-4 py-2.5">Product</th><th className="px-4 py-2.5">Company</th>
                <th className="px-4 py-2.5">Stock</th><th className="px-4 py-2.5">Min</th>
                <th className="px-4 py-2.5">Required</th><th className="px-4 py-2.5 text-right">Action</th>
              </tr></thead>
              <tbody className="divide-y">{rows.map((p) => {
                const required = Math.max(0, Number(p.max_qty) - Number(p.stock_qty));
                return (
                  <tr key={p.id}>
                    <td className="px-4 py-3 font-medium">{p.name}</td>
                    <td className="px-4 py-3 text-muted-foreground">{p.brand ?? "—"}</td>
                    <td className="px-4 py-3 text-destructive font-medium">{Number(p.stock_qty)} {p.unit}</td>
                    <td className="px-4 py-3">{Number(p.min_qty)} {p.unit}</td>
                    <td className="px-4 py-3 text-warning font-medium">{required} {p.unit}</td>
                    <td className="px-4 py-3 text-right">
                      <AddToOrderButton
                        defaultQty={required || 1}
                        unit={p.unit}
                        onAdd={(qty) => addToDraft(p.id, p.name, p.unit, qty)}
                      />
                    </td>
                  </tr>
                );
              })}</tbody>
            </table>
          </div>
        )}
      </Card>

      {draft.length > 0 && (
        <div className="flex justify-end">
          <Button size="lg" onClick={() => setShowDraft(true)}>
            <ShoppingCart className="size-4" /> Create order ({draft.length})
          </Button>
        </div>
      )}

      <Dialog open={showDraft} onOpenChange={setShowDraft}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Draft purchase order</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Supplier / Company</Label>
              <Input value={supplierName} onChange={(e) => setSupplierName(e.target.value)} placeholder={brand !== "__all" ? brand : "Supplier name"} />
            </div>
            <Card className="p-0 overflow-hidden max-h-80 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-left"><tr><th className="px-3 py-2">Product</th><th className="px-3 py-2 w-32">Qty</th><th className="px-3 py-2 w-10"></th></tr></thead>
                <tbody className="divide-y">{draft.map((l) => (
                  <tr key={l.product_id}>
                    <td className="px-3 py-2">{l.name}</td>
                    <td className="px-3 py-2">
                      <Input type="number" step="0.001" value={l.qty}
                        onChange={(e) => updateDraftQty(l.product_id, Number(e.target.value))} />
                    </td>
                    <td className="px-3 py-2">
                      <Button size="icon" variant="ghost" onClick={() => removeFromDraft(l.product_id)}>
                        <Trash2 className="size-4" />
                      </Button>
                    </td>
                  </tr>
                ))}</tbody>
              </table>
            </Card>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDraft([])}>Clear</Button>
            <Button onClick={createOrder}>Create order</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function AddToOrderButton({ defaultQty, unit, onAdd }: { defaultQty: number; unit: string; onAdd: (qty: number) => void }) {
  const [open, setOpen] = useState(false);
  const [qty, setQty] = useState(String(defaultQty));
  return (
    <div className="inline-flex">
      <Button size="sm" variant="secondary" className="rounded-r-none" onClick={() => onAdd(defaultQty)}>
        <Plus className="size-3.5" /> Add to order
      </Button>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button size="sm" variant="secondary" className="rounded-l-none border-l border-background/40 px-2">
            <ChevronDown className="size-3.5" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-56 space-y-2">
          <Label className="text-xs">Custom quantity ({unit})</Label>
          <Input type="number" step="0.001" value={qty} onChange={(e) => setQty(e.target.value)} />
          <Button size="sm" className="w-full" onClick={() => { onAdd(Number(qty || 0)); setOpen(false); }}>Add</Button>
        </PopoverContent>
      </Popover>
    </div>
  );
}

/* Expiring soon */
function ExpiringTab() {
  const [days, setDays] = useState("30");
  const storeId = useStoreId();
  const q = useQuery({
    queryKey: ["inv-expiring", storeId, days],
    queryFn: async () => {
      const until = new Date(); until.setDate(until.getDate() + Number(days || 30));
      const { data, error } = await supabase.from("products")
        .select("id,name,brand,unit,stock_qty,expiry_date").eq("store_id", storeId).eq("is_active", true)
        .not("expiry_date", "is", null).lte("expiry_date", until.toISOString().slice(0, 10))
        .order("expiry_date");
      if (error) throw error;
      return data ?? [];
    },
  });
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 justify-end">
        <Label className="text-xs">Within</Label>
        <Select value={days} onValueChange={setDays}>
          <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="7">7 days</SelectItem>
            <SelectItem value="15">15 days</SelectItem>
            <SelectItem value="30">30 days</SelectItem>
            <SelectItem value="60">60 days</SelectItem>
            <SelectItem value="90">90 days</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <Card className="p-0 overflow-hidden">
        {!q.data?.length ? <div className="p-8 text-center text-sm text-muted-foreground">Nothing expiring in this window.</div> : (
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left"><tr><th className="px-4 py-2.5">Product</th><th className="px-4 py-2.5">Company</th><th className="px-4 py-2.5">Stock</th><th className="px-4 py-2.5">Expires</th><th className="px-4 py-2.5">Days left</th></tr></thead>
            <tbody className="divide-y">{q.data.map((p) => {
              const dl = p.expiry_date ? Math.ceil((new Date(p.expiry_date).getTime() - Date.now()) / 86400000) : 0;
              return <tr key={p.id}><td className="px-4 py-3">{p.name}</td><td className="px-4 py-3 text-muted-foreground">{p.brand ?? "—"}</td><td className="px-4 py-3">{Number(p.stock_qty)} {p.unit}</td><td className="px-4 py-3">{p.expiry_date}</td><td className={`px-4 py-3 font-medium ${dl < 7 ? "text-destructive" : "text-warning"}`}>{dl}d</td></tr>;
            })}</tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
