// @ts-ignore bun built-in test runner (run: bun test ./src/lib/purchase-rules.test.ts)
import { calcTaxAmount, purchaseLineTotal } from "./purchase-tax";

describe("purchase tax", () => {
  it("tax amount = qty x cost x tax%", () => {
    expect(calcTaxAmount(10, 50, 5)).toBe(25);
    expect(calcTaxAmount(3, 120, 12)).toBe(43.2);
    expect(calcTaxAmount(1, 100, 0)).toBe(0);
  });

  it("line total = purchase price + purchase tax amount", () => {
    expect(purchaseLineTotal(10, 50, 25)).toBe(525);
  });

  it("entry total is the sum of line totals", () => {
    const l1 = purchaseLineTotal(10, 50, calcTaxAmount(10, 50, 5)); // 525
    const l2 = purchaseLineTotal(2, 200, calcTaxAmount(2, 200, 12)); // 448
    expect(l1 + l2).toBe(973);
  });
});
