import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ScannerPanel } from "@/components/camera-scanner";
import { CameraIcon, Plus, Minus, Trash2, Search, Pause, Play, Printer, IndianRupee, Loader2, ShoppingCart, QrCode, Share2, Copy, MessageCircle } from "lucide-react";
import { toast } from "sonner";
import { inr } from "@/lib/format";
import { generateReceipt } from "@/lib/receipt";
import { useShopSettings, parseScaleBarcode } from "@/lib/shop-settings";
import { makeClientUid, makeOfflineBillNo, queueSale, adjustCachedStock, syncOfflineSales, pendingCount } from "@/lib/offline-sales";
import QRCode from "qrcode";


export const Route = createFileRoute("/_authenticated/billing")({
  ssr: false,
  component: Billing,
  head: () => ({ meta: [{ title: "Billing — Bazaar POS" }] }),
});

type Product = {
  id: string; barcode: string | null; name: string; brand: string | null;
  selling_price: number; mrp: number; tax_pct: number; stock_qty: number; unit: string;
  sold_by: string; price_per_kg: number;
};

type CartLine = {
  product_id: string; name: string; unit_price: number; qty: number;
  tax_pct: number; discount: number; stock_qty: number;
  sold_by: string; unit: string; mrp: number;
};

type HeldBill = {
  id: string; label: string; cart: unknown; customer_name: string | null;
  customer_phone: string | null; bill_discount: number | string; created_at: string;
};

const LOCAL_HELD_KEY = "bz_held_local";
function readLocalHeld(): HeldBill[] {
  try {
    const raw = localStorage.getItem(LOCAL_HELD_KEY);
    return raw ? (JSON.parse(raw) as HeldBill[]) : [];
  } catch { return []; }
}
function writeLocalHeld(list: HeldBill[]) {
  try { localStorage.setItem(LOCAL_HELD_KEY, JSON.stringify(list)); } catch { /* ignore */ }
}

const PAYMENT_MODES = [
  { value: "cash", label: "Cash" },
  { value: "card", label: "Card" },
  { value: "upi", label: "UPI" },
  { value: "qr", label: "QR" },
  { value: "split", label: "Split" },
];



