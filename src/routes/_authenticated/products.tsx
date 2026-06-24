import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Search, Pencil, AlertTriangle, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { inr, num } from "@/lib/format";
import { canManage, useMyRoles } from "@/hooks/use-role";

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
  active: boolean;
};

function ProductsPage() {
  const qc = useQueryClient();
  const { data: roles } = useMyRoles();
  const allowed = canManage(roles);
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<Product | null>(null);
  const [open, setOpen] = useState(false);

  const products = useQuery({
    queryKey: ["products"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("*")
        .order("name");
      if (error) throw error;
      return data as Product[];
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
          <Button onClick={() => { setEditing(null); setOpen(true); }}>
            <Plus className="size-4 mr-1.5" /> Add product
          </Button>
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
                <tr><td colSpan={10} className="px-4 py-10 text-center text-muted-foreground">No products yet. Add your first product to start billing.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <ProductDialog
        open={open}
        onOpenChange={setOpen}
        editing={editing}
        categories={categories.data ?? []}
        onSaved={() => { qc.invalidateQueries({ queryKey: ["products"] }); qc.invalidateQueries({ queryKey: ["dashboard-stats"] }); }}
      />
    </div>
  );
}

function ProductDialog({
  open, onOpenChange, editing, categories, onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editing: Product | null;
  categories: { id: string; name: string }[];
  onSaved: () => void;
}) {
  const [name, setName] = useState("");
  const [barcode, setBarcode] = useState("");
  const [categoryId, setCategoryId] = useState<string>("");
  const [unit, setUnit] = useState("pcs");
  const [cost, setCost] = useState("0");
  const [margin, setMargin] = useState("0");
  const [selling, setSelling] = useState("0");
  const [tax, setTax] = useState("0");
  const [stock, setStock] = useState("0");
  const [minQ, setMinQ] = useState("0");
  const [saving, setSaving] = useState(false);

  // Reset form when dialog opens
  useMemo(() => {
    if (!open) return;
    if (editing) {
      setName(editing.name); setBarcode(editing.barcode ?? "");
      setCategoryId(editing.category_id ?? ""); setUnit(editing.unit);
      setCost(String(editing.cost_price)); setMargin(String(editing.margin_pct));
      setSelling(String(editing.selling_price)); setTax(String(editing.tax_pct));
      setStock(String(editing.stock_qty)); setMinQ(String(editing.min_qty));
    } else {
      setName(""); setBarcode(""); setCategoryId(""); setUnit("pcs");
      setCost("0"); setMargin("0"); setSelling("0"); setTax("0"); setStock("0"); setMinQ("0");
    }
  }, [open, editing]);

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
        margin_pct: Number(margin) || 0,
        selling_price: Number(selling) || 0,
        tax_pct: Number(tax) || 0,
        stock_qty: Number(stock) || 0,
        min_qty: Number(minQ) || 0,
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
            <Input value={barcode} onChange={(e) => setBarcode(e.target.value)} placeholder="Scan or type" />
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
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={saving}>{editing ? "Save changes" : "Add product"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
