import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useShopSettings } from "@/lib/shop-settings";
import { validateLoyaltySettings } from "@/lib/loyalty-rules";
import { canManage, useMyRoles } from "@/hooks/use-role";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Save, Loader2 } from "lucide-react";
import { toast } from "sonner";

export function LoyaltySettings() {
  const qc = useQueryClient();
  const { data, isLoading, error } = useShopSettings();
  const { data: roles } = useMyRoles();
  const editable = canManage(roles);
  const [on, setOn] = useState(false);
  const [earn, setEarn] = useState("100");
  const [pointsPerRupee, setPointsPerRupee] = useState("10");
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!data) return;
    setOn(Boolean(data.loyalty_enabled));
    setEarn(String(data.loyalty_earn_per ?? 100));
    setPointsPerRupee(String(1 / (Number(data.loyalty_point_value) || 0.1)));
  }, [data]);
  const save = async () => {
    const e = Number(earn), p = Number(pointsPerRupee);
    if (!editable || !validateLoyaltySettings(e, p)) return toast.error("Enter positive values for both rates");
    setSaving(true);
    try {
      const { error } = await supabase.from("shop_settings").update({ loyalty_enabled: on, loyalty_earn_per: e, loyalty_point_value: 1 / p }).eq("id", 1);
      if (error) throw error;
      toast.success("Loyalty settings saved");
      await qc.invalidateQueries({ queryKey: ["shop-settings"] });
    } catch (e) { toast.error(e instanceof Error ? e.message : "Unable to save loyalty settings"); }
    finally { setSaving(false); }
  };
  if (isLoading) return <Loader2 className="size-5 animate-spin" />;
  if (error) return <p className="text-destructive">Unable to load loyalty settings.</p>;
  return <section className="space-y-5">
    <div className="flex items-center justify-between gap-4">
      <h2 className="text-lg font-semibold">Customer loyalty program</h2>
      <Switch aria-label="Enable loyalty program" checked={on} onCheckedChange={setOn} disabled={!editable || saving} />
    </div>
    <div className="grid sm:grid-cols-2 gap-4">
      <div className="space-y-1.5"><Label htmlFor="loyalty-earn">Rupees spent for 1 point</Label><Input id="loyalty-earn" type="number" min="0.01" step="any" value={earn} onChange={(e) => setEarn(e.target.value)} disabled={!editable || saving} /></div>
      <div className="space-y-1.5"><Label htmlFor="loyalty-redeem">Points needed for Rs.1 off</Label><Input id="loyalty-redeem" type="number" min="0.01" step="any" value={pointsPerRupee} onChange={(e) => setPointsPerRupee(e.target.value)} disabled={!editable || saving} /></div>
    </div>
    <p className="text-sm text-muted-foreground">{on ? "Program active" : "Program paused"} · Applies to all branches · Phone number required for membership</p>
    {editable && <div className="flex justify-end"><Button onClick={save} disabled={saving}>{saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />} Save loyalty</Button></div>}
  </section>;
}