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
import { Settings as SettingsIcon, Save, Loader2 } from "lucide-react";
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
    </div>
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
