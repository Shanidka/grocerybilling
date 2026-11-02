export function calcTaxAmount(qty: number, cost: number, taxPct: number): number {
  return Math.round(((Number(qty) || 0) * (Number(cost) || 0) * (Number(taxPct) || 0)) / 100 * 100) / 100;
}

/** Purchase line total: purchase price + purchase tax amount. */
export function purchaseLineTotal(qty: number, cost: number, taxAmount: number): number {
  return (Number(qty) || 0) * (Number(cost) || 0) + (Number(taxAmount) || 0);
}
