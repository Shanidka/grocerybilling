// @ts-ignore bun built-in test runner (run: bun test ./src/lib/po-share.test.ts)
import { describe, expect, it } from "bun:test";
import { buildPoMessage, poEstimatedTotal, poWhatsAppUrl, waPhone } from "./po-share";

const po = {
  order_no: "PO-20261105-0001",
  created_at: "2026-11-05T07:00:00.000Z",
  supplier_name: "Sunrise Distributors",
  destination: "Main street branch",
  expected_at: "2026-11-06",
  notes: "Deliver before 10 AM",
  items: [
    { product_name: "Sunflower oil 1L", qty: 12, unit: "pcs", unit_cost: 140, weight_g: null },
    { product_name: "Basmati rice 5kg", qty: 5, unit: "bags", unit_cost: 480, weight_g: 5000 },
  ],
};

describe("PO WhatsApp share", () => {
  it("estimated total = sum of qty x cost", () => {
    expect(poEstimatedTotal(po)).toBe(12 * 140 + 5 * 480);
  });

  it("message header carries shop name, PO number and date, items carry pack/qty/price", () => {
    const msg = buildPoMessage(po, "Bazaar Supermarket");
    expect(msg).toContain("*Bazaar Supermarket* — Purchase Order");
    expect(msg).toContain("PO No: PO-20261105-0001");
    expect(msg).toContain("1. Sunflower oil 1L (pcs) — 12 pcs @ Rs.140.00 = Rs.1680.00");
    expect(msg).toContain("2. Basmati rice 5kg (5000 g) — 5 bags @ Rs.480.00 = Rs.2400.00");
    expect(msg).toContain("Estimated total: Rs.4080.00");
    expect(msg).toContain("Destination: Main street branch");
    expect(msg).toContain("Deliver before 10 AM");
    expect(msg).not.toContain("₹");
  });

  it("wa.me link targets the supplier number with 91 prefix", () => {
    const { url, hasNumber } = poWhatsAppUrl("9876543210", "hello");
    expect(hasNumber).toBe(true);
    expect(url).toBe(`https://wa.me/919876543210?text=${encodeURIComponent("hello")}`);
  });

  it("falls back to a numberless link when no supplier phone is set", () => {
    const { url, hasNumber } = poWhatsAppUrl(null, "hello");
    expect(hasNumber).toBe(false);
    expect(url.startsWith("https://wa.me/?text=")).toBe(true);
  });

  it("normalises 12-digit and formatted numbers", () => {
    expect(waPhone("919876543210")).toBe("919876543210");
    expect(waPhone("+91 98765 43210")).toBe("919876543210");
    expect(waPhone("")).toBe(null);
  });
});
