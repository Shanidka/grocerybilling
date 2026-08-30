import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useShopSettings } from "@/lib/shop-settings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Settings as SettingsIcon, Save, Loader2, Store, Plus, Copy } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useActiveStore, type Store as StoreRow } from "@/lib/active-store";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/settings")({
  ssr: false,
  component: SettingsPage,
  head: () => ({ meta: [{ title: "Shop settings — Bazaar POS" }] }),
});

function SettingsPage() {
  const qc = useQueryClient();
  const { data, isLoading } = useShopSettings();
  const [form, setForm] = useState({
    shop_name: "", phone: "", address: "", gst_number: "", upi_id: "", receipt_footer: "",
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (data) setForm({
      shop_name: data.shop_name ?? "",
      phone: data.phone ?? "",
      address: data.address ?? "",
      gst_number: data.gst_number ?? "",
      upi_id: data.upi_id ?? "",
      receipt_footer: data.receipt_footer ?? "",
    });
  }, [data]);

  const save = async () => {
    setSaving(true);
    const { error } = await supabase.from("shop_settings").upsert({ id: 1, ...form });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Saved");
    qc.invalidateQueries({ queryKey: ["shop-settings"] });
  };

  return (
    <div className="p-4 lg:p-6 max-w-3xl mx-auto">
      <div className="flex items-center gap-2 mb-6">
        <SettingsIcon className="size-5 text-primary" />
        <h1 className="text-2xl font-semibold tracking-tight">Shop settings</h1>
      </div>

      <Card className="p-6 space-y-4">
        {isLoading ? <Loader2 className="size-5 animate-spin" /> : (
          <>
            <Field label="Shop name *">
              <Input value={form.shop_name} onChange={(e) => setForm({ ...form, shop_name: e.target.value })} />
            </Field>
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="Phone">
                <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+91 …" />
              </Field>
              <Field label="GSTIN">
                <Input value={form.gst_number} onChange={(e) => setForm({ ...form, gst_number: e.target.value })} placeholder="29ABCDE1234F1Z5" />
              </Field>
            </div>
            <Field label="Address (printed on receipt)">
              <Textarea rows={2} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
            </Field>
            <Field label="UPI ID (for QR payments)">
              <Input value={form.upi_id} onChange={(e) => setForm({ ...form, upi_id: e.target.value })} placeholder="merchant@upi" />
            </Field>
            <Field label="Receipt footer">
              <Input value={form.receipt_footer} onChange={(e) => setForm({ ...form, receipt_footer: e.target.value })} placeholder="Thank you for shopping!" />
            </Field>
            <div className="flex justify-end pt-2">
              <Button onClick={save} disabled={saving || !form.shop_name.trim()}>
                {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />} Save settings
              </Button>
            </div>
          </>
        )}
      </Card>

      <StoresCard />
    </div>
  );
}

const STORE_KINDS = ["supermarket", "bakery", "hardware", "pharmacy", "other"];

function StoresCard() {
  const qc = useQueryClient();
  const { storeId, stores, setStoreId } = useActiveStore();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", kind: "supermarket", phone: "", address: "", gst_number: "", upi_id: "" });
  const [copyFrom, setCopyFrom] = useState("__none");
  const [busy, setBusy] = useState(false);

  const create = async () => {
    if (!form.name.trim()) return toast.error("Store name required");
    setBusy(true);
    try {
      const { data, error } = await supabase.from("stores").insert({
        name: form.name.trim(), kind: form.kind,
        phone: form.phone || null, address: form.address || null,
        gst_number: form.gst_number || null, upi_id: form.upi_id || null,
      }).select("id").single();
      if (error) throw error;

      if (copyFrom !== "__none") {
        const { data: src, error: e2 } = await supabase.from("products")
          .select("*").eq("store_id", copyFrom).eq("is_active", true);
        if (e2) throw e2;
        const rows = (src ?? []).map((p) => {
          const { id: _id, created_at: _c, updated_at: _u, last_sold_at: _l, ...rest } = p as Record<string, unknown> as never;
          return { ...(rest as object), store_id: data.id, stock_qty: 0 };
        });
        if (rows.length) {
          const { error: e3 } = await supabase.from("products").insert(rows as never);
          if (e3) throw e3;
        }
        toast.success(`Store created with ${rows.length} product(s) copied (stock set to 0)`);
      } else {
        toast.success("Store created");
      }

      qc.invalidateQueries({ queryKey: ["stores"] });
      setStoreId(data.id);
      setOpen(false);
      setForm({ name: "", kind: "supermarket", phone: "", address: "", gst_number: "", upi_id: "" });
      setCopyFrom("__none");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Could not create store");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="p-6 mt-6 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Store className="size-5 text-primary" />
          <h2 className="text-lg font-semibold">Stores & branches</h2>
        </div>
        <Button size="sm" onClick={() => setOpen(true)}><Plus className="size-4" /> Add store</Button>
      </div>
      <p className="text-sm text-muted-foreground">
        Each store keeps its own products, stock, bills, purchases and reports. Switch stores from the sidebar.
      </p>
      <div className="divide-y border rounded-lg">
        {stores.map((s: StoreRow) => (
          <div key={s.id} className="flex items-center gap-3 px-4 py-3">
            <div className="flex-1 min-w-0">
              <div className="font-medium truncate">{s.name}</div>
              <div className="text-xs text-muted-foreground capitalize">{s.kind}{s.phone ? ` · ${s.phone}` : ""}</div>
            </div>
            {s.id === storeId
              ? <span className="text-xs text-primary font-medium">Active</span>
              : <Button size="sm" variant="outline" onClick={() => setStoreId(s.id)}>Switch</Button>}
          </div>
        ))}
      </div>

      <Dialog open={open} onOpenChange={(v) => { if (!v) setOpen(false); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Add store / branch</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Field label="Store name *">
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="SHANID BAKERY" />
            </Field>
            <div className="grid sm:grid-cols-2 gap-3">
              <Field label="Type">
                <Select value={form.kind} onValueChange={(v) => setForm({ ...form, kind: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{STORE_KINDS.map((k) => <SelectItem key={k} value={k} className="capitalize">{k}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
              <Field label="Phone"><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
              <Field label="GSTIN"><Input value={form.gst_number} onChange={(e) => setForm({ ...form, gst_number: e.target.value })} /></Field>
              <Field label="UPI ID"><Input value={form.upi_id} onChange={(e) => setForm({ ...form, upi_id: e.target.value })} /></Field>
            </div>
            <Field label="Address"><Textarea rows={2} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></Field>
            <Field label="Copy products from an existing store">
              <Select value={copyFrom} onValueChange={setCopyFrom}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">Start empty</SelectItem>
                  {stores.map((s: StoreRow) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            {copyFrom !== "__none" && (
              <div className="text-xs text-muted-foreground flex items-center gap-1.5">
                <Copy className="size-3.5" /> Products are copied with stock 0 — update quantities in Inventory.
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={create} disabled={busy}>{busy ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />} Create store</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm">{label}</Label>
      {children}
    </div>
  );
}