function Billing() {
  const qc = useQueryClient();
  const [scanOpen, setScanOpen] = useState(false);
  const [recallOpen, setRecallOpen] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [shareInfo, setShareInfo] = useState<{ billNo: string; phone: string; total: number } | null>(null);
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [billDiscount, setBillDiscount] = useState(0);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const searchRef = useRef<HTMLInputElement | null>(null);

  // Load products (cached for offline)
  const productsQ = useQuery({
    queryKey: ["billing-products"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id,barcode,name,brand,selling_price,mrp,tax_pct,stock_qty,unit,is_active,sold_by,price_per_kg")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      const list = (data ?? []) as unknown as Product[];
      try { localStorage.setItem("bz_products", JSON.stringify(list)); } catch { /* ignore */ }
      return list;
    },
    initialData: () => {
      try {
        const raw = localStorage.getItem("bz_products");
        return raw ? (JSON.parse(raw) as Product[]) : undefined;
      } catch { return undefined; }
    },
    staleTime: 30_000,
  });

  const products = productsQ.data ?? [];

  // Held bills (falls back to this device's local store when offline)
  const heldQ = useQuery({
    queryKey: ["held-bills"],
    queryFn: async () => {
      const local = readLocalHeld();
      try {
        const { data, error } = await supabase
          .from("held_bills")
          .select("id,label,cart,customer_name,customer_phone,bill_discount,created_at")
          .order("created_at", { ascending: false });
        if (error) throw error;
        return [...local, ...(data ?? [])];
      } catch {
        return local;
      }
    },
  });


  const searchResults = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    return products.filter((p) =>
      p.name.toLowerCase().includes(q) ||
      (p.brand?.toLowerCase().includes(q) ?? false) ||
      (p.barcode?.toLowerCase().includes(q) ?? false),
    ).slice(0, 8);
  }, [products, search]);

  const totals = useMemo(() => {
    const subtotal = cart.reduce((s, l) => s + l.unit_price * l.qty, 0);
    const lineDisc = cart.reduce((s, l) => s + l.discount, 0);
    const taxableBase = cart.reduce((s, l) => s + Math.max(0, l.unit_price * l.qty - l.discount), 0);
    const taxTotal = cart.reduce((s, l) => {
      const base = Math.max(0, l.unit_price * l.qty - l.discount);
      return s + base * (l.tax_pct / 100);
    }, 0);
    const billDisc = Math.min(billDiscount, taxableBase + taxTotal);
    const grand = Math.max(0, taxableBase + taxTotal - billDisc);
    return { subtotal, lineDisc, taxTotal, billDisc, grand };
  }, [cart, billDiscount]);

  const addProduct = (p: Product, qty = 1, unitPriceOverride?: number) => {
    const isWeight = p.sold_by === "weight";
    const unit_price = unitPriceOverride ?? (isWeight ? Number(p.price_per_kg) : Number(p.selling_price));
    setCart((c) => {
      const i = c.findIndex((l) => l.product_id === p.id && l.unit_price === unit_price);
      if (i >= 0 && !isWeight) {
        const next = [...c];
        next[i] = { ...next[i], qty: next[i].qty + qty };
        return next;
      }
      return [
        ...c,
        {
          product_id: p.id, name: p.name, unit_price,
          qty, tax_pct: Number(p.tax_pct), discount: 0, stock_qty: Number(p.stock_qty),
          sold_by: p.sold_by, unit: isWeight ? "kg" : p.unit, mrp: Number(p.mrp || 0),
        },
      ];
    });
  };

  const handleScan = (code: string) => {
    // 1) Try scale-embedded EAN-13 (price/weight label)
    const scale = parseScaleBarcode(code);
    if (scale) {
      const p = products.find((x) => x.barcode === scale.prefix || x.barcode?.startsWith(scale.prefix.slice(0, 7)));
      if (p) {
        const kg = scale.grams / 1000;
        addProduct(p, kg);
        toast.success(`Added ${p.name} (${kg.toFixed(3)} kg)`);
        return;
      }
    }
    // 2) Exact barcode match
    const p = products.find((x) => x.barcode === code);
    if (!p) { toast.error(`No product for ${code}`); return; }
    addProduct(p);
    toast.success(`Added ${p.name}`);
  };

  const updateLine = (i: number, patch: Partial<CartLine>) => {
    setCart((c) => c.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  };
  const removeLine = (i: number) => setCart((c) => c.filter((_, idx) => idx !== i));
  const clearCart = () => { setCart([]); setBillDiscount(0); setCustomerName(""); setCustomerPhone(""); };

  // Hold bill (works offline — stored on this device)
  const holdBill = async () => {
    if (cart.length === 0) return;
    const { data: sess } = await supabase.auth.getSession();
    const uid = sess.session?.user.id;
    if (!uid) return;
    const label = customerName || `Bill ${new Date().toLocaleTimeString()}`;
    const { error } = await supabase.from("held_bills").insert({
      cashier_id: uid,
      label,
      cart: cart as unknown as never,
      customer_name: customerName || null,
      customer_phone: customerPhone || null,
      bill_discount: billDiscount,
    });
    if (error) {
      writeLocalHeld([
        {
          id: `local-${Date.now()}`, label: `${label} (offline)`, cart,
          customer_name: customerName || null, customer_phone: customerPhone || null,
          bill_discount: billDiscount, created_at: new Date().toISOString(),
        },
        ...readLocalHeld(),
      ]);
      toast.success("Bill held on this device");
    } else {
      toast.success("Bill held");
    }
    clearCart();
    qc.invalidateQueries({ queryKey: ["held-bills"] });
  };

  const recallBill = async (id: string) => {
    const held = (heldQ.data as HeldBill[] | undefined)?.find((h) => h.id === id);
    if (!held) return;
    setCart(held.cart as unknown as CartLine[]);
    setCustomerName(held.customer_name ?? "");
    setCustomerPhone(held.customer_phone ?? "");
    setBillDiscount(Number(held.bill_discount ?? 0));
    if (id.startsWith("local-")) writeLocalHeld(readLocalHeld().filter((h) => h.id !== id));
    else await supabase.from("held_bills").delete().eq("id", id);
    qc.invalidateQueries({ queryKey: ["held-bills"] });
    setRecallOpen(false);
    toast.success("Bill recalled");
  };


  // Offline bill queue — auto-sync when connectivity returns
  const [pending, setPending] = useState(0);
  useEffect(() => {
    const refresh = () => setPending(pendingCount());
    refresh();
    const run = async () => {
      const n = await syncOfflineSales();
      if (n > 0) {
        toast.success(`${n} offline bill(s) synced`);
        qc.invalidateQueries({ queryKey: ["billing-products"] });
      }
      refresh();
    };
    run();
    window.addEventListener("online", run);
    const iv = setInterval(run, 60_000);
    return () => { window.removeEventListener("online", run); clearInterval(iv); };
  }, [qc]);

  // Keyboard: F2 scan, F4 hold, F8 pay
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "F2") { e.preventDefault(); setScanOpen(true); }
      else if (e.key === "F4") { e.preventDefault(); holdBill(); }
      else if (e.key === "F8") { e.preventDefault(); if (cart.length) setPaymentOpen(true); }
      else if (e.key === "/" && document.activeElement?.tagName !== "INPUT") {
        e.preventDefault(); searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [cart, holdBill]);

  return (
    <div className="h-[calc(100vh-3.5rem)] lg:h-screen flex flex-col">
      <div className="px-4 lg:px-6 py-3 border-b bg-surface flex items-center justify-between gap-3 flex-wrap">
        <div>
          <div className="text-lg font-semibold tracking-tight flex items-center gap-2">
            <ShoppingCart className="size-5 text-primary" /> Billing
          </div>
          <div className="text-xs text-muted-foreground">F2 scan · F4 hold · F8 pay · / search</div>
        </div>
        <div className="flex gap-2 items-center">
          {pending > 0 && (
            <button
              onClick={async () => { const n = await syncOfflineSales(); setPending(pendingCount()); toast[n ? "success" : "info"](n ? `${n} bill(s) synced` : "Still offline"); }}
              className="text-xs px-2.5 py-1.5 rounded-md bg-warning/15 text-warning font-medium"
            >
              {pending} bill(s) pending sync
            </button>
          )}
          <Button variant="outline" onClick={() => setRecallOpen(true)}>
            <Play className="size-4" /> Recall {heldQ.data?.length ? `(${heldQ.data.length})` : ""}
          </Button>
          <Button variant="outline" onClick={holdBill} disabled={!cart.length}>
            <Pause className="size-4" /> Hold
          </Button>
        </div>
      </div>


      <div className="flex-1 grid lg:grid-cols-[1fr_420px] min-h-0">
        {/* Left: search + cart */}
        <div className="flex flex-col min-h-0 border-r">
          <div className="p-4 border-b space-y-3 bg-background">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  ref={searchRef}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search product by name, brand or barcode…"
                  className="h-11 pl-9"
                  autoFocus
                />
              </div>
              <Button onClick={() => setScanOpen(true)} className="h-11">
                <CameraIcon className="size-4" /> Scan
              </Button>
            </div>
            {search && (
              <div className="rounded-md border bg-card max-h-64 overflow-auto">
                {searchResults.length === 0 ? (
                  <div className="p-3 text-sm text-muted-foreground">No matches.</div>
                ) : (
                  searchResults.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => { addProduct(p); setSearch(""); searchRef.current?.focus(); }}
                      className="w-full px-3 py-2 flex items-center justify-between text-left hover:bg-accent text-sm border-b last:border-0"
                    >
                      <div className="min-w-0">
                        <div className="font-medium truncate">{p.name}</div>
                        <div className="text-xs text-muted-foreground truncate">
                          {p.brand ?? "—"} · stock {Number(p.stock_qty)} {p.unit}
                        </div>
                      </div>
                      <div className="font-semibold tabular-nums">{inr(p.selling_price)}</div>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>

          <div className="flex-1 overflow-auto p-4">
            {cart.length === 0 ? (
              <div className="h-full grid place-items-center text-center text-muted-foreground">
                <div>
                  <ShoppingCart className="size-12 mx-auto mb-3 opacity-30" />
                  <div className="font-medium">Cart is empty</div>
                  <div className="text-sm">Scan a barcode or search a product to begin.</div>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                {cart.map((l, i) => (
                  <Card key={i} className="p-3">
                    <div className="flex items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate">{l.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {inr(l.unit_price)}{l.sold_by === "weight" ? "/kg" : ""} {l.tax_pct > 0 ? `· GST ${l.tax_pct}%` : ""}
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button size="icon" variant="outline" className="size-8" onClick={() => updateLine(i, { qty: Math.max(l.sold_by === "weight" ? 0.001 : 1, l.qty - (l.sold_by === "weight" ? 0.1 : 1)) })}>
                          <Minus className="size-3" />
                        </Button>
                        <div className="relative">
                          <Input
                            type="number" min={0} step={l.sold_by === "weight" ? 0.001 : 1} value={l.qty}
                            onChange={(e) => updateLine(i, { qty: Math.max(0, Number(e.target.value) || 0) })}
                            className="w-20 h-8 text-center pr-6"
                          />
                          {l.sold_by === "weight" && <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">kg</span>}
                        </div>
                        <Button size="icon" variant="outline" className="size-8" onClick={() => updateLine(i, { qty: l.qty + (l.sold_by === "weight" ? 0.1 : 1) })}>
                          <Plus className="size-3" />
                        </Button>
                      </div>
                      <div className="w-24 text-right">
                        <div className="font-semibold tabular-nums">{inr(l.unit_price * l.qty - l.discount)}</div>
                        <Input
                          type="number" min={0} value={l.discount || ""}
                          onChange={(e) => updateLine(i, { discount: Math.max(0, Number(e.target.value) || 0) })}
                          placeholder="disc"
                          className="h-7 text-xs text-right mt-1"
                        />
                      </div>
                      <Button size="icon" variant="ghost" className="size-8 text-destructive" onClick={() => removeLine(i)}>
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right: summary */}
        <aside className="flex flex-col bg-surface">
          <div className="p-4 border-b space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Customer</Label>
                <Input value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Name (optional)" className="h-9" />
              </div>
              <div>
                <Label className="text-xs">Phone</Label>
                <Input value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} placeholder="Optional" className="h-9" />
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-auto p-4 space-y-2 text-sm">
            <Row label="Subtotal" value={inr(totals.subtotal)} />
            <Row label="Item discount" value={`- ${inr(totals.lineDisc)}`} muted />
            <Row label="GST" value={inr(totals.taxTotal)} muted />
            <div className="flex items-center justify-between gap-2">
              <Label className="text-xs">Bill discount (₹)</Label>
              <Input
                type="number" min={0} value={billDiscount || ""}
                onChange={(e) => setBillDiscount(Math.max(0, Number(e.target.value) || 0))}
                className="w-28 h-9 text-right"
              />
            </div>
          </div>

          <div className="p-4 border-t space-y-3 bg-background">
            <div className="flex items-center justify-between">
              <div className="text-sm text-muted-foreground">Grand total</div>
              <div className="text-3xl font-semibold tabular-nums">{inr(totals.grand)}</div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" onClick={clearCart} disabled={!cart.length}>Clear</Button>
              <Button className="h-11 text-base" disabled={!cart.length} onClick={() => setPaymentOpen(true)}>
                <IndianRupee className="size-4" /> Pay
              </Button>
            </div>
          </div>
        </aside>
      </div>

      {/* Scanner */}
      <Dialog open={scanOpen} onOpenChange={setScanOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Scan barcode</DialogTitle></DialogHeader>
          <ScannerPanel
            active={scanOpen}
            continuous
            onCameraError={() => setScanOpen(false)}
            onScan={(code) => handleScan(code)}
          />
          <DialogFooter><Button variant="outline" onClick={() => setScanOpen(false)}>Done</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Recall */}
      <Dialog open={recallOpen} onOpenChange={setRecallOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Recall held bills</DialogTitle></DialogHeader>
          {!heldQ.data?.length ? (
            <div className="py-8 text-center text-muted-foreground text-sm">No held bills.</div>
          ) : (
            <div className="divide-y max-h-96 overflow-auto -mx-6">
              {(heldQ.data as HeldBill[]).map((h) => {
                const lines = (h.cart as unknown as CartLine[]) ?? [];
                const total = lines.reduce((s, l) => s + l.unit_price * l.qty - l.discount, 0);
                return (
                  <button key={h.id} onClick={() => recallBill(h.id)} className="w-full px-6 py-3 text-left hover:bg-accent flex items-center justify-between">
                    <div>
                      <div className="font-medium">{h.label}</div>
                      <div className="text-xs text-muted-foreground">{lines.length} items · {new Date(h.created_at).toLocaleTimeString()}</div>
                    </div>
                    <div className="font-semibold tabular-nums">{inr(total)}</div>
                  </button>
                );
              })}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Payment */}
      <PaymentDialog
        open={paymentOpen}
        onClose={() => setPaymentOpen(false)}
        totals={totals}
        cart={cart}
        customerName={customerName}
        customerPhone={customerPhone}
        onCompleted={(billNo, phone, total) => {
          setShareInfo({ billNo, phone, total });
          clearCart();
          qc.invalidateQueries({ queryKey: ["billing-products"] });
        }}
      />
      <ShareBillDialog info={shareInfo} onClose={() => setShareInfo(null)} />
    </div>
  );
}

function Row({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className={`flex items-center justify-between ${muted ? "text-muted-foreground" : ""}`}>
      <span>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}

function PaymentDialog({
  open, onClose, totals, cart, customerName, customerPhone, onCompleted,
}: {
  open: boolean; onClose: () => void;
  totals: { subtotal: number; lineDisc: number; taxTotal: number; billDisc: number; grand: number };
  cart: CartLine[]; customerName: string; customerPhone: string;
  onCompleted: (billNo: string, phone: string, total: number) => void;
}) {
  const { data: shop } = useShopSettings();
  const [mode, setMode] = useState("cash");
  const [paid, setPaid] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [upiQr, setUpiQr] = useState<string | null>(null);
  // Split / credit
  const [sCash, setSCash] = useState(""); const [sCard, setSCard] = useState("");
  const [sUpi, setSUpi] = useState(""); const [sCredit, setSCredit] = useState("");

  useEffect(() => {
    if (!open) {
      setMode("cash"); setPaid(""); setUpiQr(null);
      setSCash(""); setSCard(""); setSUpi(""); setSCredit("");
    } else setPaid(totals.grand.toFixed(2));
  }, [open, totals.grand]);

  useEffect(() => {
    if (mode === "upi" || mode === "qr" || mode === "split") {
      const pa = shop?.upi_id || "merchant@upi";
      const pn = encodeURIComponent(shop?.shop_name || "Supermarket");
      const amt = mode === "split" ? Number(sUpi || 0) : totals.grand;
      if (amt <= 0) { setUpiQr(null); return; }
      const upi = `upi://pay?pa=${pa}&pn=${pn}&am=${amt.toFixed(2)}&cu=INR&tn=Bill`;
      QRCode.toDataURL(upi, { width: 220, margin: 1 }).then(setUpiQr).catch(() => setUpiQr(null));
    } else setUpiQr(null);
  }, [mode, totals.grand, sUpi, shop?.upi_id, shop?.shop_name]);

  const splitCash = Number(sCash) || 0, splitCard = Number(sCard) || 0;
  const splitUpi = Number(sUpi) || 0, splitCredit = Number(sCredit) || 0;
  const splitPaid = splitCash + splitCard + splitUpi;
  const splitCovered = splitPaid + splitCredit;
  const splitRemaining = Math.round((totals.grand - splitCovered) * 100) / 100;

  const paidNum = Number(paid) || 0;
  const change = mode === "split"
    ? Math.max(0, splitCovered - totals.grand)
    : Math.max(0, paidNum - totals.grand);
  const insufficient = mode === "split"
    ? splitRemaining > 0.01 || (splitCredit > 0 && !customerName.trim() && !customerPhone.trim())
    : mode === "cash" && paidNum < totals.grand;

  const complete = async () => {
    setLoading(true);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const uid = sess.session?.user.id;
      if (!uid) throw new Error("Not signed in");

      const split = mode === "split"
        ? { amount_cash: splitCash, amount_card: splitCard, amount_upi: splitUpi, amount_other: 0, credit_amount: splitCredit, paid_amount: splitPaid }
        : {
            amount_cash: mode === "cash" ? Math.min(paidNum, totals.grand) : 0,
            amount_card: mode === "card" ? totals.grand : 0,
            amount_upi: mode === "upi" || mode === "qr" ? totals.grand : 0,
            amount_other: 0,
            credit_amount: 0,
            paid_amount: paidNum,
          };

      const saleBase = {
        cashier_id: uid,
        customer_name: customerName || null,
        customer_phone: customerPhone || null,
        subtotal: totals.subtotal,
        tax_total: totals.taxTotal,
        line_discount: totals.lineDisc,
        bill_discount: totals.billDisc,
        grand_total: totals.grand,
        payment_mode: mode,
        change_amount: change,
        status: mode === "split" && splitCredit > 0 ? "credit" : "completed",
        ...split,
      };
      const itemRows = cart.map((l) => ({
        product_id: l.product_id,
        name: l.name,
        qty: l.qty,
        unit_price: l.unit_price,
        tax_pct: l.tax_pct,
        line_discount: l.discount,
        line_total: l.unit_price * l.qty - l.discount,
      }));

      let bill_no = "";
      let created_at = new Date().toISOString();
      let offline = typeof navigator !== "undefined" && !navigator.onLine;

      if (!offline) {
        try {
          const { data: billNoRes, error: billErr } = await supabase.rpc("next_bill_no");
          if (billErr) throw billErr;
          bill_no = billNoRes as unknown as string;
          const { data: saleRow, error: saleErr } = await supabase
            .from("sales")
            .insert({ bill_no, client_uid: makeClientUid(), ...saleBase } as never)
            .select("id,created_at")
            .single();
          if (saleErr) throw saleErr;
          created_at = saleRow.created_at;
          const { error: itemsErr } = await supabase
            .from("sale_items")
            .insert(itemRows.map((i) => ({ ...i, sale_id: saleRow.id })) as never);
          if (itemsErr) throw itemsErr;
        } catch {
          offline = true;
        }
      }

      if (offline) {
        bill_no = makeOfflineBillNo();
        queueSale({
          client_uid: makeClientUid(),
          bill_no, created_at, ...saleBase, items: itemRows,
        });
        adjustCachedStock(itemRows);
        toast.warning(`Saved offline as ${bill_no} — will sync automatically`);
      }

      const invoice_url = !offline && typeof window !== "undefined" ? `${window.location.origin}/i/${bill_no}` : undefined;
      await generateReceipt({
        bill_no, created_at,
        customer_name: customerName, customer_phone: customerPhone,
        payment_mode: mode === "split"
          ? `Split (cash ${splitCash} / card ${splitCard} / upi ${splitUpi}${splitCredit ? ` / credit ${splitCredit}` : ""})`
          : mode,
        paid_amount: mode === "split" ? splitPaid : paidNum,
        change_amount: change,
        items: cart.map((l) => ({
          name: l.name + (l.sold_by === "weight" ? ` (${l.qty.toFixed(3)}kg)` : ""),
          qty: l.qty, unit_price: l.unit_price, tax_pct: l.tax_pct,
          line_discount: l.discount, line_total: l.unit_price * l.qty - l.discount, mrp: l.mrp,
        })),
        subtotal: totals.subtotal, taxTotal: totals.taxTotal,
        lineDiscount: totals.lineDisc, billDisc: totals.billDisc, grand: totals.grand,
        invoice_url,
        shop: shop ? {
          shop_name: shop.shop_name, phone: shop.phone, address: shop.address,
          gst_number: shop.gst_number, upi_id: shop.upi_id, receipt_footer: shop.receipt_footer,
        } : undefined,
      });

      if (!offline) toast.success(`Bill ${bill_no} completed`);
      onCompleted(bill_no, customerPhone, totals.grand);
      onClose();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to complete");
    } finally {
      setLoading(false);
    }
  };

  const quickPaid = [totals.grand, Math.ceil(totals.grand / 100) * 100, Math.ceil(totals.grand / 500) * 500];

  return (
    <Dialog open={open} onOpenChange={(v) => !v && !loading && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Collect payment</DialogTitle>
          <DialogDescription>Total due <span className="font-semibold text-foreground">{inr(totals.grand)}</span></DialogDescription>
        </DialogHeader>

        <Tabs value={mode} onValueChange={setMode}>
          <TabsList className="grid grid-cols-5 w-full">
            {PAYMENT_MODES.map((m) => <TabsTrigger key={m.value} value={m.value}>{m.label}</TabsTrigger>)}
          </TabsList>

          <TabsContent value="cash" className="space-y-3 pt-4">
            <div>
              <Label>Cash received</Label>
              <Input type="number" value={paid} onChange={(e) => setPaid(e.target.value)} className="h-11 text-lg" />
            </div>
            <div className="flex gap-2 flex-wrap">
              {[...new Set(quickPaid)].map((v) => (
                <Button key={v} type="button" variant="outline" size="sm" onClick={() => setPaid(v.toFixed(2))}>{inr(v)}</Button>
              ))}
            </div>
            <div className="flex justify-between rounded-md bg-muted p-3">
              <span className="text-sm text-muted-foreground">Change</span>
              <span className="font-semibold tabular-nums">{inr(change)}</span>
            </div>
          </TabsContent>

          <TabsContent value="card" className="pt-4">
            <Select value="visa" onValueChange={() => {}}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="visa">Visa / Mastercard</SelectItem>
                <SelectItem value="rupay">RuPay</SelectItem>
                <SelectItem value="amex">Amex</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground mt-2">Swipe / tap on your POS terminal, then complete the bill.</p>
          </TabsContent>

          {(["upi", "qr"] as const).map((m) => (
            <TabsContent key={m} value={m} className="pt-4 text-center space-y-2">
              {upiQr ? <img src={upiQr} alt="UPI QR" className="mx-auto rounded-md border" /> : <div className="h-[220px] grid place-items-center"><QrCode className="size-12 text-muted-foreground" /></div>}
              <p className="text-sm font-medium">Pay {inr(totals.grand)} via UPI</p>
              <p className="text-xs text-muted-foreground">Scan with any UPI app</p>
            </TabsContent>
          ))}

          <TabsContent value="split" className="pt-4 space-y-3">
            <p className="text-xs text-muted-foreground">Split the bill across modes. Anything left as <b>Credit</b> is recorded as unpaid (khata) against the customer.</p>
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-xs">Cash</Label><Input type="number" value={sCash} onChange={(e) => setSCash(e.target.value)} placeholder="0" /></div>
              <div><Label className="text-xs">Card</Label><Input type="number" value={sCard} onChange={(e) => setSCard(e.target.value)} placeholder="0" /></div>
              <div><Label className="text-xs">UPI</Label><Input type="number" value={sUpi} onChange={(e) => setSUpi(e.target.value)} placeholder="0" /></div>
              <div><Label className="text-xs">Credit (unpaid)</Label><Input type="number" value={sCredit} onChange={(e) => setSCredit(e.target.value)} placeholder="0" /></div>
            </div>
            <div className="flex gap-2">
              <Button type="button" size="sm" variant="outline" onClick={() => setSCash(Math.max(0, splitRemaining + splitCash).toFixed(2))}>Rest to cash</Button>
              <Button type="button" size="sm" variant="outline" onClick={() => setSCredit(Math.max(0, splitRemaining + splitCredit).toFixed(2))}>Rest to credit</Button>
            </div>
            <div className={`flex justify-between rounded-md p-3 ${Math.abs(splitRemaining) < 0.01 ? "bg-muted" : "bg-warning/15 text-warning"}`}>
              <span className="text-sm">{splitRemaining > 0 ? "Still to allocate" : splitRemaining < 0 ? "Change to return" : "Fully allocated"}</span>
              <span className="font-semibold tabular-nums">{inr(Math.abs(splitRemaining))}</span>
            </div>
            {splitCredit > 0 && !customerName.trim() && !customerPhone.trim() && (
              <p className="text-xs text-destructive">Add a customer name or phone before recording credit.</p>
            )}
            {splitUpi > 0 && upiQr && <img src={upiQr} alt="UPI QR" className="mx-auto rounded-md border" />}
          </TabsContent>
        </Tabs>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={loading}>Cancel</Button>
          <Button onClick={complete} disabled={loading || insufficient} className="min-w-32">
            {loading ? <Loader2 className="size-4 animate-spin" /> : <Printer className="size-4" />}
            Complete & print
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


function ShareBillDialog({ info, onClose }: { info: { billNo: string; phone: string; total: number } | null; onClose: () => void }) {
  const url = info && typeof window !== "undefined" ? `${window.location.origin}/i/${info.billNo}` : "";
  const msg = info ? `Your bill ${info.billNo} for ${inr(info.total)} — view: ${url}` : "";
  const waNumber = info?.phone?.replace(/\D/g, "") ?? "";
  const waLink = `https://wa.me/${waNumber}?text=${encodeURIComponent(msg)}`;
  return (
    <Dialog open={!!info} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Share bill with customer</DialogTitle>
          <DialogDescription>Bill <b>{info?.billNo}</b> · {info ? inr(info.total) : ""}</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <div className="rounded-md border p-2 text-xs font-mono break-all bg-muted">{url}</div>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" onClick={() => { navigator.clipboard?.writeText(url); toast.success("Link copied"); }}>
              <Copy className="size-4" /> Copy link
            </Button>
            <Button
              variant="outline"
              disabled={!waNumber}
              onClick={() => window.open(waLink, "_blank", "noopener")}
              title={waNumber ? "Share via WhatsApp" : "Add a customer phone first"}
            >
              <MessageCircle className="size-4" /> WhatsApp
            </Button>
            <Button
              variant="outline"
              className="col-span-2"
              onClick={async () => {
                if (navigator.share) {
                  try { await navigator.share({ title: `Bill ${info?.billNo}`, text: msg, url }); }
                  catch { /* user cancelled */ }
                } else { navigator.clipboard?.writeText(url); toast.success("Link copied"); }
              }}
            >
              <Share2 className="size-4" /> Share…
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">SMS gateway can be wired up later; use WhatsApp or share-sheet for now.</p>
        </div>
        <DialogFooter>
          <Button onClick={onClose}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
