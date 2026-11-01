// @ts-ignore bun built-in test runner
import { expect, test } from "bun:test";
import { loyaltyEligible, loyaltyReward, validateLoyaltySettings } from "./loyalty-rules";

test("only customers with a phone can join loyalty", () => {
  expect(loyaltyEligible(null)).toBe(false);
  expect(loyaltyEligible("   ")).toBe(false);
  expect(loyaltyEligible("abc")).toBe(false);
  expect(loyaltyEligible("98765 43210")).toBe(true);
});
test("10 loyalty points give Rs.1 at the existing rate", () => {
  expect(loyaltyReward(10, 0.1)).toBe(1);
  expect(loyaltyReward(125, 0.1)).toBe(12.5);
});
test("program rates must be positive finite numbers", () => {
  expect(validateLoyaltySettings(100, 10)).toBe(true);
  expect(validateLoyaltySettings(0, 10)).toBe(false);
  expect(validateLoyaltySettings(100, -1)).toBe(false);
  expect(validateLoyaltySettings(Infinity, 10)).toBe(false);
});