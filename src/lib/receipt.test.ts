// @ts-ignore bun built-in test runner
import { expect, test } from "bun:test";
import { generateReceipt, type ReceiptInput } from "./receipt";

const receipt: ReceiptInput = {
  bill_no: "TEST", created_at: "2026-10-18T19:52:00Z", payment_mode: "cash",
  paid_amount: 100, change_amount: 0, items: [], subtotal: 100,
  taxTotal: 0, lineDiscount: 0, billDisc: 0, grand: 100,
  invoice_url: "https://example.com/i/TEST", shop: { shop_name: "Test shop" },
};
test("receipt without UPI has no online invoice QR", async () => {
  const blob = await generateReceipt(receipt, "blob");
  if (!blob) throw new Error("Missing PDF");
  expect(await blob.text()).not.toContain("/Subtype /Image");
});
test("receipt retains UPI payment QR", async () => {
  const blob = await generateReceipt({ ...receipt, shop: { shop_name: "Test shop", upi_id: "test@upi" } }, "blob");
  if (!blob) throw new Error("Missing PDF");
  expect(await blob.text()).toContain("/Subtype /Image");
});