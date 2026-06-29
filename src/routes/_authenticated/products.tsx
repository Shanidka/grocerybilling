import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScannerPanel } from "@/components/camera-scanner";
import { Package, Plus, Search, Sparkles, Loader2, Camera, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { lookupBarcode } from "@/lib/barcode-lookup.functions";
import { inr } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/products")({
  ssr: false,
  component: ProductsPage,
  head: () => ({ meta: [{ title: "Products — Bazaar POS" }] }),
});

type ProductRow = {
  id: string; barcode: string | null; name: string; brand: string | null;
  category_id: string | null; unit: string; sold_by: string;
  purchase_price: number; selling_price: number; mrp: number; price_per_kg: number;
  net_weight_g: number | null; tax_pct: number; margin_pct: number;
  stock_qty: number; min_qty: number; max_qty: number;
  mfg_date: string | null; expiry_date: string | null; is_active: boolean;
};

const empty = {
  barcode: "", name: "", brand: "", category_id: "", unit: "pcs", sold_by: "unit",
  purchase_price: "", selling_price: "", mrp: "", price_per_kg: "", net_weight_g: "",
  tax_pct: "0", margin_pct: "", stock_qty: "0", min_qty: "0", max_qty: "0",
  mfg_date: "", expiry_date: "", is_active: true,
};

function ProductsPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ProductRow | null>(null);
  const [scanOpen, setScanOpen] = useState(false);
  const [form, setForm] = useState<typeof empty>(empty);
  const [looking, setLooking] = useState(false);
  const [saving, setSaving] = useState(false);
  const lookupFn = useServerFn(lookupBarcode);

  const productsQ = useQuery({
    queryKey: ["all-products"],
    queryFn: async () => {
      const { data, error } = await supabase.from("products").select("*").order("name");
      if (error) throw error;
      return (data ?? []) as unknown as ProductRow[];
    },
  });

  const categoriesQ = useQuery({
    queryKey: ["categories"],
    queryFn: async () => {
      const { data, error } = await supabase.from("categories").select("id,name").order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return productsQ.data ?? [];
    return (productsQ.data ?? []).filter((p) =>
      p.name.toLowerCase().includes(q) ||
      (p.barcode ?? "").toLowerCase().includes(q) ||
      (p.brand ?? "").toLowerCase().includes(q),
    );
  }, [productsQ.data, search]);

  const openNew = () => { setEditing(null); setForm(empty); setOpen(true); };
  const openEdit = (p: ProductRow) => {
    setEditing(p);
    setForm({
      barcode: p.barcode ?? "", name: p.name, brand: p.brand ?? "", category_id: p.category_id ?? "",
      unit: p.unit, sold_by: p.sold_by,
      purchase_price: String(p.purchase_price), selling_price: String(p.selling_price),
      mrp: String(p.mrp), price_per_kg: String(p.price_per_kg),
      net_weight_g: p.net_weight_g != null ? String(p.net_weight_g) : "",
      tax_pct: String(p.tax_pct), margin_pct: String(p.margin_pct),
      stock_qty: String(p.stock_qty), min_qty: String(p.min_qty), max_qty: String(p.max_qty),
      mfg_date: p.mfg_date ?? "", expiry_date: p.expiry_date ?? "", is_active: p.is_active,
    });
    setOpen(true);
  };

  // Two-way margin <-> selling
  const recalcFromMargin = (margin: string) => {
    const cost = parseFloat(form.purchase_price) || 0;
    const m = parseFloat(margin) || 0;
    const sp = cost * (1 + m / 100);
    setForm((f) => ({ ...f, margin_pct: margin, selling_price: sp ? sp.toFixed(2) : "" }));
  };
  const recalcFromSelling = (sp: string) => {
    const cost = parseFloat(form.purchase_price) || 0;
    const s = parseFloat(sp) || 0;
    const m = cost > 0 ? ((s - cost) / cost) * 100 : 0;
    setForm((f) => ({ ...f, selling_price: sp, margin_pct: cost > 0 ? m.toFixed(2) : "" }));
  };

  const autofill = async (barcode: string) => {
    if (!barcode) return;
    setLooking(true);
    try {
      const r = await lookupFn({ data: { barcode } });
      if (r.source === "none") {
        toast.info(`No info found for ${barcode}. Enter manually.`);
        return;
      }
      setForm((f) => ({
        ...f,
        name: f.name || r.name || "",
        brand: f.brand || r.brand || "",
        net_weight_g: f.net_weight_g || (r.net_weight_g ? String(r.net_weight_g) : ""),
      }));
      toast.success(`Auto-filled from ${r.source === "openfoodfacts" ? "OpenFoodFacts" : "AI"}`);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Lookup failed");
    } finally { setLooking(false); }
  };

  const save = async () => {
    if (!form.name.trim()) return toast.error("Name required");
    setSaving(true);
    const payload = {
      barcode: form.barcode || null,
      name: form.name.trim(),
      brand: form.brand || null,
      category_id: form.category_id || null,
      unit: form.unit, sold_by: form.sold_by,
      purchase_price: Number(form.purchase_price) || 0,
      selling_price: Number(form.selling_price) || 0,
      mrp: Number(form.mrp) || 0,
      price_per_kg: Number(form.price_per_kg) || 0,
      net_weight_g: form.net_weight_g ? Number(form.net_weight_g) : null,
      tax_pct: Number(form.tax_pct) || 0,
      margin_pct: Number(form.margin_pct) || 0,
      stock_qty: Number(form.stock_qty) || 0,
      min_qty: Number(form.min_qty) || 0,
      max_qty: Number(form.max_qty) || 0,
      mfg_date: form.mfg_date || null,
      expiry_date: form.expiry_date || null,
      is_active: form.is_active,
    };
    const res = editing
      ? await supabase.from("products").update(payload).eq("id", editing.id)
      : await supabase.from("products").insert(payload);
    setSaving(false);
    if (res.error) return toast.error(res.error.message);
    toast.success(editing ? "Updated" : "Product added");
    setOpen(false);
    qc.invalidateQueries({ queryKey: ["all-products"] });
    qc.invalidateQueries({ queryKey: ["billing-products"] });
  };

  const remove = async (p: ProductRow) => {
    if (!confirm(`Delete ${p.name}?`)) return;
    const { error } = await supabase.from("products").update({ is_active: false }).eq("id", p.id);
    if (error) return toast.error(error.message);
    toast.success("Archived");
    qc.invalidateQueries({ queryKey: ["all-products"] });
  };

  return (
    <div className="p-4 lg:p-6 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <Package className="size-5 text-primary" />
          <h1 className="text-2xl font-semibold tracking-tight">Products</h1>
          <Badge variant="secondary">{productsQ.data?.length ?? 0}</Badge>
        </div>
        <Button onClick={openNew}><Plus className="size-4" /> Add product</Button>
      </div>

      <Card className="p-3">
        <div className="relative">
          <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search by name, brand or barcode…" className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </Card>

      <Card>
        <div className="overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Barcode</TableHead>
                <TableHead>Sold by</TableHead>
                <TableHead className="text-right">Cost</TableHead>
                <TableHead className="text-right">MRP</TableHead>
                <TableHead className="text-right">Price</TableHead>
                <TableHead className="text-right">Stock</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((p) => (
                <TableRow key={p.id} className={!p.is_active ? "opacity-50" : ""}>
                  <TableCell>
                    <div className="font-medium">{p.name}</div>
                    <div className="text-xs text-muted-foreground">{p.brand ?? "—"}</div>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{p.barcode ?? "—"}</TableCell>
                  <TableCell>
                    {p.sold_by === "weight"
                      ? <Badge variant="outline">per kg</Badge>
                      : <Badge variant="outline">unit</Badge>}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{inr(p.purchase_price)}</TableCell>
                  <TableCell className="text-right tabular-nums">{inr(p.mrp)}</TableCell>
                  <TableCell className="text-right tabular-nums font-medium">
                    {p.sold_by === "weight" ? `${inr(p.price_per_kg)}/kg` : inr(p.selling_price)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    <span className={Number(p.stock_qty) <= Number(p.min_qty) ? "text-destructive font-semibold" : ""}>
                      {Number(p.stock_qty)} {p.unit}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button size="icon" variant="ghost" onClick={() => openEdit(p)}><Pencil className="size-4" /></Button>
                    <Button size="icon" variant="ghost" className="text-destructive" onClick={() => remove(p)}><Trash2 className="size-4" /></Button>
                  </TableCell>
                </TableRow>
              ))}
              {filtered.length === 0 && (
                <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-10">No products yet.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit product" : "Add product"}</DialogTitle>
            <DialogDescription>Scan a barcode to auto-fill name &amp; weight when possible.</DialogDescription>
          </DialogHeader>

          <Tabs defaultValue="basic">
            <TabsList className="grid grid-cols-3 w-full">
              <TabsTrigger value="basic">Basics</TabsTrigger>
              <TabsTrigger value="pricing">Pricing</TabsTrigger>
              <TabsTrigger value="stock">Stock &amp; Dates</TabsTrigger>
            </TabsList>

            <TabsContent value="basic" className="space-y-3 pt-4">
              <div className="grid sm:grid-cols-[1fr_auto_auto] gap-2">
                <div>
                  <Label className="text-xs">Barcode</Label>
                  <Input value={form.barcode} onChange={(e) => setForm({ ...form, barcode: e.target.value })} placeholder="8901234567890" />
                </div>
                <div className="flex items-end">
                  <Button type="button" variant="outline" onClick={() => setScanOpen(true)}><Camera className="size-4" /> Scan</Button>
                </div>
                <div className="flex items-end">
                  <Button type="button" variant="outline" onClick={() => autofill(form.barcode)} disabled={!form.barcode || looking}>
                    {looking ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />} Auto-fill
                  </Button>
                </div>
              </div>
              <div className="grid sm:grid-cols-2 gap-3">
                <Field label="Name *"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
                <Field label="Brand"><Input value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} /></Field>
                <Field label="Category">
                  <Select value={form.category_id || "none"} onValueChange={(v) => setForm({ ...form, category_id: v === "none" ? "" : v })}>
                    <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">—</SelectItem>
                      {categoriesQ.data?.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Unit">
                  <Select value={form.unit} onValueChange={(v) => setForm({ ...form, unit: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pcs">pcs</SelectItem>
                      <SelectItem value="kg">kg</SelectItem>
                      <SelectItem value="g">g</SelectItem>
                      <SelectItem value="L">L</SelectItem>
                      <SelectItem value="ml">ml</SelectItem>
                      <SelectItem value="pack">pack</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Net weight (g)">
                  <Input type="number" value={form.net_weight_g} onChange={(e) => setForm({ ...form, net_weight_g: e.target.value })} placeholder="e.g. 500" />
                </Field>
                <Field label="GST %">
                  <Input type="number" value={form.tax_pct} onChange={(e) => setForm({ ...form, tax_pct: e.target.value })} />
                </Field>
              </div>
            </TabsContent>

            <TabsContent value="pricing" className="space-y-3 pt-4">
              <Field label="Sold by">
                <Select value={form.sold_by} onValueChange={(v) => setForm({ ...form, sold_by: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unit">Unit / piece</SelectItem>
                    <SelectItem value="weight">Weight (price per kg)</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              {form.sold_by === "unit" ? (
                <div className="grid sm:grid-cols-2 gap-3">
                  <Field label="Purchase price (cost)">
                    <Input type="number" value={form.purchase_price} onChange={(e) => { setForm({ ...form, purchase_price: e.target.value }); }} />
                  </Field>
                  <Field label="MRP"><Input type="number" value={form.mrp} onChange={(e) => setForm({ ...form, mrp: e.target.value })} /></Field>
                  <Field label="Margin %">
                    <Input type="number" value={form.margin_pct} onChange={(e) => recalcFromMargin(e.target.value)} placeholder="auto from selling" />
                  </Field>
                  <Field label="Selling price">
                    <Input type="number" value={form.selling_price} onChange={(e) => recalcFromSelling(e.target.value)} />
                  </Field>
                </div>
              ) : (
                <div className="grid sm:grid-cols-2 gap-3">
                  <Field label="Purchase price per kg">
                    <Input type="number" value={form.purchase_price} onChange={(e) => setForm({ ...form, purchase_price: e.target.value })} />
                  </Field>
                  <Field label="Selling price per kg *">
                    <Input type="number" value={form.price_per_kg} onChange={(e) => setForm({ ...form, price_per_kg: e.target.value })} />
                  </Field>
                </div>
              )}
            </TabsContent>

            <TabsContent value="stock" className="space-y-3 pt-4">
              <div className="grid sm:grid-cols-3 gap-3">
                <Field label="Stock qty"><Input type="number" value={form.stock_qty} onChange={(e) => setForm({ ...form, stock_qty: e.target.value })} /></Field>
                <Field label="Min qty (alert)"><Input type="number" value={form.min_qty} onChange={(e) => setForm({ ...form, min_qty: e.target.value })} /></Field>
                <Field label="Max qty"><Input type="number" value={form.max_qty} onChange={(e) => setForm({ ...form, max_qty: e.target.value })} /></Field>
                <Field label="Manufacturing date"><Input type="date" value={form.mfg_date} onChange={(e) => setForm({ ...form, mfg_date: e.target.value })} /></Field>
                <Field label="Expiry date"><Input type="date" value={form.expiry_date} onChange={(e) => setForm({ ...form, expiry_date: e.target.value })} /></Field>
              </div>
            </TabsContent>
          </Tabs>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={save} disabled={saving}>{saving ? <Loader2 className="size-4 animate-spin" /> : null} Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={scanOpen} onOpenChange={setScanOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Scan barcode</DialogTitle></DialogHeader>
          <ScannerPanel
            active={scanOpen}
            onCameraError={() => setScanOpen(false)}
            onScan={(code) => { setForm((f) => ({ ...f, barcode: code })); setScanOpen(false); autofill(code); }}
          />
          <DialogFooter><Button variant="outline" onClick={() => setScanOpen(false)}>Close</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}
