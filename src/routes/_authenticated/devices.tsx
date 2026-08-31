import { createFileRoute } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useStoreId } from "@/lib/active-store";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Printer, ScanBarcode, Trash2, Bluetooth, Network, Star, Usb } from "lucide-react";
import { useMyRoles, canManage } from "@/hooks/use-role";

export const Route = createFileRoute("/_authenticated/devices")({
  ssr: false,
  component: DevicesPage,
  head: () => ({
    meta: [
      { title: "Devices — printers & scanners | Bazaar POS" },
      { name: "description", content: "Connect LAN and Bluetooth receipt printers and plug-and-play barcode scanners to your billing counter." },
      { property: "og:title", content: "Devices — printers & scanners | Bazaar POS" },
      { property: "og:description", content: "Connect LAN and Bluetooth receipt printers and barcode scanners to your counter." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

type Device = {
  id: string;
  name: string;
  kind: string;
  connection: string;
  ip_address: string | null;
  port: number | null;
  bluetooth_id: string | null;
  paper_width: number;
  is_default: boolean;
  notes: string | null;
};

const ESC_TEST = (shop: string) => {
  const text = `\x1B@\x1B!\x30${shop}\n\x1B!\x00Test print OK\n${new Date().toLocaleString("en-IN")}\n\n\n\n`;
  return new TextEncoder().encode(text);
};

async function bluetoothTestPrint(name: string) {
  const nav = navigator as Navigator & { bluetooth?: any };
  if (!nav.bluetooth) throw new Error("This browser/device does not support Bluetooth printing. Use Chrome on Android or Windows.");
  const device = await nav.bluetooth.requestDevice({
    acceptAllDevices: true,
    optionalServices: [0x18f0, "000018f0-0000-1000-8000-00805f9b34fb", "e7810a71-73ae-499d-8c15-faa9aef0c3f2"],
  });
  const server = await device.gatt.connect();
  const services = await server.getPrimaryServices();
  for (const svc of services) {
    const chars = await svc.getCharacteristics();
    for (const ch of chars) {
      if (ch.properties.write || ch.properties.writeWithoutResponse) {
        const data = ESC_TEST(name);
        for (let i = 0; i < data.length; i += 180) {
          const chunk = data.slice(i, i + 180);
          if (ch.properties.writeWithoutResponse) await ch.writeValueWithoutResponse(chunk);
          else await ch.writeValue(chunk);
        }
        return device.id as string;
      }
    }
  }
  throw new Error("No writable characteristic found on this printer.");
}

function DevicesPage() {
  const { data: roles } = useMyRoles();
  const manage = canManage(roles);
  const qc = useQueryClient();
  const storeId = useStoreId();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    name: "", kind: "printer", connection: "lan", ip_address: "", port: "9100",
    bluetooth_id: "", paper_width: "80", notes: "",
  });

  const list = useQuery({
    queryKey: ["devices", storeId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("devices")
        .select("id,name,kind,connection,ip_address,port,bluetooth_id,paper_width,is_default,notes")
        .eq("store_id", storeId)
        .eq("is_active", true)
        .order("created_at");
      if (error) throw error;
      return (data ?? []) as Device[];
    },
  });

  const save = async () => {
    if (!form.name.trim()) return toast.error("Device name required");
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase.from("devices").insert({
      store_id: storeId,
      name: form.name.trim(),
      kind: form.kind,
      connection: form.connection,
      ip_address: form.ip_address || null,
      port: form.port ? Number(form.port) : null,
      bluetooth_id: form.bluetooth_id || null,
      paper_width: Number(form.paper_width) || 80,
      notes: form.notes || null,
      created_by: u.user?.id ?? null,
    });
    if (error) return toast.error(error.message);
    toast.success("Device added");
    setOpen(false);
    setForm({ name: "", kind: "printer", connection: "lan", ip_address: "", port: "9100", bluetooth_id: "", paper_width: "80", notes: "" });
    qc.invalidateQueries({ queryKey: ["devices"] });
  };

  const remove = async (id: string) => {
    const { error } = await supabase.from("devices").delete().eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["devices"] });
  };

  const makeDefault = async (id: string) => {
    await supabase.from("devices").update({ is_default: false }).eq("store_id", storeId).eq("kind", "printer");
    const { error } = await supabase.from("devices").update({ is_default: true }).eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["devices"] });
  };

  const testDevice = async (d: Device) => {
    try {
      if (d.connection === "bluetooth") {
        const id = await bluetoothTestPrint(d.name);
        if (id && id !== d.bluetooth_id) {
          await supabase.from("devices").update({ bluetooth_id: id }).eq("id", d.id);
          qc.invalidateQueries({ queryKey: ["devices"] });
        }
        toast.success("Test print sent over Bluetooth");
      } else {
        window.print();
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Test failed");
    }
  };

  return (
    <div className="p-4 lg:p-6 space-y-6 max-w-5xl">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2"><Printer className="size-6" /> Devices</h1>
          <p className="text-sm text-muted-foreground">Receipt printers (LAN / Bluetooth / USB) and barcode scanners for this branch.</p>
        </div>
        {manage && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button><Plus className="size-4" /> Add device</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>New device</DialogTitle></DialogHeader>
              <div className="grid sm:grid-cols-2 gap-3">
                <div className="sm:col-span-2"><Label>Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Counter 1 printer" /></div>
                <div><Label>Type</Label>
                  <Select value={form.kind} onValueChange={(v) => setForm({ ...form, kind: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="printer">Receipt printer</SelectItem>
                      <SelectItem value="scanner">Barcode scanner</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div><Label>Connection</Label>
                  <Select value={form.connection} onValueChange={(v) => setForm({ ...form, connection: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="lan">LAN / Wi-Fi</SelectItem>
                      <SelectItem value="bluetooth">Bluetooth</SelectItem>
                      <SelectItem value="usb">USB</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {form.connection === "lan" && (<>
                  <div><Label>IP address</Label><Input value={form.ip_address} onChange={(e) => setForm({ ...form, ip_address: e.target.value })} placeholder="192.168.1.50" /></div>
                  <div><Label>Port</Label><Input value={form.port} onChange={(e) => setForm({ ...form, port: e.target.value })} /></div>
                </>)}
                {form.kind === "printer" && (
                  <div><Label>Paper width (mm)</Label>
                    <Select value={form.paper_width} onValueChange={(v) => setForm({ ...form, paper_width: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value="58">58 mm</SelectItem><SelectItem value="80">80 mm</SelectItem></SelectContent>
                    </Select>
                  </div>
                )}
                <div className="sm:col-span-2"><Label>Notes</Label><Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
              </div>
              <DialogFooter><Button onClick={save}>Save device</Button></DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <Card className="p-0 overflow-hidden">
        {!list.data?.length ? (
          <div className="p-8 text-center text-sm text-muted-foreground">No devices saved yet.</div>
        ) : (
          <div className="divide-y">
            {list.data.map((d) => {
              const Icon = d.kind === "scanner" ? ScanBarcode : Printer;
              const CIcon = d.connection === "bluetooth" ? Bluetooth : d.connection === "usb" ? Usb : Network;
              return (
                <div key={d.id} className="p-4 flex items-center gap-4 flex-wrap">
                  <div className="size-10 rounded-xl bg-secondary text-secondary-foreground grid place-items-center"><Icon className="size-5" /></div>
                  <div className="min-w-0 flex-1">
                    <div className="font-medium flex items-center gap-2">
                      {d.name}
                      {d.is_default && <span className="text-[10px] uppercase px-1.5 py-0.5 rounded bg-primary text-primary-foreground">Default</span>}
                    </div>
                    <div className="text-xs text-muted-foreground flex items-center gap-1.5">
                      <CIcon className="size-3" />
                      {d.connection === "lan" ? `${d.ip_address ?? "—"}:${d.port ?? 9100}` : d.connection === "bluetooth" ? (d.bluetooth_id ? "Paired" : "Not paired yet") : "USB"}
                      {d.kind === "printer" && ` · ${d.paper_width} mm`}
                    </div>
                  </div>
                  {d.kind === "printer" && <Button variant="outline" size="sm" onClick={() => testDevice(d)}>Test print</Button>}
                  {manage && d.kind === "printer" && !d.is_default && <Button variant="ghost" size="sm" onClick={() => makeDefault(d.id)}><Star className="size-4" /></Button>}
                  {manage && <Button variant="ghost" size="icon" onClick={() => remove(d.id)}><Trash2 className="size-4" /></Button>}
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <ScannerTester />

      <Card className="p-5 text-sm text-muted-foreground space-y-2">
        <div className="font-semibold text-foreground">How connections work</div>
        <p><strong>Barcode scanners</strong> (USB or Bluetooth HID) are plug-and-play — they type the barcode like a keyboard. Just plug it in and scan into the billing screen; use the tester above to confirm.</p>
        <p><strong>Bluetooth printers</strong> pair directly from this page (Chrome on Android/Windows) and receive ESC/POS test prints.</p>
        <p><strong>LAN / Wi-Fi and USB printers</strong> print through your system print dialog — save the IP here for reference and set the printer as default in Windows/Android.</p>
      </Card>
    </div>
  );
}

function ScannerTester() {
  const [value, setValue] = useState("");
  const [last, setLast] = useState<{ code: string; ms: number } | null>(null);
  const startedAt = useRef<number | null>(null);

  return (
    <Card className="p-5 space-y-3">
      <div className="font-semibold flex items-center gap-2"><ScanBarcode className="size-4" /> Scanner test</div>
      <Input
        autoFocus
        value={value}
        placeholder="Click here and scan any barcode…"
        onChange={(e) => {
          if (startedAt.current === null) startedAt.current = performance.now();
          setValue(e.target.value);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && value) {
            setLast({ code: value, ms: Math.round(performance.now() - (startedAt.current ?? performance.now())) });
            setValue("");
            startedAt.current = null;
          }
        }}
      />
      {last && (
        <div className="text-sm">
          Detected <span className="font-mono font-medium">{last.code}</span>{" "}
          <span className="text-muted-foreground">({last.code.length} chars in {last.ms} ms — {last.ms < 300 ? "hardware scanner working" : "typed manually?"})</span>
        </div>
      )}
    </Card>
  );
}
