import { createFileRoute } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useStoreId } from "@/lib/active-store";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
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
  Plus, Camera, Upload, Loader2, Boxes, Truck, Sliders, PackageX,
  Undo2, AlertTriangle, CalendarClock, ChevronDown, ShoppingCart, Trash2,
} from "lucide-react";
import { CameraScanner } from "@/components/camera-scanner";
import { extractInvoice } from "@/lib/invoice-ocr.functions";

export const Route = createFileRoute("/_authenticated/inventory")({
  ssr: false,
  validateSearch: (search: Record<string, unknown>) => ({
    tab: typeof search.tab === "string" ? search.tab : undefined,
  }),
  component: InventoryPage,
  head: () => ({ meta: [{ title: "Inventory — Bazaar POS" }] }),
});

type TabDef = { value: string; label: string; icon: React.ComponentType<{ className?: string }>; desc: string; tone: string };
const TABS: TabDef[] = [
  { value: "stock", label: "Stock", icon: Boxes, desc: "All products & levels", tone: "text-primary" },
  { value: "purchases", label: "Purchases", icon: Truck, desc: "Record supplier bills", tone: "text-primary" },
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
        <p className="text-sm text-muted-foreground">Track stock, log purchases, adjustments, damages, and returns.</p>
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
          <TabsContent value="purchases" className="mt-0"><PurchasesTab /></TabsContent>
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
  const q = useQuery({
    queryKey: ["inv-stock", storeId],
    queryFn: async () => {
      const { data, error } = await supabase.from("products")
        .select("id,name,brand,unit,stock_qty,min_qty,max_qty,selling_price,updated_at")
        .eq("store_id", storeId).eq("is_active", true).order("name");
      if (error) throw error;
      return data ?? [];
    },
  });
  const brands = useMemo(() => Array.from(new Set((q.data ?? []).map((p) => p.brand).filter(Boolean) as string[])).sort(), [q.data]);
  const rows = useMemo(() => (q.data ?? []).filter((p) => {
    if (brand !== "__all" && (p.brand ?? "") !== brand) return false;
    if (search && !p.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  }), [q.data, brand, search]);
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

/* Purchases */
type PurchaseRow = {
  product_id: string; name: string; qty: string; cost: string;
  hsn: string; mrp: string; tax_pct: string; barcode: string;
};

function PurchasesTab() {
  const qc = useQueryClient();
  const { data: products } = useProductsList();
  const { data: suppliersList } = useSuppliersList();
  const storeId = useStoreId();
  const q = useQuery({
    queryKey: ["inv-purchases", storeId],
    queryFn: async () => {
      const { data, error } = await supabase.from("purchase_entries").select("id,supplier,invoice_no,total,created_at,purchase_items(id,name,qty,cost)").eq("store_id", storeId).order("created_at", { ascending: false }).limit(50);
      if (error) throw error;
      return data ?? [];
    },
  });
  const [open, setOpen] = useState(false);
  const [supplier, setSupplier] = useState(""); const [invoice, setInvoice] = useState("");
  const [items, setItems] = useState<PurchaseRow[]>([]);
  const [ocrBusy, setOcrBusy] = useState(false);
  const [newProductIdx, setNewProductIdx] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const ocrFn = useServerFn(extractInvoice);

  const patch = (idx: number, p: Partial<PurchaseRow>) =>
    setItems((arr) => arr.map((r, i) => (i === idx ? { ...r, ...p } : r)));

  const handleOcr = async (file: File) => {
    if (file.size > 8 * 1024 * 1024) return toast.error("File too large (max 8 MB)");
    setOcrBusy(true);
    try {
      const dataUrl: string = await new Promise((resolve, reject) => {
        const fr = new FileReader();
        fr.onload = () => resolve(String(fr.result));
        fr.onerror = () => reject(fr.error);
        fr.readAsDataURL(file);
      });
      const res = await ocrFn({ data: { file_data_url: dataUrl, mime: file.type || "image/jpeg" } });
      if (res.supplier && !supplier) setSupplier(res.supplier);
      if (res.invoice_no && !invoice) setInvoice(res.invoice_no);
      const matched: PurchaseRow[] = res.items.map((it) => {
        const byBarcode = it.barcode ? products?.find((p) => p.barcode === it.barcode) : undefined;
        const byName = !byBarcode
          ? products?.find((p) => p.name.toLowerCase() === it.name.toLowerCase())
            ?? products?.find((p) => p.name.toLowerCase().includes(it.name.toLowerCase().slice(0, 12)))
          : undefined;
        const p = byBarcode ?? byName;
        const qty = Number(it.qty) || 1;
        const cost = Number(it.cost) || Number(p?.purchase_price) || 0;
        return {
          product_id: p?.id ?? "",
          name: p?.name ?? it.name,
          qty: String(qty),
          cost: (Math.round(cost * 100) / 100).toFixed(2),
          hsn: it.hsn ?? "",
          mrp: String(it.mrp ?? p?.mrp ?? ""),
          tax_pct: String(it.tax_pct ?? ""),
          barcode: it.barcode ?? p?.barcode ?? "",
        };
      });
      setItems((prev) => [...prev, ...matched]);
      const unmatched = matched.filter((m) => !m.product_id).length;
      toast.success(`Imported ${matched.length} line(s)${unmatched ? ` — ${unmatched} new product(s)` : ""}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "OCR failed");
    } finally {
      setOcrBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const addRow = () => setItems((i) => [...i, { product_id: "", name: "", qty: "1", cost: "0", hsn: "", mrp: "", tax_pct: "", barcode: "" }]);
  const total = items.reduce((s, i) => s + Number(i.qty || 0) * Number(i.cost || 0), 0);

  const save = async () => {
    const rows = items.filter((i) => i.product_id && Number(i.qty) > 0);
    if (rows.length === 0) return toast.error("Add at least one item (or save unmatched lines as products first)");
    const { data: userData } = await supabase.auth.getUser();
    const { data: entry, error } = await supabase.from("purchase_entries").insert({ store_id: storeId, supplier, invoice_no: invoice, total, created_by: userData.user!.id }).select().single();
    if (error) return toast.error(error.message);
    const { error: e2 } = await supabase.from("purchase_items").insert(
      rows.map((r) => ({
        entry_id: entry.id, product_id: r.product_id, name: r.name,
        qty: Number(r.qty), cost: Number(r.cost),
        hsn: r.hsn || null,
        mrp: r.mrp ? Number(r.mrp) : null,
        tax_pct: r.tax_pct ? Number(r.tax_pct) : 0,
      }))
    );
    if (e2) return toast.error(e2.message);

    // Keep supplier directory in sync
    if (supplier.trim() && !suppliersList?.some((s) => s.name.toLowerCase() === supplier.trim().toLowerCase())) {
      await supabase.from("suppliers").insert({ name: supplier.trim(), store_id: storeId });
      qc.invalidateQueries({ queryKey: ["inv-suppliers"] });
      qc.invalidateQueries({ queryKey: ["suppliers"] });
    }

    toast.success("Purchase recorded, stock updated");
    setOpen(false); setSupplier(""); setInvoice(""); setItems([]);
    qc.invalidateQueries({ queryKey: ["inv-purchases"] });
    qc.invalidateQueries({ queryKey: ["inv-products"] });
    qc.invalidateQueries({ queryKey: ["inv-stock"] });
    qc.invalidateQueries({ queryKey: ["inv-belowmin"] });
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><Plus className="size-4" /> New purchase</Button></DialogTrigger>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>Record purchase</DialogTitle></DialogHeader>
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <Label>Supplier</Label>
                <Input value={supplier} onChange={(e) => setSupplier(e.target.value)} list="supplier-datalist" />
                <datalist id="supplier-datalist">
                  {suppliersList?.map((s) => <option key={s.id} value={s.name} />)}
                </datalist>
              </div>
              <div><Label>Invoice No.</Label><Input value={invoice} onChange={(e) => setInvoice(e.target.value)} /></div>
            </div>
            <div className="rounded-md border border-dashed p-3 flex items-center justify-between gap-3 bg-muted/30">
              <div className="text-xs text-muted-foreground">Auto-fill from invoice (photo, scan or PDF) — reads item, HSN, MRP, rate, tax and computes per-piece cost.</div>
              <div>
                <input ref={fileRef} type="file" accept="image/*,application/pdf" className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handleOcr(f); }} />
                <Button size="sm" variant="secondary" disabled={ocrBusy} onClick={() => fileRef.current?.click()}>
                  {ocrBusy ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
                  {ocrBusy ? "Reading…" : "Upload invoice"}
                </Button>
              </div>
            </div>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Items</Label>
                <Button size="sm" variant="outline" onClick={addRow}>+ Add row</Button>
              </div>
              {items.map((it, idx) => (
                <div key={idx} className="rounded-lg border p-3 space-y-2">
                  <div className="grid grid-cols-12 gap-2">
                    <Select value={it.product_id} onValueChange={(v) => {
                      const p = products?.find((x) => x.id === v);
                      patch(idx, { product_id: v, name: p?.name ?? "", cost: String(p?.purchase_price ?? it.cost) });
                    }}>
                      <SelectTrigger className="col-span-6"><SelectValue placeholder={it.name || "Product"} /></SelectTrigger>
                      <SelectContent>{products?.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
                    </Select>
                    <Input className="col-span-3" type="number" step="0.001" placeholder="Qty" value={it.qty} onChange={(e) => patch(idx, { qty: e.target.value })} />
                    <Input className="col-span-3" type="number" step="0.01" placeholder="Cost / piece" value={it.cost} onChange={(e) => patch(idx, { cost: e.target.value })} />
                  </div>
                  <div className="grid grid-cols-12 gap-2">
                    <Input className="col-span-3" placeholder="HSN" value={it.hsn} onChange={(e) => patch(idx, { hsn: e.target.value })} />
                    <Input className="col-span-3" type="number" step="0.01" placeholder="MRP" value={it.mrp} onChange={(e) => patch(idx, { mrp: e.target.value })} />
                    <Input className="col-span-2" type="number" step="0.01" placeholder="Tax %" value={it.tax_pct} onChange={(e) => patch(idx, { tax_pct: e.target.value })} />
                    <Input className="col-span-3" placeholder="Barcode" value={it.barcode} onChange={(e) => patch(idx, { barcode: e.target.value })} />
                    <Button size="icon" variant="ghost" className="col-span-1 text-destructive" onClick={() => setItems((arr) => arr.filter((_, i) => i !== idx))}>
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-xs text-muted-foreground">
                      Line total {inr(Number(it.qty || 0) * Number(it.cost || 0))}
                      {it.product_id ? "" : ` · “${it.name || "unnamed"}” is not in your product list`}
                    </div>
                    {!it.product_id && (
                      <Button size="sm" variant="secondary" onClick={() => setNewProductIdx(idx)}>
                        <Plus className="size-3.5" /> Add to products
                      </Button>
                    )}
                  </div>
                </div>
              ))}
              {items.length === 0 && <div className="text-sm text-muted-foreground">No rows — add items to the purchase.</div>}
            </div>
            <div className="text-right font-semibold">Total: {inr(total)}</div>
            <DialogFooter><Button onClick={save}>Save</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <NewProductFromInvoice
        row={newProductIdx != null ? items[newProductIdx] : null}
        onClose={() => setNewProductIdx(null)}
        onCreated={(id, name, barcode) => {
          if (newProductIdx != null) patch(newProductIdx, { product_id: id, name, barcode });
          setNewProductIdx(null);
          qc.invalidateQueries({ queryKey: ["inv-products"] });
          qc.invalidateQueries({ queryKey: ["inv-stock"] });
          qc.invalidateQueries({ queryKey: ["products"] });
        }}
      />

      <Card className="p-0 overflow-hidden">
        {!q.data?.length ? <div className="p-8 text-center text-sm text-muted-foreground">No purchases yet.</div> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left"><tr>
                <th className="px-4 py-2.5">Date</th><th className="px-4 py-2.5">Supplier</th><th className="px-4 py-2.5">Invoice</th><th className="px-4 py-2.5">Items</th><th className="px-4 py-2.5">Total</th>
              </tr></thead>
              <tbody className="divide-y">
                {q.data.map((r) => (
                  <tr key={r.id}>
                    <td className="px-4 py-3">{new Date(r.created_at).toLocaleDateString("en-IN")}</td>
                    <td className="px-4 py-3">{r.supplier ?? "—"}</td>
                    <td className="px-4 py-3">{r.invoice_no ?? "—"}</td>
                    <td className="px-4 py-3">{r.purchase_items?.length ?? 0}</td>
                    <td className="px-4 py-3">{inr(r.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

/* Save an unmatched invoice line as a new product (with barcode scanning) */
function NewProductFromInvoice({ row, onClose, onCreated }: {
  row: PurchaseRow | null;
  onClose: () => void;
  onCreated: (id: string, name: string, barcode: string) => void;
}) {
  const [name, setName] = useState("");
  const [brand, setBrand] = useState("");
  const [barcode, setBarcode] = useState("");
  const [mrp, setMrp] = useState("");
  const [cost, setCost] = useState("");
  const [selling, setSelling] = useState("");
  const [tax, setTax] = useState("");
  const [minQty, setMinQty] = useState("5");
  const [maxQty, setMaxQty] = useState("50");
  const [scanOpen, setScanOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [seed, setSeed] = useState<PurchaseRow | null>(null);
  const storeId = useStoreId();

  if (row && row !== seed) {
    setSeed(row);
    setName(row.name); setBarcode(row.barcode); setMrp(row.mrp);
    setCost(row.cost); setSelling(row.mrp || ""); setTax(row.tax_pct); setBrand("");
  }

  const save = async () => {
    if (!name.trim()) return toast.error("Product name required");
    setSaving(true);
    try {
      const purchase = Number(cost) || 0;
      const sell = Number(selling) || Number(mrp) || 0;
      const margin = purchase > 0 ? ((sell - purchase) / purchase) * 100 : 0;
      const { data, error } = await supabase.from("products").insert({
        store_id: storeId,
        name: name.trim(),
        brand: brand.trim() || null,
        barcode: barcode.trim() || null,
        mrp: Number(mrp) || sell,
        purchase_price: purchase,
        selling_price: sell,
        margin_pct: Math.round(margin * 100) / 100,
        tax_pct: Number(tax) || 0,
        min_qty: Number(minQty) || 0,
        max_qty: Number(maxQty) || 0,
        stock_qty: 0,
        is_active: true,
      }).select("id,name").single();
      if (error) throw error;
      toast.success(`${data.name} added to products`);
      onCreated(data.id, data.name, barcode.trim());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save product");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={!!row} onOpenChange={(v) => { if (!v) { setSeed(null); onClose(); } }}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Add “{row?.name}” to products</DialogTitle></DialogHeader>
        <div className="grid sm:grid-cols-2 gap-3">
          <div className="sm:col-span-2"><Label>Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div><Label>Company / brand</Label><Input value={brand} onChange={(e) => setBrand(e.target.value)} /></div>
          <div>
            <Label>Barcode</Label>
            <div className="flex gap-2">
              <Input value={barcode} onChange={(e) => setBarcode(e.target.value)} placeholder="Scan or type" />
              <Button type="button" variant="outline" size="icon" onClick={() => setScanOpen(true)}><Camera className="size-4" /></Button>
            </div>
          </div>
          <div><Label>Purchase price</Label><Input type="number" step="0.01" value={cost} onChange={(e) => setCost(e.target.value)} /></div>
          <div><Label>MRP</Label><Input type="number" step="0.01" value={mrp} onChange={(e) => setMrp(e.target.value)} /></div>
          <div><Label>Selling price</Label><Input type="number" step="0.01" value={selling} onChange={(e) => setSelling(e.target.value)} /></div>
          <div><Label>Tax %</Label><Input type="number" step="0.01" value={tax} onChange={(e) => setTax(e.target.value)} /></div>
          <div><Label>Min qty</Label><Input type="number" value={minQty} onChange={(e) => setMinQty(e.target.value)} /></div>
          <div><Label>Max qty</Label><Input type="number" value={maxQty} onChange={(e) => setMaxQty(e.target.value)} /></div>
        </div>
        <p className="text-xs text-muted-foreground">Stock stays at 0 — saving the purchase adds the invoice quantity.</p>
        <DialogFooter>
          <Button onClick={save} disabled={saving}>{saving ? <Loader2 className="size-4 animate-spin" /> : null} Save product</Button>
        </DialogFooter>
      </DialogContent>
      <CameraScanner
        open={scanOpen}
        onClose={() => setScanOpen(false)}
        title="Scan product barcode"
        onScan={(code) => { setBarcode(code); setScanOpen(false); toast.success(`Barcode ${code}`); }}
      />
    </Dialog>
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
