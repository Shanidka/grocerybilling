import { createFileRoute } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
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
import { Plus } from "lucide-react";

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
        <TabsList>
          <TabsTrigger value="purchases">Purchases</TabsTrigger>
          <TabsTrigger value="adjustments">Adjustments</TabsTrigger>
          <TabsTrigger value="damaged">Damaged</TabsTrigger>
          <TabsTrigger value="returns">Returns</TabsTrigger>
        </TabsList>
        <TabsContent value="purchases"><PurchasesTab /></TabsContent>
        <TabsContent value="adjustments"><AdjustmentsTab /></TabsContent>
        <TabsContent value="damaged"><DamagedTab /></TabsContent>
        <TabsContent value="returns"><ReturnsTab /></TabsContent>
      </Tabs>
    </div>
  );
}

function useProductsList() {
  return useQuery({
    queryKey: ["inv-products"],
    queryFn: async () => {
      const { data, error } = await supabase.from("products").select("id,name,unit,purchase_price,selling_price,stock_qty").eq("is_active", true).order("name");
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
  const [pid, setPid] = useState(""); const [qty, setQty] = useState(""); const [reason, setReason] = useState(""); const [loss, setLoss] = useState("");
  const save = async () => {
    if (!pid || !qty) return toast.error("Product and qty required");
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase.from("damaged_products").insert({ product_id: pid, qty: Number(qty), reason, loss_value: Number(loss || 0), created_by: u.user!.id });
    if (error) return toast.error(error.message);
    toast.success("Damage logged");
    setOpen(false); setPid(""); setQty(""); setReason(""); setLoss("");
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
              <div><Label>Product</Label>
                <Select value={pid} onValueChange={setPid}><SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>{products?.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Qty</Label><Input type="number" step="0.001" value={qty} onChange={(e) => setQty(e.target.value)} /></div>
                <div><Label>Loss value (₹)</Label><Input type="number" step="0.01" value={loss} onChange={(e) => setLoss(e.target.value)} /></div>
              </div>
              <div><Label>Reason</Label><Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="expired, spillage, breakage…" /></div>
            </div>
            <DialogFooter><Button onClick={save}>Save</Button></DialogFooter>
          </DialogContent>
        </Dialog>
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
  const [pid, setPid] = useState(""); const [qty, setQty] = useState(""); const [refund, setRefund] = useState(""); const [reason, setReason] = useState(""); const [restock, setRestock] = useState("true");
  const save = async () => {
    if (!pid || !qty) return toast.error("Product and qty required");
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase.from("product_returns").insert({ product_id: pid, qty: Number(qty), refund_amount: Number(refund || 0), reason, restock: restock === "true", created_by: u.user!.id });
    if (error) return toast.error(error.message);
    toast.success("Return recorded");
    setOpen(false); setPid(""); setQty(""); setRefund(""); setReason("");
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
              <div><Label>Product</Label>
                <Select value={pid} onValueChange={setPid}><SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>{products?.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Qty</Label><Input type="number" step="0.001" value={qty} onChange={(e) => setQty(e.target.value)} /></div>
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
