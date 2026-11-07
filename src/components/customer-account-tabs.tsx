import { useMemo, useState } from "react";
import { useCustomerAccount, type Customer } from "@/lib/customers";
import { buildLedger, ledgerOutstanding, statementMessage } from "@/lib/customer-ledger";
import { waPhone } from "@/lib/po-share";
import { reprintSale } from "@/lib/reprint";
import { useShopSettings } from "@/lib/shop-settings";
import { useActiveStore } from "@/lib/active-store";
import { inr, dt } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { ChevronDown, Loader2, MessageCircle, Printer } from "lucide-react";
import { toast } from "sonner";

export function CustomerBillsTab({ customer }: { customer: Customer }) {
  const acc = useCustomerAccount(customer);
  const [openId, setOpenId] = useState<string | null>(null);
  const [printing, setPrinting] = useState<string | null>(null);
  if (acc.isLoading) return <Loader2 className="size-4 animate-spin" />;
  if (acc.error) return <p className="text-sm text-destructive">Unable to load bills.</p>;
  const sales = acc.data?.sales ?? [];
  if (!sales.length) return <p className="text-sm text-muted-foreground">No bills for this customer yet.</p>;
  return (
    <div className="divide-y border rounded-md">
      {sales.map((s) => (
        <div key={s.id}>
          <div className="flex items-center gap-2 px-3 py-2">
            <button type="button" className="flex-1 min-w-0 text-left flex items-center gap-2" onClick={() => setOpenId(openId === s.id ? null : s.id)} aria-expanded={openId === s.id}>
              <ChevronDown className={`size-4 shrink-0 transition-transform ${openId === s.id ? "" : "-rotate-90"}`} />
              <div className="min-w-0">
                <div className="font-medium text-sm">{s.bill_no}</div>
                <div className="text-xs text-muted-foreground">{dt(s.created_at)} · <span className="uppercase">{s.payment_mode}</span>{Number(s.credit_amount) > 0 ? ` · credit ${inr(s.credit_amount)}` : ""}</div>
              </div>
            </button>
            <span className="font-semibold tabular-nums text-sm">{inr(s.grand_total)}</span>
            <Button size="icon" variant="ghost" title="Reprint bill" aria-label={`Reprint ${s.bill_no}`} disabled={printing === s.id} onClick={async () => {
              setPrinting(s.id);
              try { await reprintSale(s.id); } catch (e) { toast.error(e instanceof Error ? e.message : "Reprint failed"); } finally { setPrinting(null); }
            }}>{printing === s.id ? <Loader2 className="size-4 animate-spin" /> : <Printer className="size-4" />}</Button>
          </div>
          {openId === s.id && (
            <table className="w-full text-xs bg-muted/30">
              <tbody>
                {s.sale_items.map((i, idx) => (
                  <tr key={idx} className="border-t"><td className="px-9 py-1.5">{i.name}</td><td className="text-right tabular-nums">{Number(i.qty)} × {inr(i.unit_price)}</td><td className="px-3 text-right tabular-nums">{inr(i.line_total)}</td></tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ))}
    </div>
  );
}

export function CustomerLedgerTab({ customer }: { customer: Customer }) {
  const acc = useCustomerAccount(customer);
  const { data: shop } = useShopSettings();
  const { store } = useActiveStore();
  const shopName = store?.name || shop?.shop_name || "";
  const upiId = store?.upi_id || shop?.upi_id || null;
  const rows = useMemo(() => buildLedger(
    (acc.data?.sales ?? []).filter((s) => Number(s.credit_amount) > 0).map((s) => ({ date: s.created_at, label: `Bill ${s.bill_no}`, ref: s.bill_no, amount: Number(s.credit_amount) })),
    (acc.data?.collections ?? []).map((c) => ({ date: c.collected_at, label: `Paid (${c.payment_mode})`, ref: c.notes, amount: Number(c.amount) })),
  ), [acc.data]);
  if (acc.isLoading) return <Loader2 className="size-4 animate-spin" />;
  if (acc.error) return <p className="text-sm text-destructive">Unable to load khata.</p>;
  const outstanding = ledgerOutstanding(rows);
  const msg = statementMessage({ shopName, customerName: customer.name, rows, upiId });

  const share = () => {
    const n = waPhone(customer.phone);
    window.open(n ? `https://wa.me/${n}?text=${encodeURIComponent(msg)}` : `https://wa.me/?text=${encodeURIComponent(msg)}`, "_blank", "noopener");
  };
  const print = () => {
    const esc = (t: string) => t.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));
    const body = rows.map((r) => `<tr><td>${new Date(r.date).toLocaleDateString("en-IN")}</td><td>${esc(r.label)}</td><td class="r">${r.debit ? r.debit.toFixed(2) : ""}</td><td class="r">${r.credit ? r.credit.toFixed(2) : ""}</td><td class="r">${r.balance.toFixed(2)}</td></tr>`).join("");
    const html = `<!DOCTYPE html><html><head><title>Statement ${esc(customer.name)}</title><style>body{font-family:sans-serif;padding:20px;max-width:720px;margin:auto}table{width:100%;border-collapse:collapse;font-size:12px}td,th{border:1px solid #ccc;padding:5px}.r{text-align:right}@media print{button{display:none}}</style></head><body>
      <h2>${esc(shopName || "Store")} — Khata statement</h2><p>${esc(customer.name)}${customer.phone ? " · " + esc(customer.phone) : ""} · ${new Date().toLocaleDateString("en-IN")}</p>
      <table><thead><tr><th>Date</th><th>Details</th><th class="r">Debit (Rs.)</th><th class="r">Credit (Rs.)</th><th class="r">Balance (Rs.)</th></tr></thead><tbody>${body}</tbody></table>
      <h3>Outstanding: Rs.${outstanding.toFixed(2)}</h3><button onclick="window.print()">Print</button>
      <script>window.onload=()=>setTimeout(()=>window.print(),300)</script></body></html>`;
    const w = window.open("", "_blank", "width=800,height=900");
    if (!w) return toast.error("Popup blocked");
    w.document.write(html); w.document.close();
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div><div className="text-sm text-muted-foreground">Outstanding</div><div className="text-2xl font-semibold tabular-nums">{inr(outstanding)}</div></div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={print} disabled={!rows.length}><Printer className="size-4" /> Print statement</Button>
          <Button size="sm" onClick={share} disabled={!rows.length}><MessageCircle className="size-4" /> WhatsApp</Button>
        </div>
      </div>
      {!rows.length ? <p className="text-sm text-muted-foreground">No credit bills or payments yet.</p> : (
        <div className="overflow-x-auto border rounded-md">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs"><tr><th className="px-3 py-2">Date</th><th className="px-3 py-2">Details</th><th className="px-3 py-2 text-right">Debit</th><th className="px-3 py-2 text-right">Credit</th><th className="px-3 py-2 text-right">Balance</th></tr></thead>
            <tbody className="divide-y">
              {rows.map((r, i) => (
                <tr key={i}>
                  <td className="px-3 py-2 whitespace-nowrap">{new Date(r.date).toLocaleDateString("en-IN")}</td>
                  <td className="px-3 py-2">{r.label}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.debit ? inr(r.debit) : ""}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-primary">{r.credit ? inr(r.credit) : ""}</td>
                  <td className="px-3 py-2 text-right tabular-nums font-medium">{inr(r.balance)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
