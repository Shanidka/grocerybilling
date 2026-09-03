import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useStoreId } from "@/lib/active-store";

/* ---------------- date ranges ---------------- */

export type Preset =
  | "today" | "yday" | "7d" | "thisweek" | "mtd" | "lastmonth" | "qtd" | "ytd" | "lastyear" | "all" | "custom";

export const PRESET_LABELS: Record<Preset, string> = {
  today: "Today", yday: "Yesterday", "7d": "Last 7 days", thisweek: "This week",
  mtd: "This month", lastmonth: "Last month", qtd: "This quarter", ytd: "This year",
  lastyear: "Last year", all: "Lifetime", custom: "Custom",
};

export type Range = { start: Date; end: Date };

export function rangeFor(preset: Preset, from?: string, to?: string): Range {
  const end = new Date(); end.setHours(23, 59, 59, 999);
  const start = new Date(); start.setHours(0, 0, 0, 0);
  switch (preset) {
    case "yday": start.setDate(start.getDate() - 1); end.setTime(start.getTime()); end.setHours(23, 59, 59, 999); break;
    case "7d": start.setDate(start.getDate() - 6); break;
    case "thisweek": { const dow = (start.getDay() + 6) % 7; start.setDate(start.getDate() - dow); break; }
    case "mtd": start.setDate(1); break;
    case "lastmonth": {
      start.setDate(1); start.setMonth(start.getMonth() - 1);
      const e = new Date(start.getFullYear(), start.getMonth() + 1, 0, 23, 59, 59, 999);
      return { start, end: e };
    }
    case "qtd": { start.setMonth(Math.floor(start.getMonth() / 3) * 3); start.setDate(1); break; }
    case "ytd": start.setMonth(0), start.setDate(1); break;
    case "lastyear": {
      const y = start.getFullYear() - 1;
      return { start: new Date(y, 0, 1, 0, 0, 0, 0), end: new Date(y, 11, 31, 23, 59, 59, 999) };
    }
    case "all": start.setFullYear(2000, 0, 1); break;
    case "custom":
      if (from && to) return { start: new Date(from + "T00:00:00"), end: new Date(to + "T23:59:59.999") };
      break;
  }
  return { start, end };
}

/** The equivalent immediately-preceding period, used for growth comparison. */
export function previousRange(r: Range): Range {
  const span = r.end.getTime() - r.start.getTime();
  return { start: new Date(r.start.getTime() - span - 1), end: new Date(r.start.getTime() - 1) };
}

export const pct = (a: number, b: number) => (b > 0 ? ((a - b) / b) * 100 : 0);

/* ---------------- data hooks ---------------- */

export type SaleItem = {
  product_id: string | null; name: string; qty: number | string;
  unit_price: number | string; line_total: number | string;
  line_discount: number | string; tax_pct: number | string; cost_at_sale: number | string;
};

export type Sale = {
  id: string; bill_no: string; created_at: string; cashier_id: string; status: string;
  customer_name: string | null; customer_phone: string | null; payment_mode: string;
  subtotal: number | string; tax_total: number | string;
  line_discount: number | string; bill_discount: number | string; grand_total: number | string;
  amount_cash: number | string; amount_card: number | string; amount_upi: number | string;
  amount_other: number | string; credit_amount: number | string;
  sale_items: SaleItem[];
};

const SALE_COLS =
  "id,bill_no,created_at,cashier_id,status,customer_name,customer_phone,payment_mode,subtotal,tax_total,line_discount,bill_discount,grand_total,amount_cash,amount_card,amount_upi,amount_other,credit_amount," +
  "sale_items(product_id,name,qty,unit_price,line_total,line_discount,tax_pct,cost_at_sale)";

export function useSales(range: Range) {
  const storeId = useStoreId();
  return useQuery({
    queryKey: ["an-sales", storeId, range.start.toISOString(), range.end.toISOString()],
    queryFn: async (): Promise<Sale[]> => {
      const { data, error } = await supabase.from("sales").select(SALE_COLS)
        .eq("store_id", storeId)
        .gte("created_at", range.start.toISOString()).lte("created_at", range.end.toISOString())
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as Sale[];
    },
  });
}

export type Prod = {
  id: string; name: string; barcode: string | null; brand: string | null; unit: string;
  category_id: string | null; purchase_price: number | string; selling_price: number | string;
  mrp: number | string; margin_pct: number | string; stock_qty: number | string;
  min_qty: number | string; expiry_date: string | null; last_sold_at: string | null; is_active: boolean;
  categories?: { name: string } | null;
};

export function useProducts() {
  const storeId = useStoreId();
  return useQuery({
    queryKey: ["an-products", storeId],
    queryFn: async (): Promise<Prod[]> => {
      const { data, error } = await supabase.from("products")
        .select("id,name,barcode,brand,unit,category_id,purchase_price,selling_price,mrp,margin_pct,stock_qty,min_qty,expiry_date,last_sold_at,is_active,categories(name)")
        .eq("store_id", storeId);
      if (error) throw error;
      return (data ?? []) as unknown as Prod[];
    },
    staleTime: 60_000,
  });
}

export type Expense = { id: string; category: string; amount: number | string; spent_on: string; payment_mode: string; payee: string | null; notes: string | null };

export function useExpenses(range: Range) {
  const storeId = useStoreId();
  return useQuery({
    queryKey: ["an-exp", storeId, range.start.toISOString(), range.end.toISOString()],
    queryFn: async (): Promise<Expense[]> => {
      const { data, error } = await supabase.from("expenses")
        .select("id,category,amount,spent_on,payment_mode,payee,notes")
        .eq("store_id", storeId)
        .gte("spent_on", ymd(range.start)).lte("spent_on", ymd(range.end));
      if (error) throw error;
      return (data ?? []) as unknown as Expense[];
    },
  });
}

