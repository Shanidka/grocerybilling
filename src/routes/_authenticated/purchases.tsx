import { pageMeta } from "@/lib/page-meta";
import { createFileRoute } from "@tanstack/react-router";
import { logActivity } from "@/lib/activity-log";
import { supabase } from "@/integrations/supabase/client";
import { useStoreId } from "@/lib/active-store";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { inr } from "@/lib/format";
import { calcTaxAmount, purchaseLineTotal } from "@/lib/purchase-tax";
import { Plus, Camera, Upload, Loader2, Truck, Trash2 } from "lucide-react";
import { CameraScanner } from "@/components/camera-scanner";
import { extractInvoice } from "@/lib/invoice-ocr.functions";

export const Route = createFileRoute("/_authenticated/purchases")({
  ssr: false,
  validateSearch: (search: Record<string, unknown>): { po?: string } =>
    typeof search.po === "string" ? { po: search.po } : {},
  component: PurchasesPage,
  head: () => pageMeta("Purchase Entry — Bazaar POS", "Record supplier bills with Tax % and Tax Rs. columns; receive purchase orders into stock."),
});

type PurchaseRow = {
  product_id: string; name: string; qty: string; cost: string;
  hsn: string; mrp: string; tax_pct: string; tax_amount: string; barcode: string;
};

/** Prefill coming from a purchase order's "Receive into stock" action. */
type PoPrefill = {
  poId: string;
  orderNo: string;
  supplier: string;
  invoice: string;
  items: PurchaseRow[];
  orderedQty: Record<string, number>; // key = product_id when present, else product name
};

const poKey = (productId: string, name: string) => productId || name.trim().toLowerCase();

