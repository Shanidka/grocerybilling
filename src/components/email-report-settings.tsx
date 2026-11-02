import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Loader2, Mail, Plus, Trash2 } from "lucide-react";

type Recipient = {
  id: string; email: string; daily: boolean; weekly: boolean;
  monthly: boolean; yearly: boolean; is_active: boolean;
};

const FREQS = [
  { key: "daily" as const, label: "Daily" },
  { key: "weekly" as const, label: "Weekly" },
  { key: "monthly" as const, label: "Monthly" },
  { key: "yearly" as const, label: "Yearly" },
];

export function EmailReportSettings() {
  const qc = useQueryClient();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);

  const { data: recipients, isLoading } = useQuery({
    queryKey: ["email-report-recipients"],
    queryFn: async (): Promise<Recipient[]> => {
      const { data, error } = await supabase
        .from("email_report_recipients")
        .select("id,email,daily,weekly,monthly,yearly,is_active")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const add = async () => {
    const clean = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) return toast.error("Enter a valid email address");
    setBusy(true);
    try {
      const { error } = await supabase.from("email_report_recipients").insert({
        email: clean, daily: true, weekly: false, monthly: false, yearly: false,
      });
      if (error) {
        if (error.message.includes("duplicate")) toast.error("That email is already added");
        else throw error;
      } else {
        toast.success("Email added — daily sales report enabled");
        setEmail("");
      }
      qc.invalidateQueries({ queryKey: ["email-report-recipients"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not add email");
    } finally {
      setBusy(false);
    }
  };

  const toggle = async (id: string, field: keyof Recipient, value: boolean) => {
    const { error } = await supabase.from("email_report_recipients").update({ [field]: value }).eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["email-report-recipients"] });
  };

  const remove = async (id: string) => {
    const { error } = await supabase.from("email_report_recipients").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Email removed");
    qc.invalidateQueries({ queryKey: ["email-report-recipients"] });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Mail className="size-5 text-primary" />
        <h2 className="text-lg font-semibold">Mail configuration</h2>
      </div>
      <p className="text-sm text-muted-foreground">
        Automatic sales reports (sales, bill count, cash / UPI / card split, profit, top items) sent to the emails below.
        Sending starts once your email sender domain is verified.
      </p>

      <div className="flex gap-2 items-end">
        <div className="flex-1 space-y-1.5">
          <Label className="text-sm">Add email address</Label>
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="owner@example.com"
            onKeyDown={(e) => { if (e.key === "Enter") void add(); }}
          />
        </div>
        <Button onClick={add} disabled={busy}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />} Add
        </Button>
      </div>

      {isLoading ? <Loader2 className="size-5 animate-spin" /> : (
        recipients && recipients.length > 0 ? (
          <div className="divide-y border rounded-lg">
            {recipients.map((r) => (
              <div key={r.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{r.email}</div>
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Switch checked={r.is_active} onCheckedChange={(v) => toggle(r.id, "is_active", v)} />
                    Active
                  </div>
                </div>
                <div className="flex items-center gap-3 text-xs">
                  {FREQS.map((f) => (
                    <label key={f.key} className="flex items-center gap-1.5 cursor-pointer">
                      <Checkbox
                        checked={r[f.key]}
                        onCheckedChange={(v) => toggle(r.id, f.key, v === true)}
                      />
                      {f.label}
                    </label>
                  ))}
                </div>
                <Button size="icon" variant="ghost" className="text-destructive" onClick={() => remove(r.id)}>
                  <Trash2 className="size-4" />
                </Button>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-sm text-muted-foreground border rounded-lg p-4">No email addresses added yet.</div>
        )
      )}
    </div>
  );
}
