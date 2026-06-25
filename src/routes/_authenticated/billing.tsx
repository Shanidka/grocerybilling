import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, Minus, Trash2, ScanBarcode, Search, X, Receipt } from "lucide-react";
import { toast } from "sonner";
import { inr, num } from "@/lib/format";
import { generateReceipt } from "@/lib/receipt";

export const Route = createFileRoute("/_authenticated/billing")({
  component: BillingPage,
  head: () => ({ meta: [{ title: "Billing — FreshMart POS" }] }),
});

type Product = {
  id: string; name: string; barcode: string | null;
  unit: string; selling_price: number; tax_pct: number; stock_qty: number;
};

type CartItem = {
  product_id: string;
  name: string;
  qty: number;
  unit_price: number;
  tax_pct: number;
  line_discount: number; // flat amount
};

function BillingPage() {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [billDiscount, setBillDiscount] = useState("0");
  const [payment, setPayment] = useState("cash");
  const [custName, setCustName] = useState("");
  const [custPhone, setCustPhone] = useState("");
  const [showPicker, setShowPicker] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const products = useQuery({
    queryKey: ["products-pos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id,name,barcode,unit,selling_price,tax_pct,stock_qty")
        .eq("active", true)
        .order("name");
      if (error) throw error;
      return data as Product[];
    },
  });

  useEffect(() => { inputRef.current?.focus(); }, []);

  const totals = useMemo(() => {
    let subtotal = 0, taxTotal = 0, lineDiscount = 0;
    for (const it of cart) {
      const gross = it.qty * it.unit_price;
      const afterDiscount = Math.max(0, gross - it.line_discount);
      const tax = afterDiscount * (it.tax_pct / 100);
      subtotal += afterDiscount;
      taxTotal += tax;
      lineDiscount += it.line_discount;
    }
    const billDisc = Number(billDiscount) || 0;
    const grand = Math.max(0, subtotal + taxTotal - billDisc);
    return { subtotal, taxTotal, lineDiscount, billDisc, grand };
  }, [cart, billDiscount]);

  const addProduct = (p: Product) => {
    setCart((prev) => {
      const i = prev.findIndex((x) => x.product_id === p.id);
      if (i >= 0) {
        const c = [...prev];
        c[i] = { ...c[i], qty: c[i].qty + 1 };
        return c;
      }
      return [
        ...prev,
        {
          product_id: p.id, name: p.name, qty: 1,
          unit_price: Number(p.selling_price), tax_pct: Number(p.tax_pct), line_discount: 0,
        },
      ];
    });
  };

  // Handle barcode/search: Enter triggers exact barcode match, else show picker
  const onQuerySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const term = query.trim();
    if (!term) return;
    const list = products.data ?? [];
    const exact = list.find((p) => p.barcode && p.barcode.toLowerCase() === term.toLowerCase());
    if (exact) {
      addProduct(exact);
      setQuery("");
      return;
    }
    const matches = list.filter(
      (p) => p.name.toLowerCase().includes(term.toLowerCase()) || p.barcode?.toLowerCase().includes(term.toLowerCase()),
    );
    if (matches.length === 1) {
      addProduct(matches[0]); setQuery(""); return;
    }
    if (matches.length === 0) {
      toast.error("No product matches"); return;
    }
    setShowPicker(true);
  };

  const updateItem = (i: number, patch: Partial<CartItem>) =>
    setCart((c) => c.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  const removeItem = (i: number) => setCart((c) => c.filter((_, idx) => idx !== i));

  const submit = async () => {
    if (!cart.length) { toast.error("Cart is empty"); return; }
    setSubmitting(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Not signed in");
      const { data: sale, error } = await supabase
        .from("sales")
        .insert({
          cashier_id: u.user.id,
          subtotal: round(totals.subtotal),
          tax_total: round(totals.taxTotal),
          discount_total: round(totals.lineDiscount),
          bill_discount: round(totals.billDisc),
          grand_total: round(totals.grand),
          payment_mode: payment,
          customer_name: custName.trim() || null,
          customer_phone: custPhone.trim() || null,
        })
        .select()
        .single();
      if (error) throw error;
      const items = cart.map((it) => {
        const gross = it.qty * it.unit_price;
        const afterDiscount = Math.max(0, gross - it.line_discount);
        const tax = afterDiscount * (it.tax_pct / 100);
        return {
          sale_id: sale.id,
          product_id: it.product_id,
          product_name: it.name,
          qty: it.qty,
          unit_price: round(it.unit_price),
          tax_pct: it.tax_pct,
          line_discount: round(it.line_discount),
          line_total: round(afterDiscount + tax),
        };
      });
      const { error: e2 } = await supabase.from("sale_items").insert(items);
      if (e2) throw e2;
      toast.success(`Bill ${sale.bill_no} created`);
      generateReceipt({
        bill_no: sale.bill_no,
        created_at: sale.created_at,
        customer_name: custName, customer_phone: custPhone,
        payment_mode: payment,
        items: cart.map((it) => ({
          name: it.name, qty: it.qty, unit_price: it.unit_price,
          tax_pct: it.tax_pct, line_discount: it.line_discount,
          line_total: Math.max(0, it.qty * it.unit_price - it.line_discount) * (1 + it.tax_pct / 100),
        })),
        ...totals,
      });
      setCart([]); setBillDiscount("0"); setCustName(""); setCustPhone("");
      inputRef.current?.focus();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Could not save bill");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_400px] gap-4">
        {/* Left: scan + cart */}
        <div className="space-y-4">
          <Card className="p-4">
            <form onSubmit={onQuerySubmit} className="flex gap-2">
              <div className="relative flex-1">
                <ScanBarcode className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  ref={inputRef}
                  className="pl-9 h-11 text-base"
                  placeholder="Scan barcode or type product name… press Enter"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  autoFocus
                />
              </div>
              <Button type="button" variant="outline" onClick={() => setScannerOpen(true)} className="h-11">
                <ScanBarcode className="size-4" />
              </Button>
              <Button type="button" variant="outline" onClick={() => setShowPicker(true)} className="h-11">
                <Search className="size-4" />
              </Button>
            </form>
          </Card>

          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/60 text-muted-foreground">
                  <tr className="text-left">
                    <th className="px-3 py-2.5 font-medium">Item</th>
                    <th className="px-3 py-2.5 font-medium text-right">Price</th>
                    <th className="px-3 py-2.5 font-medium text-center">Qty</th>
                    <th className="px-3 py-2.5 font-medium text-right">Disc</th>
                    <th className="px-3 py-2.5 font-medium text-right">Total</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {cart.map((it, i) => {
                    const gross = it.qty * it.unit_price;
                    const afterDisc = Math.max(0, gross - it.line_discount);
                    const tot = afterDisc * (1 + it.tax_pct / 100);
                    return (
                      <tr key={i} className="border-t">
                        <td className="px-3 py-2">
                          <div className="font-medium">{it.name}</div>
                          <div className="text-xs text-muted-foreground">GST {num(it.tax_pct)}%</div>
                        </td>
                        <td className="px-3 py-2 text-right">
                          <Input className="h-8 w-24 text-right ml-auto" type="number" step="0.01"
                            value={it.unit_price}
                            onChange={(e) => updateItem(i, { unit_price: Number(e.target.value) })} />
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex items-center justify-center gap-1">
                            <Button variant="outline" size="icon" className="size-7"
                              onClick={() => updateItem(i, { qty: Math.max(0.001, it.qty - 1) })}>
                              <Minus className="size-3" />
                            </Button>
                            <Input className="h-8 w-16 text-center" type="number" step="0.001"
                              value={it.qty}
                              onChange={(e) => updateItem(i, { qty: Number(e.target.value) })} />
                            <Button variant="outline" size="icon" className="size-7"
                              onClick={() => updateItem(i, { qty: it.qty + 1 })}>
                              <Plus className="size-3" />
                            </Button>
                          </div>
                        </td>
                        <td className="px-3 py-2 text-right">
                          <Input className="h-8 w-20 text-right ml-auto" type="number" step="0.01"
                            value={it.line_discount}
                            onChange={(e) => updateItem(i, { line_discount: Number(e.target.value) })} />
                        </td>
                        <td className="px-3 py-2 text-right font-semibold">{inr(tot)}</td>
                        <td className="px-2 py-2 text-right">
                          <Button variant="ghost" size="icon" onClick={() => removeItem(i)}>
                            <Trash2 className="size-4" />
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                  {!cart.length && (
                    <tr><td colSpan={6} className="px-3 py-12 text-center text-muted-foreground">
                      Scan a barcode or search a product to start a bill
                    </td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </div>

        {/* Right: totals */}
        <Card className="p-5 h-fit lg:sticky lg:top-4 space-y-4">
          <h2 className="font-semibold text-lg">Bill summary</h2>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Customer name</Label>
              <Input value={custName} onChange={(e) => setCustName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Phone</Label>
              <Input value={custPhone} onChange={(e) => setCustPhone(e.target.value)} />
            </div>
          </div>
          <div className="space-y-2 text-sm border-t pt-3">
            <Row label="Subtotal" value={inr(totals.subtotal)} />
            <Row label="GST" value={inr(totals.taxTotal)} />
            {totals.lineDiscount > 0 && <Row label="Item discounts" value={`- ${inr(totals.lineDiscount)}`} />}
            <div className="flex items-center justify-between gap-2">
              <Label className="text-sm">Bill discount</Label>
              <Input type="number" step="0.01" value={billDiscount} onChange={(e) => setBillDiscount(e.target.value)}
                className="h-8 w-28 text-right" />
            </div>
            <div className="flex items-center justify-between gap-2">
              <Label className="text-sm">Payment</Label>
              <Select value={payment} onValueChange={setPayment}>
                <SelectTrigger className="h-8 w-32"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="upi">UPI</SelectItem>
                  <SelectItem value="card">Card</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="border-t pt-3 flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Grand total</span>
            <span className="text-2xl font-semibold">{inr(totals.grand)}</span>
          </div>
          <Button className="w-full h-11" onClick={submit} disabled={submitting || !cart.length}>
            <Receipt className="size-4 mr-2" />
            {submitting ? "Saving…" : "Complete & print"}
          </Button>
          {cart.length > 0 && (
            <Button variant="ghost" className="w-full" onClick={() => setCart([])}>
              <X className="size-4 mr-2" /> Clear cart
            </Button>
          )}
        </Card>
      </div>

      <ProductPicker
        open={showPicker}
        onClose={() => setShowPicker(false)}
        products={products.data ?? []}
        onPick={(p) => { addProduct(p); setShowPicker(false); setQuery(""); }}
        initialQuery={query}
      />

      <CameraScanner open={scannerOpen} onClose={() => setScannerOpen(false)} onScan={(code) => {
        setScannerOpen(false);
        const list = products.data ?? [];
        const p = list.find((x) => x.barcode === code);
        if (p) { addProduct(p); toast.success(`Added ${p.name}`); }
        else { toast.error(`No product with barcode ${code}`); setQuery(code); }
      }} />
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

function round(n: number) { return Math.round(n * 100) / 100; }

function ProductPicker({
  open, onClose, products, onPick, initialQuery,
}: {
  open: boolean; onClose: () => void; products: Product[];
  onPick: (p: Product) => void; initialQuery: string;
}) {
  const [q, setQ] = useState("");
  useEffect(() => { if (open) setQ(initialQuery || ""); }, [open, initialQuery]);
  const list = q.trim()
    ? products.filter((p) => p.name.toLowerCase().includes(q.toLowerCase()) || p.barcode?.toLowerCase().includes(q.toLowerCase()))
    : products.slice(0, 50);
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader><DialogTitle>Select a product</DialogTitle></DialogHeader>
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…" autoFocus />
        <div className="max-h-80 overflow-auto divide-y border rounded-md">
          {list.map((p) => (
            <button key={p.id} className="w-full text-left px-3 py-2 hover:bg-muted flex items-center justify-between gap-3" onClick={() => onPick(p)}>
              <div>
                <div className="font-medium">{p.name}</div>
                <div className="text-xs text-muted-foreground">{p.barcode || "no barcode"} · stock {num(p.stock_qty)} {p.unit}</div>
              </div>
              <span className="font-semibold">{inr(p.selling_price)}</span>
            </button>
          ))}
          {!list.length && <div className="px-3 py-6 text-center text-muted-foreground text-sm">No matches</div>}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function CameraScanner({ open, onClose, onScan }: { open: boolean; onClose: () => void; onScan: (code: string) => void }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = useState<string | undefined>(undefined);
  const [manual, setManual] = useState("");

  useEffect(() => {
    if (!open) return;
    let controls: { stop: () => void } | null = null;
    let cancelled = false;

    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          toast.error("Camera not supported on this device");
          return;
        }
        const { BrowserMultiFormatReader } = await import("@zxing/browser");
        const { DecodeHintType, BarcodeFormat } = await import("@zxing/library");
        const hints = new Map();
        hints.set(DecodeHintType.POSSIBLE_FORMATS, [
          BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.UPC_A, BarcodeFormat.UPC_E,
          BarcodeFormat.CODE_128, BarcodeFormat.CODE_39, BarcodeFormat.ITF, BarcodeFormat.CODABAR,
          BarcodeFormat.QR_CODE, BarcodeFormat.DATA_MATRIX,
        ]);
        hints.set(DecodeHintType.TRY_HARDER, true);
        const reader = new BrowserMultiFormatReader(hints);

        // Trigger permission prompt so device labels are available
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
          stream.getTracks().forEach((t) => t.stop());
        } catch {
          toast.error("Camera permission denied");
          return;
        }
        const cams = await BrowserMultiFormatReader.listVideoInputDevices();
        if (cancelled) return;
        setDevices(cams);
        const preferred = cams.find((c) => /back|rear|environment/i.test(c.label))?.deviceId
          ?? deviceId
          ?? cams[0]?.deviceId;
        setDeviceId(preferred);
        if (!videoRef.current) return;

        controls = await reader.decodeFromVideoDevice(
          preferred,
          videoRef.current,
          (result, _err, ctrl) => {
            if (result) {
              const text = result.getText();
              ctrl.stop();
              onScan(text);
            }
          },
        );
      } catch (e) {
        console.error("scanner error", e);
        toast.error("Camera unavailable");
        onClose();
      }
    })();

    return () => {
      cancelled = true;
      controls?.stop();
    };
  }, [open, deviceId, onScan, onClose]);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Scan barcode</DialogTitle></DialogHeader>
        <div className="w-full aspect-[4/3] bg-black rounded-md overflow-hidden">
          <video ref={videoRef} className="w-full h-full object-cover" muted playsInline />
        </div>
        {devices.length > 1 && (
          <Select value={deviceId} onValueChange={setDeviceId}>
            <SelectTrigger className="h-9"><SelectValue placeholder="Camera" /></SelectTrigger>
            <SelectContent>
              {devices.map((d) => (
                <SelectItem key={d.deviceId} value={d.deviceId}>{d.label || `Camera ${d.deviceId.slice(0, 6)}`}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <p className="text-xs text-muted-foreground text-center">Point the camera at the barcode</p>
        <div className="border-t pt-3 space-y-2">
          <Label className="text-xs">Or enter barcode manually</Label>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const code = manual.trim();
              if (!code) return;
              onScan(code);
              setManual("");
            }}
          >
            <Input value={manual} onChange={(e) => setManual(e.target.value)} placeholder="Type or paste barcode" autoFocus={false} />
            <Button type="submit">Add</Button>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  );
}
