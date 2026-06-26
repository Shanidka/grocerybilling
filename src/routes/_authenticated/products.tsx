import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Search, Pencil, AlertTriangle, Trash2, ScanBarcode, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { inr, num } from "@/lib/format";
import { canManage, useMyRoles } from "@/hooks/use-role";
import { CameraScanner, ScannerPanel } from "@/components/camera-scanner";

const PRODUCTS_CACHE_KEY = "freshmart.products.cache.v1";

export const Route = createFileRoute("/_authenticated/products")({
  component: ProductsPage,
  head: () => ({ meta: [{ title: "Products — FreshMart POS" }] }),
});

type Product = {
  id: string;
  name: string;
  barcode: string | null;
  category_id: string | null;
  unit: string;
  cost_price: number;
  mrp: number;
  margin_pct: number;
  selling_price: number;
  tax_pct: number;
  stock_qty: number;
  min_qty: number;
  max_qty: number;
  active: boolean;
};

function ProductsPage() {
  const qc = useQueryClient();
  const { data: roles } = useMyRoles();
  const allowed = canManage(roles);
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<Product | null>(null);
  const [open, setOpen] = useState(false);
  const [prefillBarcode, setPrefillBarcode] = useState<string>("");
  const [bulkOpen, setBulkOpen] = useState(false);

  const products = useQuery({
    queryKey: ["products"],
    queryFn: async () => {
      try {
        const { data, error } = await supabase
          .from("products")
          .select("*")
          .order("name");
        if (error) throw error;
        // Cache for offline
        if (typeof window !== "undefined") {
          try { localStorage.setItem(PRODUCTS_CACHE_KEY, JSON.stringify(data)); } catch { /* ignore */ }
        }
        return data as Product[];
      } catch (e) {
        // Offline fallback
        if (typeof window !== "undefined") {
          const raw = localStorage.getItem(PRODUCTS_CACHE_KEY);
          if (raw) {
            toast.message("Offline — showing cached products");
            return JSON.parse(raw) as Product[];
          }
        }
        throw e;
      }
    },
  });

  const categories = useQuery({
    queryKey: ["categories"],
    queryFn: async () => {
      const { data, error } = await supabase.from("categories").select("*").order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("products").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Product deleted");
      qc.invalidateQueries({ queryKey: ["products"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const filtered = useMemo(() => {
    const list = products.data ?? [];
    if (!q.trim()) return list;
    const term = q.toLowerCase();
    return list.filter(
      (p) => p.name.toLowerCase().includes(term) || p.barcode?.toLowerCase().includes(term),
    );
  }, [products.data, q]);

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6">
      <div className="flex items-start md:items-center justify-between gap-3 flex-col md:flex-row">
        <div>
          <h1 className="text-2xl md:text-3xl font-semibold">Products</h1>
          <p className="text-muted-foreground text-sm">Manage catalog, pricing & stock</p>
        </div>
        {allowed && (
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setBulkOpen(true)}>
              <ScanBarcode className="size-4 mr-1.5" /> Bulk scan
            </Button>
            <Button onClick={() => { setEditing(null); setPrefillBarcode(""); setOpen(true); }}>
              <Plus className="size-4 mr-1.5" /> Add product
            </Button>
          </div>
        )}
      </div>

      <Card className="p-4">
        <div className="relative max-w-sm">
          <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-9" placeholder="Search by name or barcode..." value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/60 text-muted-foreground">
              <tr className="text-left">
                <th className="px-4 py-3 font-medium">Product</th>
                <th className="px-4 py-3 font-medium">Barcode</th>
                <th className="px-4 py-3 font-medium text-right">Cost</th>
                <th className="px-4 py-3 font-medium text-right">MRP</th>
                <th className="px-4 py-3 font-medium text-right">Margin %</th>
                <th className="px-4 py-3 font-medium text-right">Selling</th>
                <th className="px-4 py-3 font-medium text-right">GST %</th>
                <th className="px-4 py-3 font-medium text-right">Stock</th>
                <th className="px-4 py-3 font-medium text-right">Min</th>
                <th className="px-4 py-3 font-medium text-right">Max</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => {
                const low = Number(p.stock_qty) <= Number(p.min_qty);
                return (
                  <tr key={p.id} className="border-t hover:bg-muted/30">
                    <td className="px-4 py-3">
                      <div className="font-medium flex items-center gap-2">
                        {p.name}
                        {low && <AlertTriangle className="size-3.5 text-warning-foreground" />}
                      </div>
                      <div className="text-xs text-muted-foreground">{p.unit}</div>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs">{p.barcode || "—"}</td>
                    <td className="px-4 py-3 text-right">{inr(p.cost_price)}</td>
                    <td className="px-4 py-3 text-right">{inr(p.mrp)}</td>
                    <td className="px-4 py-3 text-right">{num(p.margin_pct)}%</td>
                    <td className="px-4 py-3 text-right font-semibold">{inr(p.selling_price)}</td>
                    <td className="px-4 py-3 text-right">{num(p.tax_pct)}%</td>
                    <td className={`px-4 py-3 text-right ${low ? "text-warning-foreground font-medium" : ""}`}>{num(p.stock_qty)}</td>
                    <td className="px-4 py-3 text-right">{num(p.min_qty)}</td>
                    <td className="px-4 py-3 text-right">{num(p.max_qty)}</td>
                    <td className="px-4 py-3 text-right">
                      {allowed && (
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="icon" onClick={() => { setEditing(p); setOpen(true); }}>
                            <Pencil className="size-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => { if (confirm(`Delete ${p.name}?`)) del.mutate(p.id); }}>
                            <Trash2 className="size-4" />
                          </Button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
              {!filtered.length && (
                <tr><td colSpan={11} className="px-4 py-10 text-center text-muted-foreground">No products yet. Add your first product to start billing.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <ProductDialog
        open={open}
        onOpenChange={setOpen}
        editing={editing}
        prefillBarcode={prefillBarcode}
        categories={categories.data ?? []}
        onSaved={() => { qc.invalidateQueries({ queryKey: ["products"] }); qc.invalidateQueries({ queryKey: ["dashboard-stats"] }); }}
      />

      <BulkScanDialog
        open={bulkOpen}
        onClose={() => setBulkOpen(false)}
        products={products.data ?? []}
        onAddNew={(code) => {
          setBulkOpen(false);
          setEditing(null);
          setPrefillBarcode(code);
          setOpen(true);
        }}
        onStocked={() => qc.invalidateQueries({ queryKey: ["products"] })}
      />
    </div>
  );
}

function ProductDialog({
  open, onOpenChange, editing, prefillBarcode, categories, onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editing: Product | null;
  prefillBarcode?: string;
  categories: { id: string; name: string }[];
  onSaved: () => void;
}) {
  const [name, setName] = useState("");
  const [barcode, setBarcode] = useState("");
  const [categoryId, setCategoryId] = useState<string>("");
  const [unit, setUnit] = useState("pcs");
  const [cost, setCost] = useState("0");
  const [mrp, setMrp] = useState("0");
  const [margin, setMargin] = useState("0");
  const [selling, setSelling] = useState("0");
  const [tax, setTax] = useState("0");
  const [stock, setStock] = useState("0");
  const [minQ, setMinQ] = useState("0");
  const [maxQ, setMaxQ] = useState("0");
  const [saving, setSaving] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);

  // Reset form when dialog opens
  useMemo(() => {
    if (!open) return;
    if (editing) {
      setName(editing.name); setBarcode(editing.barcode ?? "");
      setCategoryId(editing.category_id ?? ""); setUnit(editing.unit);
      setCost(String(editing.cost_price)); setMrp(String(editing.mrp ?? 0)); setMargin(String(editing.margin_pct));
      setSelling(String(editing.selling_price)); setTax(String(editing.tax_pct));
      setStock(String(editing.stock_qty)); setMinQ(String(editing.min_qty)); setMaxQ(String(editing.max_qty ?? 0));
    } else {
      setName(""); setBarcode(prefillBarcode ?? ""); setCategoryId(""); setUnit("pcs");
      setCost("0"); setMrp("0"); setMargin("0"); setSelling("0"); setTax("0"); setStock("0"); setMinQ("0"); setMaxQ("0");
    }
  }, [open, editing, prefillBarcode]);

  // Two-way: margin <-> selling, anchored on cost
  const onCost = (v: string) => {
    setCost(v);
    const c = Number(v); const m = Number(margin);
    if (!isNaN(c) && !isNaN(m)) setSelling((c * (1 + m / 100)).toFixed(2));
  };
  const onMargin = (v: string) => {
    setMargin(v);
    const c = Number(cost); const m = Number(v);
    if (!isNaN(c) && !isNaN(m)) setSelling((c * (1 + m / 100)).toFixed(2));
  };
  const onSelling = (v: string) => {
    setSelling(v);
    const c = Number(cost); const s = Number(v);
    if (!isNaN(c) && c > 0 && !isNaN(s)) setMargin(((s / c - 1) * 100).toFixed(2));
  };

  const save = async () => {
    if (!name.trim()) { toast.error("Name is required"); return; }
    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        barcode: barcode.trim() || null,
        category_id: categoryId || null,
        unit: unit.trim() || "pcs",
        cost_price: Number(cost) || 0,
        mrp: Number(mrp) || 0,
        margin_pct: Number(margin) || 0,
        selling_price: Number(selling) || 0,
        tax_pct: Number(tax) || 0,
        stock_qty: Number(stock) || 0,
        min_qty: Number(minQ) || 0,
        max_qty: Number(maxQ) || 0,
      };
      if (editing) {
        const { error } = await supabase.from("products").update(payload).eq("id", editing.id);
        if (error) throw error;
        toast.success("Product updated");
      } else {
        const { error } = await supabase.from("products").insert(payload);
        if (error) throw error;
        toast.success("Product added");
      }
      onSaved();
      onOpenChange(false);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit product" : "Add product"}</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5 md:col-span-2">
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Aashirvaad Atta 5kg" />
          </div>
          <div className="space-y-1.5">
            <Label>Barcode (optional)</Label>
            <div className="flex gap-2">
              <Input value={barcode} onChange={(e) => setBarcode(e.target.value)} placeholder="Scan or type" />
              <Button type="button" variant="outline" size="icon" onClick={() => setScanOpen(true)} title="Scan with camera">
                <ScanBarcode className="size-4" />
              </Button>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Unit</Label>
            <Input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="pcs, kg, ltr" />
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <Label>Category</Label>
            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger><SelectValue placeholder="(none)" /></SelectTrigger>
              <SelectContent>
                {categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="md:col-span-2 grid grid-cols-3 gap-3 p-3 rounded-lg bg-muted/40 border">
            <div className="space-y-1.5">
              <Label className="text-xs">Cost price</Label>
              <Input type="number" step="0.01" value={cost} onChange={(e) => onCost(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Margin %</Label>
              <Input type="number" step="0.01" value={margin} onChange={(e) => onMargin(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Selling price</Label>
              <Input type="number" step="0.01" value={selling} onChange={(e) => onSelling(e.target.value)} />
            </div>
            <p className="col-span-3 text-xs text-muted-foreground">Edit any of these three — the others recalculate automatically.</p>
          </div>

          <div className="space-y-1.5">
            <Label>MRP</Label>
            <Input type="number" step="0.01" value={mrp} onChange={(e) => setMrp(e.target.value)} placeholder="Maximum retail price" />
          </div>

          <div className="space-y-1.5">
            <Label>GST %</Label>
            <Input type="number" step="0.01" value={tax} onChange={(e) => setTax(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Stock</Label>
            <Input type="number" step="0.001" value={stock} onChange={(e) => setStock(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Min stock (alert)</Label>
            <Input type="number" step="0.001" value={minQ} onChange={(e) => setMinQ(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Max stock (reorder target)</Label>
            <Input type="number" step="0.001" value={maxQ} onChange={(e) => setMaxQ(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={saving}>{editing ? "Save changes" : "Add product"}</Button>
        </DialogFooter>
      </DialogContent>
      <CameraScanner
        open={scanOpen}
        onClose={() => setScanOpen(false)}
        onScan={(code) => { setBarcode(code); setScanOpen(false); toast.success(`Barcode: ${code}`); }}
        title="Scan product barcode"
      />
    </Dialog>
  );
}

function BulkScanDialog({
  open, onClose, products, onAddNew, onStocked,
}: {
  open: boolean;
  onClose: () => void;
  products: Product[];
  onAddNew: (code: string) => void;
  onStocked: () => void;
}) {
  const [items, setItems] = useState<Array<{ code: string; format: string; count: number; product: Product | null }>>([]);

  useEffect(() => {
    if (!open) setItems([]);
  }, [open]);

  const byBarcode = useMemo(() => {
    const m = new Map<string, Product>();
    for (const p of products) if (p.barcode) m.set(p.barcode, p);
    return m;
  }, [products]);

  const handleScan = (code: string, format: string) => {
    setItems((prev) => {
      const idx = prev.findIndex((i) => i.code === code);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { ...next[idx], count: next[idx].count + 1 };
        return next;
      }
      return [{ code, format, count: 1, product: byBarcode.get(code) ?? null }, ...prev];
    });
  };

  const commitStock = async (code: string, addQty: number) => {
    const p = byBarcode.get(code);
    if (!p) return;
    const newQty = Number(p.stock_qty) + addQty;
    const { error } = await supabase.from("products").update({ stock_qty: newQty }).eq("id", p.id);
    if (error) { toast.error(error.message); return; }
    toast.success(`${p.name}: stock +${addQty}`);
    setItems((prev) => prev.filter((i) => i.code !== code));
    onStocked();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Bulk scan</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <ScannerPanel active={open} continuous onScan={handleScan} onCameraError={onClose} />
          </div>
          <div className="space-y-2 max-h-[60vh] overflow-y-auto">
            <div className="text-xs text-muted-foreground">Scanned ({items.length})</div>
            {items.length === 0 && (
              <div className="text-sm text-muted-foreground border rounded-md p-6 text-center">
                Point the camera at barcodes. Each new code appears here.
              </div>
            )}
            {items.map((it) => (
              <div key={it.code} className="border rounded-md p-2.5 flex items-center gap-2">
                <div className="flex-1 min-w-0">
                  <div className="font-mono text-xs truncate">{it.code}</div>
                  <div className="text-xs text-muted-foreground">
                    {it.product ? it.product.name : "New product"} · scanned ×{it.count}
                  </div>
                </div>
                {it.product ? (
                  <Button size="sm" onClick={() => commitStock(it.code, it.count)}>
                    +{it.count} stock
                  </Button>
                ) : (
                  <Button size="sm" variant="outline" onClick={() => onAddNew(it.code)}>
                    Add new
                  </Button>
                )}
                <Button size="icon" variant="ghost" onClick={() => setItems((p) => p.filter((i) => i.code !== it.code))}>
                  <X className="size-4" />
                </Button>
              </div>
            ))}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


