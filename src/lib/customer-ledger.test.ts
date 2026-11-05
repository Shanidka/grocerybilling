// @ts-ignore bun built-in test runner (run: bun test ./src/lib/customer-ledger.test.ts)
import { describe, expect, it } from "bun:test";
import { buildLedger, ledgerOutstanding, statementMessage } from "./customer-ledger";

describe("khata ledger", () => {
  it("merges debits and credits chronologically with a running balance", () => {
    const rows = buildLedger(
      [
        { date: "2026-11-05T10:00:00Z", label: "Bill B-2", ref: "B-2", amount: 500 },
        { date: "2026-11-01T10:00:00Z", label: "Bill B-1", ref: "B-1", amount: 300 },
      ],
      [{ date: "2026-11-03T10:00:00Z", label: "Cash", ref: null, amount: 200 }],
    );
    expect(rows.map((r) => r.kind)).toEqual(["bill", "payment", "bill"]);
    expect(rows[0].balance).toBe(300);
    expect(rows[1].balance).toBe(100);
    expect(rows[2].balance).toBe(600);
    expect(ledgerOutstanding(rows)).toBe(600);
  });

  it("statement shows outstanding and a UPI link when there is balance", () => {
    const rows = buildLedger(
      [{ date: "2026-11-01T10:00:00Z", label: "Bill B-1", ref: "B-1", amount: 1000 }],
      [{ date: "2026-11-02T10:00:00Z", label: "UPI", ref: null, amount: 400 }],
    );
    const msg = statementMessage({ shopName: "Bazaar", customerName: "Anand", rows, upiId: "bazaar@upi" });
    expect(msg).toContain("*Bazaar* — Khata statement");
    expect(msg).toContain("*Outstanding: Rs.600.00*");
    expect(msg).toContain("upi://pay?pa=bazaar@upi&am=600.00");
    expect(msg).not.toContain("₹");
  });

  it("statement skips the payment link when fully settled", () => {
    const rows = buildLedger(
      [{ date: "2026-11-01T10:00:00Z", label: "Bill B-1", ref: "B-1", amount: 400 }],
      [{ date: "2026-11-02T10:00:00Z", label: "Cash", ref: null, amount: 400 }],
    );
    const msg = statementMessage({ shopName: "Bazaar", customerName: "Anand", rows, upiId: "bazaar@upi" });
    expect(msg).toContain("*Outstanding: Rs.0.00*");
    expect(msg).not.toContain("upi://");
  });
});
