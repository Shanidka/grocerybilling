export type CreditBill = { id: string; created_at: string; credit_amount: number | string };

export function creditAging(bills: CreditBill[], collected: number, days = 30, now = new Date()) {
  let remainingCollection = Math.max(0, collected);
  let overdue = 0;
  let oldestUnpaid: string | null = null;
  const ordered = [...bills].sort((a, b) => a.created_at.localeCompare(b.created_at));
  for (const bill of ordered) {
    const credit = Math.max(0, Number(bill.credit_amount));
    const applied = Math.min(credit, remainingCollection);
    remainingCollection -= applied;
    const unpaid = credit - applied;
    if (unpaid <= 0.01) continue;
    if (!oldestUnpaid) oldestUnpaid = bill.created_at;
    if (now.getTime() > new Date(bill.created_at).getTime() + days * 86400000) overdue += unpaid;
  }
  return { overdue: Math.round(overdue * 100) / 100, oldestUnpaid };
}

export function creditAvailable(limit: number | null, outstanding: number) {
  return limit === null ? null : Math.max(0, limit - outstanding);
}

export function cashExpected(opening: number, cashSales: number, cashCollections: number, cashExpenses: number, payouts: number) {
  return Math.round((opening + cashSales + cashCollections - cashExpenses - payouts) * 100) / 100;
}