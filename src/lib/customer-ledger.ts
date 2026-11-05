/** Customer khata ledger: credit bills (debits) and collections (credits) with a running balance. */

export type LedgerEntry = { date: string; label: string; ref: string | null; amount: number };
export type LedgerRow = {
  date: string; kind: "bill" | "payment"; label: string; ref: string | null;
  debit: number; credit: number; balance: number;
};

/** Chronological statement; debits add, credits subtract. Amounts rounded to paise. */
export function buildLedger(debits: LedgerEntry[], credits: LedgerEntry[]): LedgerRow[] {
  const rows = [
    ...debits.map((e) => ({ ...e, kind: "bill" as const })),
    ...credits.map((e) => ({ ...e, kind: "payment" as const })),
  ].sort((a, b) => a.date.localeCompare(b.date) || a.kind.localeCompare(b.kind));
  let balance = 0;
  return rows.map((r) => {
    if (r.kind === "bill") balance += Number(r.amount);
    else balance -= Number(r.amount);
    balance = Math.round(balance * 100) / 100;
    return {
      date: r.date, kind: r.kind, label: r.label, ref: r.ref,
      debit: r.kind === "bill" ? Math.round(Number(r.amount) * 100) / 100 : 0,
      credit: r.kind === "payment" ? Math.round(Number(r.amount) * 100) / 100 : 0,
      balance,
    };
  });
}

export function ledgerOutstanding(rows: LedgerRow[]): number {
  return rows.length ? rows[rows.length - 1].balance : 0;
}

/** WhatsApp / print statement text. Rs. only (no ₹ glyph). */
export function statementMessage(opts: {
  shopName: string; customerName: string; rows: LedgerRow[]; upiId?: string | null; billViewUrl?: string;
}): string {
  const outstanding = ledgerOutstanding(opts.rows);
  const lines: string[] = [];
  lines.push(`*${opts.shopName || "Our store"}* — Khata statement`);
  lines.push(`Customer: ${opts.customerName}`);
  lines.push(`As of ${new Date().toLocaleDateString("en-IN")}`);
  lines.push("");
  for (const r of opts.rows) {
    const when = new Date(r.date).toLocaleDateString("en-IN");
    const amount = r.kind === "bill" ? `Billed Rs.${r.debit.toFixed(2)}` : `Paid Rs.${r.credit.toFixed(2)}`;
    lines.push(`${when} · ${r.label} · ${amount} · Balance Rs.${r.balance.toFixed(2)}`);
  }
  lines.push("");
  lines.push(`*Outstanding: Rs.${outstanding.toFixed(2)}*`);
  if (outstanding > 0 && opts.upiId) {
    const upi = `upi://pay?pa=${opts.upiId}&pn=${encodeURIComponent(opts.shopName || "Our store")}&am=${outstanding.toFixed(2)}&cu=INR`;
    lines.push(`Pay now: ${upi}`);
  }
  return lines.join("\n");
}