export function PurchasesPage() {
  const qc = useQueryClient();
  const storeId = useStoreId();
  const { po: poParam } = Route.useSearch();
  const navigate = Route.useNavigate();

  const products = useQuery({
    queryKey: ["inv-products", storeId],
    queryFn: async () => {
      const { data, error } = await supabase.from("products")
        .select("id,name,unit,barcode,brand,purchase_price,selling_price,mrp,stock_qty,tax_pct,net_weight_g")
        .eq("store_id", storeId).eq("is_active", true).order("name");
      if (error) throw error;
      return data ?? [];
    },
  });
  const suppliersList = useQuery({
    queryKey: ["inv-suppliers", storeId],
    queryFn: async () => {
      const { data, error } = await supabase.from("suppliers").select("id,name").eq("store_id", storeId).order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const q = useQuery({
    queryKey: ["inv-purchases", storeId],
    queryFn: async () => {
      const { data, error } = await supabase.from("purchase_entries").select("id,supplier,invoice_no,total,tax_total,created_at,purchase_items(id,name,qty,cost,tax_pct,tax_amount,line_total)").eq("store_id", storeId).order("created_at", { ascending: false }).limit(50);
      if (error) throw error;
      return data ?? [];
    },
  });

  const [open, setOpen] = useState(false);
  const [prefill, setPrefill] = useState<PoPrefill | null>(null);

  // Open the entry dialog pre-filled from a purchase order (Receive into stock)
  const poQ = useQuery({
    enabled: Boolean(poParam),
    queryKey: ["po-receive", poParam],
    queryFn: async () => {
      const { data, error } = await supabase.from("purchase_orders")
        .select("id,order_no,supplier_name,supplier_id,status,purchase_order_items(product_id,product_name,qty,unit_cost,mrp,weight_g)")
        .eq("id", poParam!).maybeSingle();
      if (error) throw error;
      return data as unknown as
        | { id: string; order_no: string | null; supplier_name: string | null; supplier_id: string | null; status: string; purchase_order_items: { product_id: string | null; product_name: string; qty: number; unit_cost: number; mrp: number; weight_g: number | null }[] }
        | null;
    },
  });

  useEffect(() => {
    const po = poQ.data;
    if (!poParam || !po) return;
    if (po.status === "received" || po.status === "cancelled") {
      toast.info(`Order ${po.order_no ?? ""} is already ${po.status}`);
    } else {
      const orderedQty: Record<string, number> = {};
      const items: PurchaseRow[] = (po.purchase_order_items ?? []).map((it) => {
        const p = it.product_id ? (products.data ?? []).find((x) => x.id === it.product_id) : undefined;
        const key = poKey(it.product_id ?? "", it.product_name);
        orderedQty[key] = Number(it.qty) || 0;
        const taxPct = p ? Number(p.tax_pct) || 0 : 0;
        return {
          product_id: it.product_id ?? "",
          name: p?.name ?? it.product_name,
          qty: String(Number(it.qty) || 1),
          cost: (Math.round(Number(it.unit_cost) * 100) / 100).toFixed(2),
          hsn: "",
          mrp: String(it.mrp ?? p?.mrp ?? ""),
          tax_pct: String(taxPct),
          tax_amount: String(calcTaxAmount(Number(it.qty) || 0, Number(it.unit_cost) || 0, taxPct)),
          barcode: p?.barcode ?? "",
        };
      });
      setPrefill({ poId: po.id, orderNo: po.order_no ?? "", supplier: po.supplier_name ?? "", invoice: po.order_no ?? "", items, orderedQty });
      setOpen(true);
    }
    // Clear ?po= so a refresh doesn't reopen the intake
    navigate({ search: {}, replace: true }).catch(() => { /* noop */ });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [poParam, poQ.data]);

  const onSaved = (saved: { poId?: string; partial?: boolean; invoice: string; supplier: string; items: number; total: number }) => {
    qc.invalidateQueries({ queryKey: ["inv-purchases"] });
    qc.invalidateQueries({ queryKey: ["inv-products"] });
    qc.invalidateQueries({ queryKey: ["inv-stock"] });
    qc.invalidateQueries({ queryKey: ["inv-belowmin"] });
    if (saved.poId) {
      qc.invalidateQueries({ queryKey: ["purchase-orders"] });
      qc.invalidateQueries({ queryKey: ["po-receive", saved.poId] });
    }
  };

  return (
    <div className="p-4 lg:p-6 space-y-6 max-w-7xl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2"><Truck className="size-6" /> Purchase entry</h1>
          <p className="text-sm text-muted-foreground">Record supplier invoices — Tax % and Tax Rs. columns, total = purchase price + purchase tax.</p>
        </div>
        <Button onClick={() => { setPrefill(null); setOpen(true); }}><Plus className="size-4" /> New purchase</Button>
      </div>

      <PurchaseEntryDialog
        open={open}
        onOpenChange={setOpen}
        prefill={prefill}
        suppliersList={suppliersList.data ?? []}
        products={products.data ?? []}
        onSaved={onSaved}
      />

      <Card className="p-0 overflow-hidden">
        {!q.data?.length ? <div className="p-8 text-center text-sm text-muted-foreground">No purchases yet.</div> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left"><tr>
                <th className="px-4 py-2.5">Date</th><th className="px-4 py-2.5">Supplier</th><th className="px-4 py-2.5">Invoice</th><th className="px-4 py-2.5">Items</th><th className="px-4 py-2.5">Tax</th><th className="px-4 py-2.5">Total</th>
              </tr></thead>
              <tbody className="divide-y">
                {q.data.map((r) => (
                  <tr key={r.id}>
                    <td className="px-4 py-3">{new Date(r.created_at).toLocaleDateString("en-IN")}</td>
                    <td className="px-4 py-3">{r.supplier ?? "—"}</td>
                    <td className="px-4 py-3">{r.invoice_no ?? "—"}</td>
                    <td className="px-4 py-3">{r.purchase_items?.length ?? 0}</td>
                    <td className="px-4 py-3">{inr((r as { tax_total?: number }).tax_total ?? 0)}</td>
                    <td className="px-4 py-3 font-medium">{inr(r.total)}</td>
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

function PurchaseEntryDialog({ open, onOpenChange, prefill, suppliersList, products, onSaved }: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  prefill: PoPrefill | null;
  suppliersList: { id: string; name: string }[];
  products: { id: string; name: string; barcode: string | null; purchase_price: number; mrp: number; tax_pct: number }[];
  onSaved: (saved: { poId?: string; partial?: boolean; invoice: string; supplier: string; items: number; total: number }) => void;
}) {
  const qc = useQueryClient();
  const storeId = useStoreId();
  const [supplier, setSupplier] = useState("");
  const [invoice, setInvoice] = useState("");
  const [items, setItems] = useState<PurchaseRow[]>([]);
  const [ocrBusy, setOcrBusy] = useState(false);
  const [newProductIdx, setNewProductIdx] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const ocrFn = useServerFn(extractInvoice);

  // Reset / prefill whenever the dialog opens
  useEffect(() => {
    if (!open) return;
    if (prefill) {
      setSupplier(prefill.supplier);
      setInvoice(prefill.invoice);
      setItems(prefill.items.map((r) => ({ ...r })));
    } else {
      setSupplier(""); setInvoice(""); setItems([]);
    }
  }, [open, prefill]);

  const patch = (idx: number, p: Partial<PurchaseRow>) =>
    setItems((arr) => arr.map((r, i) => {
      if (i !== idx) return r;
      const merged = { ...r, ...p };
      if ("tax_amount" in p) return merged; // manual tax amount override
      // Tax amount follows qty / cost / tax %
      return { ...merged, tax_amount: String(calcTaxAmount(Number(merged.qty), Number(merged.cost), Number(merged.tax_pct))) };
    }));

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
        const byBarcode = it.barcode ? products.find((p) => p.barcode === it.barcode) : undefined;
        const byName = !byBarcode
          ? products.find((p) => p.name.toLowerCase() === it.name.toLowerCase())
            ?? products.find((p) => p.name.toLowerCase().includes(it.name.toLowerCase().slice(0, 12)))
          : undefined;
        const p = byBarcode ?? byName;
        const qty = Number(it.qty) || 1;
        const cost = Number(it.cost) || Number(p?.purchase_price) || 0;
        const taxPct = Number(it.tax_pct ?? 0) || 0;
        return {
          product_id: p?.id ?? "",
          name: p?.name ?? it.name,
          qty: String(qty),
          cost: (Math.round(cost * 100) / 100).toFixed(2),
          hsn: it.hsn ?? "",
          mrp: String(it.mrp ?? p?.mrp ?? ""),
          tax_pct: String(it.tax_pct ?? ""),
          tax_amount: String(calcTaxAmount(qty, cost, taxPct)),
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

  const addRow = () => setItems((i) => [...i, { product_id: "", name: "", qty: "1", cost: "0", hsn: "", mrp: "", tax_pct: "", tax_amount: "0", barcode: "" }]);
  const taxTotal = items.reduce((s, i) => s + (Number(i.tax_amount) || 0), 0);
  const total = items.reduce((s, i) => s + purchaseLineTotal(Number(i.qty), Number(i.cost), Number(i.tax_amount)), 0);

  const save = async () => {
    const rows = items.filter((i) => i.product_id && Number(i.qty) > 0);
    if (rows.length === 0) return toast.error("Add at least one item (or save unmatched lines as products first)");
    const { data: userData } = await supabase.auth.getUser();
    const { data: entry, error } = await supabase.from("purchase_entries").insert({ store_id: storeId, supplier, invoice_no: invoice, total, tax_total: taxTotal, created_by: userData.user!.id }).select().single();
    if (error) return toast.error(error.message);
    const { error: e2 } = await supabase.from("purchase_items").insert(
      rows.map((r) => ({
        entry_id: entry.id, product_id: r.product_id, name: r.name,
        qty: Number(r.qty), cost: Number(r.cost),
        hsn: r.hsn || null,
        mrp: r.mrp ? Number(r.mrp) : null,
        tax_pct: r.tax_pct ? Number(r.tax_pct) : 0,
        tax_amount: Number(r.tax_amount) || 0,
        line_total: purchaseLineTotal(Number(r.qty), Number(r.cost), Number(r.tax_amount)),
      }))
    );
    if (e2) return toast.error(e2.message);

    // Keep supplier directory in sync
    if (supplier.trim() && !suppliersList.some((s) => s.name.toLowerCase() === supplier.trim().toLowerCase())) {
      await supabase.from("suppliers").insert({ name: supplier.trim(), store_id: storeId });
      qc.invalidateQueries({ queryKey: ["inv-suppliers"] });
      qc.invalidateQueries({ queryKey: ["suppliers"] });
    }

    // Purchase order intake — mark received / partially received
    let poId: string | undefined;
    let partial = false;
    if (prefill) {
      poId = prefill.poId;
      partial = rows.some((r) => {
        const ordered = prefill.orderedQty[poKey(r.product_id, r.name)];
        return ordered != null && Number(r.qty) < ordered - 0.001;
      });
      const status = partial ? "partially_received" : "received";
      const { error: poErr } = await supabase.from("purchase_orders").update({ status }).eq("id", prefill.poId);
      if (poErr) toast.warning(`Stock updated, but marking the order ${status} failed: ${poErr.message}`);
    }

    void logActivity("purchases", "create", `Purchase entry ${invoice || "(no invoice)"} from ${supplier || "unknown supplier"} — ${rows.length} item(s), ${total.toFixed(2)}${prefill ? ` (received from PO ${prefill.orderNo})` : ""}`, { entityId: entry.id, details: { supplier, invoice_no: invoice, total, items: rows.length, po_id: prefill?.poId ?? null } });
    toast.success(prefill ? (partial ? "Stock updated — order partially received" : "Stock updated — order marked received") : "Purchase recorded, stock updated");
    onOpenChange(false);
    onSaved({ poId, partial, invoice, supplier, items: rows.length, total });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{prefill ? `Receive into stock — PO ${prefill.orderNo}` : "Record purchase"}</DialogTitle>
        </DialogHeader>
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <Label>Supplier</Label>
            <Input value={supplier} onChange={(e) => setSupplier(e.target.value)} list="supplier-datalist" />
            <datalist id="supplier-datalist">
              {suppliersList.map((s) => <option key={s.id} value={s.name} />)}
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
          {items.map((it, idx) => {
            const ordered = prefill ? prefill.orderedQty[poKey(it.product_id, it.name)] : undefined;
            const short = ordered != null && Number(it.qty) < ordered - 0.001;
            return (
              <div key={idx} className="rounded-lg border p-3 space-y-2">
                <div className="grid grid-cols-12 gap-2">
                  <Select value={it.product_id} onValueChange={(v) => {
                    const p = products.find((x) => x.id === v);
                    patch(idx, { product_id: v, name: p?.name ?? "", cost: String(p?.purchase_price ?? it.cost) });
                  }}>
                    <SelectTrigger className="col-span-6"><SelectValue placeholder={it.name || "Product"} /></SelectTrigger>
                    <SelectContent>{products.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
                  </Select>
                  <Input className="col-span-3" type="number" step="0.001" placeholder="Qty" value={it.qty} onChange={(e) => patch(idx, { qty: e.target.value })} />
                  <Input className="col-span-3" type="number" step="0.01" placeholder="Cost / piece" value={it.cost} onChange={(e) => patch(idx, { cost: e.target.value })} />
                </div>
                <div className="grid grid-cols-12 gap-2">
                  <Input className="col-span-2" placeholder="HSN" value={it.hsn} onChange={(e) => patch(idx, { hsn: e.target.value })} />
                  <Input className="col-span-2" type="number" step="0.01" placeholder="MRP" value={it.mrp} onChange={(e) => patch(idx, { mrp: e.target.value })} />
                  <Input className="col-span-2" type="number" step="0.01" placeholder="Tax %" value={it.tax_pct} onChange={(e) => patch(idx, { tax_pct: e.target.value })} />
                  <Input className="col-span-2" type="number" step="0.01" placeholder="Tax Rs." title="Purchase tax amount" value={it.tax_amount} onChange={(e) => patch(idx, { tax_amount: e.target.value })} />
                  <Input className="col-span-3" placeholder="Barcode" value={it.barcode} onChange={(e) => patch(idx, { barcode: e.target.value })} />
                  <Button size="icon" variant="ghost" className="col-span-1 text-destructive" onClick={() => setItems((arr) => arr.filter((_, i) => i !== idx))}>
                    <Trash2 className="size-4" />
                  </Button>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <div className="text-xs text-muted-foreground">
                    Line total {inr(purchaseLineTotal(Number(it.qty), Number(it.cost), Number(it.tax_amount)))}
                    {Number(it.tax_amount) > 0 ? ` (incl. tax ${inr(Number(it.tax_amount))})` : ""}
                    {it.product_id ? "" : ` · “${it.name || "unnamed"}” is not in your product list`}
                    {short ? <span className="text-warning"> · ordered {ordered}, receiving {Number(it.qty)} — order will be marked partially received</span> : ""}
                  </div>
                  {!it.product_id && (
                    <Button size="sm" variant="secondary" onClick={() => setNewProductIdx(idx)}>
                      <Plus className="size-3.5" /> Add to products
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
          {items.length === 0 && <div className="text-sm text-muted-foreground">No rows — add items to the purchase.</div>}
        </div>
        <div className="text-right font-semibold">
          Total: {inr(total)}
          {taxTotal > 0 ? <span className="ml-2 text-xs font-normal text-muted-foreground">(incl. purchase tax {inr(taxTotal)})</span> : null}
        </div>
        <DialogFooter><Button onClick={save}>{prefill ? "Receive & save" : "Save"}</Button></DialogFooter>
      </DialogContent>

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
    </Dialog>
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
