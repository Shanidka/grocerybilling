import { createFileRoute } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
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
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { inr } from "@/lib/format";
import { Plus, Camera, Upload, Loader2 } from "lucide-react";
import { CameraScanner } from "@/components/camera-scanner";
import { extractInvoice } from "@/lib/invoice-ocr.functions";

export const Route = createFileRoute("/_authenticated/inventory")({
  ssr: false,
  component: InventoryPage,
  head: () => ({ meta: [{ title: "Inventory — Bazaar POS" }] }),
});

function InventoryPage() {
  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-6xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Inventory</h1>
        <p className="text-sm text-muted-foreground">Log purchases, adjustments, damages, and returns. Stock updates automatically.</p>
      </div>

      <Tabs defaultValue="purchases">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="purchases">Purchases</TabsTrigger>
          <TabsTrigger value="adjustments">Adjustments</TabsTrigger>
          <TabsTrigger value="damaged">Damaged</TabsTrigger>
          <TabsTrigger value="returns">Returns</TabsTrigger>
          <TabsTrigger value="belowmin">Below minimum</TabsTrigger>
          <TabsTrigger value="expiring">About to expire</TabsTrigger>
        </TabsList>
        <TabsContent value="purchases"><PurchasesTab /></TabsContent>
        <TabsContent value="adjustments"><AdjustmentsTab /></TabsContent>
        <TabsContent value="damaged"><DamagedTab /></TabsContent>
        <TabsContent value="returns"><ReturnsTab /></TabsContent>
        <TabsContent value="belowmin"><BelowMinTab /></TabsContent>
        <TabsContent value="expiring"><ExpiringTab /></TabsContent>
      </Tabs>
    </div>
  );
}

function useProductsList() {
  return useQuery({
    queryKey: ["inv-products"],
    queryFn: async () => {
      const { data, error } = await supabase.from("products")
        .select("id,name,unit,barcode,purchase_price,selling_price,stock_qty")
        .eq("is_active", true).order("name");
      if (error) throw error;
      return data ?? [];
    },
  });
}

