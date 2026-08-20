import { createFileRoute } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { inr } from "@/lib/format";
import { Plus, Printer, Trash2, ClipboardList, Pencil, CheckCircle2, XCircle } from "lucide-react";

export const Route = createFileRoute("/_authenticated/purchase-orders")({
  ssr: false,
  component: PurchaseOrdersPage,
  head: () => ({ meta: [{ title: "Purchase Orders — Bazaar POS" }] }),
});

type POItem = { id?: string; product_id: string | null; product_name: string; qty: number; unit: string | null; unit_cost: number; mrp: number; weight_g: number | null; notes: string | null };
type PO = {
  id: string; order_no: string | null; supplier_name: string | null; supplier_id: string | null;
  destination: string | null; status: string; notes: string | null; expected_at: string | null;
  printed_at: string | null; created_at: string;
  purchase_order_items: POItem[];
};

function PurchaseOrdersPage() {
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [editing, setEditing] = useState<PO | null>(null);
  const [creating, setCreating] = useState(false);

  const list = useQuery({
    queryKey: ["purchase-orders", statusFilter],
    queryFn: async () => {
      let q = supabase.from("purchase_orders")
        .select("id,order_no,supplier_name,supplier_id,destination,status,notes,expected_at,printed_at,created_at,purchase_order_items(id,product_id,product_name,qty,unit,unit_cost,mrp,weight_g,notes)")
        .order("created_at", { ascending: false }).limit(200);
      if (statusFilter !== "all") q = q.eq("status", statusFilter);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as PO[];
    },
  });

  const setStatus = async (id: string, status: string) => {
    const { error } = await supabase.from("purchase_orders").update({ status }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success(`Marked ${status}`);
    qc.invalidateQueries({ queryKey: ["purchase-orders"] });
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this purchase order?")) return;
    const { error } = await supabase.from("purchase_orders").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Deleted");
    qc.invalidateQueries({ queryKey: ["purchase-orders"] });
  };

  return (
    <div className="p-4 lg:p-6 space-y-6 max-w-7xl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2"><ClipboardList className="size-6" /> Purchase orders</h1>
          <p className="text-sm text-muted-foreground">Draft, review, print and track orders sent to distributors.</p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="sent">Sent</SelectItem>
              <SelectItem value="received">Received</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={() => setCreating(true)}><Plus className="size-4" /> New order</Button>
        </div>
      </div>

      <Card className="p-0 overflow-hidden">
        {!list.data?.length ? (
          <div className="p-10 text-center text-sm text-muted-foreground">No purchase orders yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left"><tr>
                <th className="px-4 py-2.5">Order #</th>
                <th className="px-4 py-2.5">Date</th>
                <th className="px-4 py-2.5">Supplier</th>
                <th className="px-4 py-2.5">Destination</th>
                <th className="px-4 py-2.5">Items</th>
                <th className="px-4 py-2.5">Value</th>
                <th className="px-4 py-2.5">Status</th>
                <th className="px-4 py-2.5 text-right">Actions</th>
              </tr></thead>
              <tbody className="divide-y">
                {list.data.map((po) => {
                  const val = po.purchase_order_items.reduce((s, i) => s + Number(i.qty) * Number(i.unit_cost), 0);
                  return (
                    <tr key={po.id}>
                      <td className="px-4 py-3 font-mono text-xs">{po.order_no ?? "—"}</td>
                      <td className="px-4 py-3">{new Date(po.created_at).toLocaleDateString("en-IN")}</td>
                      <td className="px-4 py-3">{po.supplier_name ?? "—"}</td>
                      <td className="px-4 py-3 text-muted-foreground">{po.destination ?? "—"}</td>
                      <td className="px-4 py-3">{po.purchase_order_items.length}</td>
                      <td className="px-4 py-3">{val > 0 ? inr(val) : "—"}</td>
                      <td className="px-4 py-3">
                        <Badge variant={po.status === "received" ? "default" : po.status === "cancelled" ? "destructive" : "outline"} className="capitalize">
                          {po.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-right space-x-1">
                        <Button size="sm" variant="ghost" onClick={() => setEditing(po)}><Pencil className="size-3.5" /></Button>
                        <Button size="sm" variant="ghost" onClick={() => printPO(po)}><Printer className="size-3.5" /></Button>
                        {po.status === "draft" && (
                          <Button size="sm" variant="ghost" onClick={() => setStatus(po.id, "sent")}><CheckCircle2 className="size-3.5 text-primary" /></Button>
                        )}
                        {po.status === "sent" && (
                          <Button size="sm" variant="ghost" onClick={() => setStatus(po.id, "received")}><CheckCircle2 className="size-3.5 text-primary" /></Button>
                        )}
                        {po.status !== "cancelled" && po.status !== "received" && (
                          <Button size="sm" variant="ghost" onClick={() => setStatus(po.id, "cancelled")}><XCircle className="size-3.5 text-destructive" /></Button>
                        )}
                        <Button size="sm" variant="ghost" onClick={() => remove(po.id)}><Trash2 className="size-3.5" /></Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {(creating || editing) && (
        <POEditor
          existing={editing}
          onClose={() => { setCreating(false); setEditing(null); }}
          onSaved={() => { qc.invalidateQueries({ queryKey: ["purchase-orders"] }); setCreating(false); setEditing(null); }}
        />
      )}
    </div>
  );
}

/* Editor / Creator */
type Product = { id: string; name: string; unit: string; barcode: string | null; purchase_price: number; mrp: number; net_weight_g: number | null; brand: string | null };
type Supplier = { id: string; name: string };

function POEditor({ existing, onClose, onSaved }: { existing: PO | null; onClose: () => void; onSaved: () => void }) {
  const products = useQuery({
    queryKey: ["po-products"],
    queryFn: async () => {
      const { data, error } = await supabase.from("products")
        .select("id,name,unit,barcode,purchase_price,mrp,net_weight_g,brand").eq("is_active", true).order("name");
      if (error) throw error;
      return (data ?? []) as Product[];
    },
  });
  const suppliers = useQuery({
    queryKey: ["po-suppliers"],
    queryFn: async () => {
      const { data, error } = await supabase.from("suppliers").select("id,name").order("name");
      if (error) throw error;
      return (data ?? []) as Supplier[];
    },
  });

  const [supplierId, setSupplierId] = useState<string>(existing?.supplier_id ?? "");
  const [supplierName, setSupplierName] = useState(existing?.supplier_name ?? "");
  const [destination, setDestination] = useState(existing?.destination ?? "");
  const [expectedAt, setExpectedAt] = useState(existing?.expected_at ?? "");
  const [notes, setNotes] = useState(existing?.notes ?? "");
  const [items, setItems] = useState<POItem[]>(
    existing?.purchase_order_items?.map((i) => ({ ...i })) ?? []
  );
  const [saving, setSaving] = useState(false);
  const [brandFilter, setBrandFilter] = useState("__all");

  const brands = useMemo(() => Array.from(new Set((products.data ?? []).map((p) => p.brand).filter(Boolean) as string[])).sort(), [products.data]);
  const filteredProducts = useMemo(() =>
    (products.data ?? []).filter((p) => brandFilter === "__all" || p.brand === brandFilter),
    [products.data, brandFilter]);

  const total = items.reduce((s, i) => s + Number(i.qty || 0) * Number(i.unit_cost || 0), 0);

  const addItem = (p?: Product) => {
    setItems((x) => [...x, {
      product_id: p?.id ?? null, product_name: p?.name ?? "", qty: 1, unit: p?.unit ?? "pcs",
      unit_cost: Number(p?.purchase_price ?? 0), mrp: Number(p?.mrp ?? 0),
      weight_g: p?.net_weight_g ?? null, notes: null,
    }]);
  };

  const updateItem = (idx: number, patch: Partial<POItem>) =>
    setItems((arr) => arr.map((r, i) => i === idx ? { ...r, ...patch } : r));

  const removeItem = (idx: number) => setItems((arr) => arr.filter((_, i) => i !== idx));

  const save = async (status: "draft" | "sent" = "draft") => {
    if (items.length === 0) return toast.error("Add at least one item");
    setSaving(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      let poId = existing?.id;
      const payload = {
        supplier_id: supplierId || null,
        supplier_name: supplierName || (supplierId ? suppliers.data?.find((s) => s.id === supplierId)?.name : "") || null,
        destination: destination || null,
        expected_at: expectedAt || null,
        notes: notes || null,
        status,
      };

      if (!poId) {
        const { data: no } = await supabase.rpc("next_po_no");
        const { data: po, error } = await supabase.from("purchase_orders")
          .insert({ ...payload, order_no: no as string, created_by: u.user!.id })
          .select("id").single();
        if (error) throw error;
        poId = po.id;
      } else {
        const { error } = await supabase.from("purchase_orders").update(payload).eq("id", poId);
        if (error) throw error;
        await supabase.from("purchase_order_items").delete().eq("po_id", poId);
      }

      const { error: e2 } = await supabase.from("purchase_order_items").insert(
        items.map((i) => ({
          po_id: poId, product_id: i.product_id, product_name: i.product_name,
          qty: Number(i.qty), unit: i.unit, unit_cost: Number(i.unit_cost || 0),
          mrp: Number(i.mrp || 0), weight_g: i.weight_g, notes: i.notes,
        }))
      );
      if (e2) throw e2;

      toast.success(existing ? "Order updated" : "Order created");
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{existing ? `Edit ${existing.order_no ?? "order"}` : "New purchase order"}</DialogTitle></DialogHeader>

        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <Label>Supplier</Label>
            <Select value={supplierId || "__none"} onValueChange={(v) => {
              if (v === "__none") { setSupplierId(""); return; }
              setSupplierId(v);
              const s = suppliers.data?.find((x) => x.id === v);
              if (s) setSupplierName(s.name);
            }}>
              <SelectTrigger><SelectValue placeholder="Pick supplier" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">— None (type below) —</SelectItem>
                {suppliers.data?.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Input className="mt-1" placeholder="Or type name" value={supplierName} onChange={(e) => setSupplierName(e.target.value)} />
          </div>
          <div>
            <Label>Destination / Distributor mapping</Label>
            <Input value={destination} onChange={(e) => setDestination(e.target.value)} placeholder="Warehouse / Store branch" />
          </div>
          <div>
            <Label>Expected delivery</Label>
            <Input type="date" value={expectedAt ?? ""} onChange={(e) => setExpectedAt(e.target.value)} />
          </div>
          <div>
            <Label>Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>
        </div>

        <div className="pt-2">
          <div className="flex items-center gap-2 flex-wrap mb-2">
            <Label className="mr-auto">Line items</Label>
            <Select value={brandFilter} onValueChange={setBrandFilter}>
              <SelectTrigger className="w-40 h-8 text-xs"><SelectValue placeholder="All companies" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all">All companies</SelectItem>
                {brands.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value="" onValueChange={(id) => {
              const p = filteredProducts.find((x) => x.id === id);
              if (p) addItem(p);
            }}>
              <SelectTrigger className="w-56 h-8 text-xs"><SelectValue placeholder="+ Add product" /></SelectTrigger>
              <SelectContent>
                {filteredProducts.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button size="sm" variant="outline" onClick={() => addItem()}>+ Custom line</Button>
          </div>

          <Card className="p-0 overflow-hidden">
            {items.length === 0 ? (
              <div className="p-6 text-center text-sm text-muted-foreground">No items yet.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-left text-xs">
                    <tr>
                      <th className="px-2 py-1.5">Product</th>
                      <th className="px-2 py-1.5 w-20">Weight g</th>
                      <th className="px-2 py-1.5 w-20">Qty</th>
                      <th className="px-2 py-1.5 w-16">Unit</th>
                      <th className="px-2 py-1.5 w-24">Cost</th>
                      <th className="px-2 py-1.5 w-24">MRP</th>
                      <th className="px-2 py-1.5 w-8"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {items.map((it, idx) => (
                      <tr key={idx}>
                        <td className="px-2 py-1">
                          <Input value={it.product_name} onChange={(e) => updateItem(idx, { product_name: e.target.value })} className="h-8" />
                        </td>
                        <td className="px-2 py-1"><Input type="number" step="0.01" value={it.weight_g ?? ""} onChange={(e) => updateItem(idx, { weight_g: e.target.value ? Number(e.target.value) : null })} className="h-8" /></td>
                        <td className="px-2 py-1"><Input type="number" step="0.001" value={it.qty} onChange={(e) => updateItem(idx, { qty: Number(e.target.value) })} className="h-8" /></td>
                        <td className="px-2 py-1"><Input value={it.unit ?? ""} onChange={(e) => updateItem(idx, { unit: e.target.value })} className="h-8" /></td>
                        <td className="px-2 py-1"><Input type="number" step="0.01" value={it.unit_cost} onChange={(e) => updateItem(idx, { unit_cost: Number(e.target.value) })} className="h-8" /></td>
                        <td className="px-2 py-1"><Input type="number" step="0.01" value={it.mrp} onChange={(e) => updateItem(idx, { mrp: Number(e.target.value) })} className="h-8" /></td>
                        <td className="px-2 py-1"><Button size="icon" variant="ghost" onClick={() => removeItem(idx)}><Trash2 className="size-4" /></Button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
          <div className="text-right mt-2 font-semibold">Est. total: {inr(total)}</div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button variant="secondary" onClick={() => save("draft")} disabled={saving}>Save draft</Button>
          <Button onClick={() => save("sent")} disabled={saving}>Save &amp; mark sent</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* Print in a new window */
function printPO(po: PO) {
  const rows = po.purchase_order_items.map((i, idx) => `
    <tr>
      <td>${idx + 1}</td>
      <td>${escapeHtml(i.product_name)}</td>
      <td>${i.weight_g ? `${Number(i.weight_g)} g` : "—"}</td>
      <td style="text-align:right">${Number(i.qty)} ${i.unit ?? ""}</td>
      <td style="text-align:right">${Number(i.unit_cost) ? Number(i.unit_cost).toFixed(2) : "—"}</td>
      <td style="text-align:right">${(Number(i.qty) * Number(i.unit_cost)).toFixed(2) || "—"}</td>
    </tr>`).join("");
  const total = po.purchase_order_items.reduce((s, i) => s + Number(i.qty) * Number(i.unit_cost), 0);
  const html = `<!DOCTYPE html><html><head><title>${po.order_no ?? "PO"}</title>
    <style>
      body{font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;padding:24px;color:#111;max-width:780px;margin:auto}
      h1{margin:0 0 4px;font-size:22px}
      .muted{color:#666;font-size:12px}
      .row{display:flex;justify-content:space-between;gap:16px;margin:12px 0}
      table{width:100%;border-collapse:collapse;margin-top:12px;font-size:13px}
      th,td{border:1px solid #ddd;padding:6px 8px;text-align:left}
      th{background:#f5f5f5}
      tfoot td{font-weight:600;background:#f9f9f9}
      .sig{margin-top:60px;display:flex;justify-content:space-between}
      .sig div{border-top:1px solid #333;padding-top:4px;width:200px;text-align:center;font-size:12px;color:#444}
      .toolbar{position:fixed;top:12px;right:12px;display:flex;gap:8px}
      .toolbar button{font-size:13px;padding:8px 14px;border-radius:8px;border:1px solid #111;background:#111;color:#fff;cursor:pointer}
      .toolbar button.ghost{background:#fff;color:#111}
      @media print{body{padding:12px}.toolbar{display:none}}
    </style></head><body>
      <h1>Purchase Order</h1>
      <div class="muted">${po.order_no ?? ""} · Created ${new Date(po.created_at).toLocaleString("en-IN")}</div>
      <div class="row">
        <div><strong>Supplier:</strong> ${escapeHtml(po.supplier_name ?? "—")}</div>
        <div><strong>Destination:</strong> ${escapeHtml(po.destination ?? "—")}</div>
        <div><strong>Expected:</strong> ${po.expected_at ?? "—"}</div>
      </div>
      <table>
        <thead><tr><th>#</th><th>Product</th><th>Weight</th><th style="text-align:right">Qty</th><th style="text-align:right">Cost</th><th style="text-align:right">Amount</th></tr></thead>
        <tbody>${rows}</tbody>
        <tfoot><tr><td colspan="5" style="text-align:right">Total</td><td style="text-align:right">${total.toFixed(2)}</td></tr></tfoot>
      </table>
      ${po.notes ? `<p class="muted"><strong>Notes:</strong> ${escapeHtml(po.notes)}</p>` : ""}
      <div class="sig"><div>Prepared by</div><div>Received by</div></div>
      <div class="toolbar">
        <button onclick="window.print()">Print</button>
        <button class="ghost" onclick="window.close()">Close</button>
      </div>
      <script>window.onload=()=>setTimeout(()=>window.print(),300)</script>
    </body></html>`;
  const w = window.open("", "_blank", "width=800,height=900");
  if (!w) return toast.error("Popup blocked");
  w.document.write(html);
  w.document.close();
  supabase.from("purchase_orders").update({ printed_at: new Date().toISOString() }).eq("id", po.id);
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}