export type ReturnRow = {
  id: string; product_id: string; qty: number | string; refund_amount: number | string;
  reason: string | null; created_at: string; created_by: string; sale_id: string | null;
};

export function useReturns(range: Range) {
  return useQuery({
    queryKey: ["an-ret", range.start.toISOString(), range.end.toISOString()],
    queryFn: async (): Promise<ReturnRow[]> => {
      const { data, error } = await supabase.from("product_returns")
        .select("id,product_id,qty,refund_amount,reason,created_at,created_by,sale_id")
        .gte("created_at", range.start.toISOString()).lte("created_at", range.end.toISOString());
      if (error) throw error;
      return (data ?? []) as unknown as ReturnRow[];
    },
  });
}

export function usePurchases(range: Range) {
  const storeId = useStoreId();
  return useQuery({
    queryKey: ["an-pur", storeId, range.start.toISOString(), range.end.toISOString()],
    queryFn: async () => {
      const { data, error } = await supabase.from("purchase_entries")
        .select("id,supplier,total,created_at,purchase_items(name,product_id,qty,cost,line_total)")
        .eq("store_id", storeId)
        .gte("created_at", range.start.toISOString()).lte("created_at", range.end.toISOString());
      if (error) throw error;
      return (data ?? []) as unknown as Array<{
        id: string; supplier: string | null; total: number | string; created_at: string;
        purchase_items: Array<{ name: string; product_id: string | null; qty: number | string; cost: number | string; line_total: number | string }>;
      }>;
    },
  });
}

export function useDamages(range: Range) {
  return useQuery({
    queryKey: ["an-dam", range.start.toISOString(), range.end.toISOString()],
    queryFn: async () => {
      const { data, error } = await supabase.from("damaged_products")
        .select("id,product_id,qty,loss_value,reason,created_at")
        .gte("created_at", range.start.toISOString()).lte("created_at", range.end.toISOString());
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useStaffNames() {
  return useQuery({
    queryKey: ["an-staff"],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("id,full_name");
      if (error) throw error;
      return new Map((data ?? []).map((p) => [p.id, p.full_name ?? "Unknown"]));
    },
    staleTime: 5 * 60_000,
  });
}

/* ---------------- costing ---------------- */

export type CostingMethod = "captured" | "average";
const COSTING_KEY = "bz_costing_method";

export function getCostingMethod(): CostingMethod {
  try { return (localStorage.getItem(COSTING_KEY) as CostingMethod) || "captured"; } catch { return "captured"; }
}
export function setCostingMethod(m: CostingMethod) {
  try { localStorage.setItem(COSTING_KEY, m); } catch { /* ignore */ }
}

/** Unit cost resolver: historical cost captured at billing time, else current purchase price. */
export function makeCostOf(products: Prod[] | undefined, method: CostingMethod = "captured") {
  const map = new Map((products ?? []).map((p) => [p.id, Number(p.purchase_price) || 0]));
  return (it: { product_id: string | null; cost_at_sale?: number | string }) => {
    const current = it.product_id ? map.get(it.product_id) ?? 0 : 0;
    if (method === "average") return current;
    const captured = Number(it.cost_at_sale ?? 0);
    return captured > 0 ? captured : current;
  };
}

/* ---------------- P&L summary ---------------- */

export type Summary = {
  grossSales: number; discounts: number; returns: number; netSales: number;
  cogs: number; grossProfit: number; grossMargin: number;
  expenses: number; netProfit: number; netMargin: number;
  bills: number; items: number; avgBill: number; highBill: number; lowBill: number;
  cash: number; card: number; upi: number; other: number; credit: number;
};

export function summarize(
  sales: Sale[], costOf: (it: SaleItem) => number, expenseTotal: number, returnTotal: number,
): Summary {
  let grossSales = 0, discounts = 0, cogs = 0, items = 0;
  let cash = 0, card = 0, upi = 0, other = 0, credit = 0;
  let high = 0, low = Infinity;
  for (const s of sales) {
    const total = Number(s.grand_total);
    grossSales += total;
    discounts += Number(s.line_discount) + Number(s.bill_discount);
    cash += Number(s.amount_cash); card += Number(s.amount_card); upi += Number(s.amount_upi);
    other += Number(s.amount_other); credit += Number(s.credit_amount);
    high = Math.max(high, total); low = Math.min(low, total);
    for (const it of s.sale_items ?? []) {
      items += Number(it.qty);
      cogs += costOf(it) * Number(it.qty);
    }
  }
  const netSales = grossSales - returnTotal;
  const grossProfit = netSales - cogs;
  const netProfit = grossProfit - expenseTotal;
  return {
    grossSales, discounts, returns: returnTotal, netSales, cogs, grossProfit,
    grossMargin: netSales > 0 ? (grossProfit / netSales) * 100 : 0,
    expenses: expenseTotal, netProfit,
    netMargin: netSales > 0 ? (netProfit / netSales) * 100 : 0,
    bills: sales.length, items,
    avgBill: sales.length ? grossSales / sales.length : 0,
    highBill: high, lowBill: low === Infinity ? 0 : low,
    cash, card, upi, other, credit,
  };
}

export const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export const PALETTE = ["#4f46e5", "#0ea5e9", "#10b981", "#f59e0b", "#ef4444", "#ec4899", "#8b5cf6", "#14b8a6", "#f97316", "#84cc16"];

/* ---------------- export helpers ---------------- */

export function downloadCSV(filename: string, header: string[], rows: (string | number)[][]) {
  const csv = [header, ...rows]
    .map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))
    .join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}