/* Purchases */
function PurchasesTab() {
  const qc = useQueryClient();
  const { data: products } = useProductsList();
  const q = useQuery({
    queryKey: ["inv-purchases"],
    queryFn: async () => {
      const { data, error } = await supabase.from("purchase_entries").select("id,supplier,invoice_no,total,created_at,purchase_items(id,name,qty,cost)").order("created_at", { ascending: false }).limit(50);
      if (error) throw error;
      return data ?? [];
    },
  });
  const [open, setOpen] = useState(false);
  const [supplier, setSupplier] = useState(""); const [invoice, setInvoice] = useState("");
  const [items, setItems] = useState<Array<{ product_id: string; name: string; qty: string; cost: string }>>([]);
  const [ocrBusy, setOcrBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const ocrFn = useServerFn(extractInvoice);

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
      const matched = res.items.map((it) => {
        const byBarcode = it.barcode ? products?.find((p) => p.barcode === it.barcode) : undefined;
        const byName = !byBarcode
          ? products?.find((p) => p.name.toLowerCase() === it.name.toLowerCase())
            ?? products?.find((p) => p.name.toLowerCase().includes(it.name.toLowerCase().slice(0, 12)))
          : undefined;
        const p = byBarcode ?? byName;
        return { product_id: p?.id ?? "", name: p?.name ?? it.name, qty: String(it.qty), cost: String(it.cost || p?.purchase_price || 0) };
      });
      setItems((prev) => [...prev, ...matched]);
      const unmatched = matched.filter((m) => !m.product_id).length;
      toast.success(`Imported ${matched.length} line(s)${unmatched ? ` — ${unmatched} need a product match` : ""}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "OCR failed");
    } finally {
      setOcrBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const addRow = () => setItems((i) => [...i, { product_id: "", name: "", qty: "1", cost: "0" }]);
  const total = items.reduce((s, i) => s + Number(i.qty || 0) * Number(i.cost || 0), 0);

  const save = async () => {
    const rows = items.filter((i) => i.product_id && Number(i.qty) > 0);
    if (rows.length === 0) return toast.error("Add at least one item");
    const { data: userData } = await supabase.auth.getUser();
    const { data: entry, error } = await supabase.from("purchase_entries").insert({ supplier, invoice_no: invoice, total, created_by: userData.user!.id }).select().single();
    if (error) return toast.error(error.message);
    const { error: e2 } = await supabase.from("purchase_items").insert(
      rows.map((r) => ({ entry_id: entry.id, product_id: r.product_id, name: r.name, qty: Number(r.qty), cost: Number(r.cost) }))
    );
    if (e2) return toast.error(e2.message);
    toast.success("Purchase recorded, stock updated");
    setOpen(false); setSupplier(""); setInvoice(""); setItems([]);
    qc.invalidateQueries({ queryKey: ["inv-purchases"] });
    qc.invalidateQueries({ queryKey: ["inv-products"] });
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><Plus className="size-4" /> New purchase</Button></DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader><DialogTitle>Record purchase</DialogTitle></DialogHeader>
            <div className="grid sm:grid-cols-2 gap-3">
              <div><Label>Supplier</Label><Input value={supplier} onChange={(e) => setSupplier(e.target.value)} /></div>
              <div><Label>Invoice No.</Label><Input value={invoice} onChange={(e) => setInvoice(e.target.value)} /></div>
            </div>
            <div className="rounded-md border border-dashed p-3 flex items-center justify-between gap-3 bg-muted/30">
              <div className="text-xs text-muted-foreground">
                Auto-fill from invoice (photo, scan or PDF). Supports Indian invoices in any format.
              </div>
              <div>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*,application/pdf"
                  className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handleOcr(f); }}
                />
                <Button size="sm" variant="secondary" disabled={ocrBusy} onClick={() => fileRef.current?.click()}>
                  {ocrBusy ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
                  {ocrBusy ? "Reading…" : "Upload invoice"}
                </Button>
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Items</Label>
                <Button size="sm" variant="outline" onClick={addRow}>+ Add row</Button>
              </div>
              {items.map((it, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-2">
                  <Select value={it.product_id} onValueChange={(v) => {
                    const p = products?.find((x) => x.id === v);
                    setItems((arr) => arr.map((r, i) => i === idx ? { ...r, product_id: v, name: p?.name ?? "", cost: String(p?.purchase_price ?? r.cost) } : r));
                  }}>
                    <SelectTrigger className="col-span-6"><SelectValue placeholder="Product" /></SelectTrigger>
                    <SelectContent>{products?.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
                  </Select>
                  <Input className="col-span-3" type="number" step="0.001" placeholder="Qty" value={it.qty} onChange={(e) => setItems((arr) => arr.map((r, i) => i === idx ? { ...r, qty: e.target.value } : r))} />
                  <Input className="col-span-3" type="number" step="0.01" placeholder="Cost" value={it.cost} onChange={(e) => setItems((arr) => arr.map((r, i) => i === idx ? { ...r, cost: e.target.value } : r))} />
                </div>
              ))}
              {items.length === 0 && <div className="text-sm text-muted-foreground">No rows — add items to the purchase.</div>}
            </div>
            <div className="text-right font-semibold">Total: {inr(total)}</div>
            <DialogFooter><Button onClick={save}>Save</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

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
    qc.invalidateQueries({ queryKey: ["inv-adjust"] }); qc.invalidateQueries({ queryKey: ["inv-products"] });
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
    qc.invalidateQueries({ queryKey: ["inv-damaged"] }); qc.invalidateQueries({ queryKey: ["inv-products"] });
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
    // Refund defaults to selling price × qty
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
    qc.invalidateQueries({ queryKey: ["inv-returns"] }); qc.invalidateQueries({ queryKey: ["inv-products"] });
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

/* Below minimum stock */
function BelowMinTab() {
  const q = useQuery({
    queryKey: ["inv-belowmin"],
    queryFn: async () => {
      const { data, error } = await supabase.from("products")
        .select("id,name,brand,unit,stock_qty,min_qty,max_qty,purchase_price").eq("is_active", true);
      if (error) throw error;
      return (data ?? []).filter((p) => Number(p.stock_qty) <= Number(p.min_qty) && Number(p.min_qty) > 0);
    },
    refetchInterval: 2 * 60 * 60 * 1000,
  });
  return (
    <Card className="p-0 overflow-hidden">
      {!q.data?.length ? <div className="p-8 text-center text-sm text-muted-foreground">All items above minimum. 🎉</div> : (
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left"><tr><th className="px-4 py-2.5">Product</th><th className="px-4 py-2.5">Brand</th><th className="px-4 py-2.5">Stock</th><th className="px-4 py-2.5">Min</th><th className="px-4 py-2.5">Need to reach max</th></tr></thead>
          <tbody className="divide-y">{q.data.map((p) => (
            <tr key={p.id}><td className="px-4 py-3">{p.name}</td><td className="px-4 py-3 text-muted-foreground">{p.brand ?? "—"}</td><td className="px-4 py-3 text-destructive font-medium">{Number(p.stock_qty)} {p.unit}</td><td className="px-4 py-3">{Number(p.min_qty)} {p.unit}</td><td className="px-4 py-3 text-warning font-medium">{Math.max(0, Number(p.max_qty) - Number(p.stock_qty))} {p.unit}</td></tr>
          ))}</tbody>
        </table>
      )}
    </Card>
  );
}

/* Expiring soon */
function ExpiringTab() {
  const [days, setDays] = useState("30");
  const q = useQuery({
    queryKey: ["inv-expiring", days],
    queryFn: async () => {
      const until = new Date(); until.setDate(until.getDate() + Number(days || 30));
      const { data, error } = await supabase.from("products")
        .select("id,name,brand,unit,stock_qty,expiry_date").eq("is_active", true)
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
            <thead className="bg-muted/50 text-left"><tr><th className="px-4 py-2.5">Product</th><th className="px-4 py-2.5">Brand</th><th className="px-4 py-2.5">Stock</th><th className="px-4 py-2.5">Expires</th><th className="px-4 py-2.5">Days left</th></tr></thead>
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
