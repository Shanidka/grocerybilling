import { supabase } from "@/integrations/supabase/client";

export type QueuedSaleItem = {
  product_id: string | null;
  name: string;
  qty: number;
  unit_price: number;
  tax_pct: number;
  line_discount: number;
  line_total: number;
};

export type QueuedSale = {
  client_uid: string;
  bill_no: string;
  created_at: string;
  cashier_id: string;
  customer_name: string | null;
  customer_phone: string | null;
  subtotal: number;
  tax_total: number;
  line_discount: number;
  bill_discount: number;
  grand_total: number;
  payment_mode: string;
  paid_amount: number;
  change_amount: number;
  amount_cash: number;
  amount_card: number;
  amount_upi: number;
  amount_other: number;
  credit_amount: number;
  status: string;
  items: QueuedSaleItem[];
};

const KEY = "bz_offline_sales";

export function readQueue(): QueuedSale[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as QueuedSale[]) : [];
  } catch {
    return [];
  }
}

function writeQueue(q: QueuedSale[]) {
  try { localStorage.setItem(KEY, JSON.stringify(q)); } catch { /* quota */ }
}

export function queueSale(sale: QueuedSale) {
  writeQueue([...readQueue(), sale]);
}

export function pendingCount(): number {
  return readQueue().length;
}

export function makeClientUid(): string {
  const rnd = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return rnd;
}

/** Offline bill number — stays stable after sync so printed receipts always match. */
export function makeOfflineBillNo(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  const seq = Math.floor(Math.random() * 9000 + 1000);
  return `OFF${String(d.getFullYear()).slice(2)}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${seq}`;
}

/** Locally adjust the cached product stock so offline billing keeps sane stock numbers. */
export function adjustCachedStock(lines: Array<{ product_id: string | null; qty: number }>) {
  try {
    const raw = localStorage.getItem("bz_products");
    if (!raw) return;
    const list = JSON.parse(raw) as Array<{ id: string; stock_qty: number }>;
    for (const l of lines) {
      if (!l.product_id) continue;
      const p = list.find((x) => x.id === l.product_id);
      if (p) p.stock_qty = Number(p.stock_qty) - l.qty;
    }
    localStorage.setItem("bz_products", JSON.stringify(list));
  } catch { /* ignore */ }
}

async function pushSale(s: QueuedSale): Promise<boolean> {
  const { items, ...sale } = s;
  const { data, error } = await supabase
    .from("sales")
    .insert(sale as never)
    .select("id")
    .single();
  if (error) {
    // 23505 = already synced from another attempt/device → treat as done
    if ((error as { code?: string }).code === "23505") return true;
    return false;
  }
  const { error: e2 } = await supabase
    .from("sale_items")
    .insert(items.map((i) => ({ ...i, sale_id: data.id })) as never);
  if (e2) return false;
  return true;
}

let syncing = false;

/** Push every queued offline bill. Returns number synced. */
export async function syncOfflineSales(): Promise<number> {
  if (syncing) return 0;
  if (typeof navigator !== "undefined" && !navigator.onLine) return 0;
  const queue = readQueue();
  if (!queue.length) return 0;
  syncing = true;
  let synced = 0;
  const remaining: QueuedSale[] = [];
  try {
    for (const s of queue) {
      const ok = await pushSale(s);
      if (ok) synced++;
      else remaining.push(s);
    }
    writeQueue(remaining);
  } finally {
    syncing = false;
  }
  return synced;
}
