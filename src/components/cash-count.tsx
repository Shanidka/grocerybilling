import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { canManage, useMyRoles } from "@/hooks/use-role";
import { useStoreId } from "@/lib/active-store";
import { num } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ClipboardCheck } from "lucide-react";
import { toast } from "sonner";

export function CashCount() {
  const storeId = useStoreId();
  const { data: roles } = useMyRoles();
  const manager = canManage(roles);
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const [open, setOpen] = useState(false);
  const [day, setDay] = useState(today);
  const [opening, setOpening] = useState("0");
  const [counted, setCounted] = useState("");
  const [payouts, setPayouts] = useState("0");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const qc = useQueryClient();
  const history = useQuery({ queryKey: ["cash-closings", storeId], enabled: manager, queryFn: async () => {
    const { data, error } = await supabase.from("cash_closings").select("*").eq("store_id", storeId).order("business_date", { ascending: false }).limit(30);
    if (error) throw error;
    return data ?? [];
  } });
  const save = async () => {
    const values = [Number(opening), Number(counted), Number(payouts)];
    if (!counted.trim() || values.some((v) => !Number.isFinite(v) || v < 0) || !day || day > today) return toast.error("Enter a valid date and non-negative cash amounts");
    setSaving(true);
    const { error } = await supabase.rpc("submit_cash_closing", { _store: storeId, _day: day, _opening: values[0], _counted: values[1], _payouts: values[2], _notes: notes });
    setSaving(false);
    if (error) return toast.error(error.code === "23505" ? "A cash count has already been submitted for this date" : error.message);
    toast.success("Cash count submitted");
    setOpen(false); setCounted(""); setNotes("");
    await qc.invalidateQueries({ queryKey: ["cash-closings"] });
  };
  return <section className="space-y-4 border-t pt-5">
    <div className="flex items-center justify-between flex-wrap gap-3"><h2 className="text-lg font-semibold">Cash counts</h2><Button onClick={() => setOpen(true)}><ClipboardCheck className="size-4" /> Count cash</Button></div>
    {manager && (history.error ? <p className="text-destructive">Unable to load cash counts.</p> : !history.data?.length ? <p className="text-muted-foreground text-sm">No cash counts submitted.</p> : <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="text-left text-muted-foreground"><tr><th className="py-2">Date</th><th className="px-3 text-right">Expected</th><th className="px-3 text-right">Counted</th><th className="px-3 text-right">Difference</th></tr></thead><tbody>{history.data.map((r) => <tr key={r.id} className="border-t"><td className="py-3">{r.business_date}</td><td className="px-3 text-right tabular-nums">Rs.{num(r.expected_cash)}</td><td className="px-3 text-right tabular-nums">Rs.{num(r.counted_cash)}</td><td className={`px-3 text-right tabular-nums ${Number(r.variance) < 0 ? "text-destructive" : "text-success"}`}>Rs.{num(r.variance)}</td></tr>)}</tbody></table></div>)}
    <Dialog open={open} onOpenChange={(v) => { if (!saving) setOpen(v); }}><DialogContent className="max-w-md"><DialogHeader><DialogTitle>Submit cash count</DialogTitle><DialogDescription>One final count per branch and date · India time</DialogDescription></DialogHeader>
      <div className="space-y-4"><div className="space-y-1.5"><Label htmlFor="cash-count-day">Date</Label><Input id="cash-count-day" type="date" max={today} value={day} onChange={(e) => setDay(e.target.value)} /></div><div className="space-y-1.5"><Label htmlFor="cash-opening">Opening cash (Rs.)</Label><Input id="cash-opening" type="number" min="0" value={opening} onChange={(e) => setOpening(e.target.value)} /></div><div className="space-y-1.5"><Label htmlFor="cash-counted">Physical cash counted (Rs.)</Label><Input id="cash-counted" type="number" min="0" value={counted} onChange={(e) => setCounted(e.target.value)} /></div><div className="space-y-1.5"><Label htmlFor="cash-payouts">Other cash taken out (Rs.)</Label><Input id="cash-payouts" type="number" min="0" value={payouts} onChange={(e) => setPayouts(e.target.value)} /></div><p className="text-xs text-muted-foreground">Exclude expenses already recorded. Include cash refunds or withdrawals not recorded as expenses.</p><div className="space-y-1.5"><Label htmlFor="cash-notes">Notes</Label><Textarea id="cash-notes" value={notes} onChange={(e) => setNotes(e.target.value)} /></div></div>
      <DialogFooter><Button variant="outline" disabled={saving} onClick={() => setOpen(false)}>Cancel</Button><Button disabled={saving} onClick={save}>{saving ? "Submitting…" : "Submit final count"}</Button></DialogFooter>
    </DialogContent></Dialog>
  </section>;
}