// @ts-ignore bun built-in test runner (run: bun test ./src/lib/bill-rules.test.ts)
import { expect, test } from "bun:test";
import { waNumber } from "./bill-folder";
import { periodKey } from "./price-periods";
import { cashTender } from "./cash-tender";

test("10-digit Indian mobile gets 91 prefix for WhatsApp", () => {
  expect(waNumber("98765 43210")).toBe("919876543210");
});
test("leading zero is dropped", () => {
  expect(waNumber("09876543210")).toBe("919876543210");
});
test("too-short number is rejected", () => {
  expect(waNumber("12345")).toBeNull();
});
test("weekly period uses ISO week", () => {
  expect(periodKey(new Date(2026, 9, 16), "week")).toBe("2026-W42");
});
test("quick cash adds Rs.100 to the amount due", () => {
  expect(cashTender(87.5, 87.5, 100)).toBe(187.5);
});
test("quick cash adds Rs.200 to the current tender", () => {
  expect(cashTender(87.5, 187.5, 200)).toBe(387.5);
});
test("quick cash adds Rs.500 without starting below the due amount", () => {
  expect(cashTender(87.5, 0, 500)).toBe(587.5);
});
