// @ts-ignore bun built-in test runner
import { expect, test } from "bun:test";
import { creditAging, creditAvailable, cashExpected } from "./credit-rules";

test("unconfigured credit limit stays unlimited", () => {
  expect(creditAvailable(null, 1000)).toBeNull();
  expect(creditAvailable(500, 300)).toBe(200);
  expect(creditAvailable(500, 600)).toBe(0);
});
test("credit collections settle oldest bills before calculating overdue", () => {
  const bills = [{ id: "old", created_at: "2026-09-01T00:00:00Z", credit_amount: 100 }, { id: "new", created_at: "2026-10-15T00:00:00Z", credit_amount: 100 }];
  expect(creditAging(bills, 40, 30, new Date("2026-10-19T00:00:00Z")).overdue).toBe(60);
  expect(creditAging(bills, 100, 30, new Date("2026-10-19T00:00:00Z")).overdue).toBe(0);
});
test("drawer includes cash collections and deducts cash expenses and payouts", () => {
  expect(cashExpected(500, 1200, 200, 100, 50)).toBe(1750);
});