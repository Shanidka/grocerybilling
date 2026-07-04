import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const Input = z.object({
  file_data_url: z.string().min(32), // data:<mime>;base64,....
  mime: z.string().min(3),
});

export type OCRItem = {
  name: string;
  qty: number;
  cost: number;
  hsn?: string;
  tax_pct?: number;
  mrp?: number;
  barcode?: string;
};

export type InvoiceOCRResult = {
  supplier?: string;
  invoice_no?: string;
  invoice_date?: string;
  total?: number;
  items: OCRItem[];
  raw?: string;
};

const SYSTEM = `You extract line items from Indian supplier invoices / purchase bills.
The file may be a photo, scan, PDF, or digital invoice in any Indian layout.
Respond ONLY with compact JSON matching this exact schema:
{
  "supplier": string|null,
  "invoice_no": string|null,
  "invoice_date": "YYYY-MM-DD"|null,
  "total": number|null,
  "items": [
    { "name": string, "qty": number, "cost": number, "hsn": string|null, "tax_pct": number|null, "mrp": number|null, "barcode": string|null }
  ]
}
Rules:
- "cost" is the per-unit purchase rate (NOT the line total). If only line totals are present, divide by qty.
- Ignore discount, taxable value, CGST/SGST/IGST subtotal rows — only real product rows go in items.
- Prefer the product/description column for "name". Strip HSN codes from name.
- If a field is missing, use null.
- Never wrap output in markdown, never explain.`;

export const extractInvoice = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => Input.parse(d))
  .handler(async ({ data }): Promise<InvoiceOCRResult> => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("AI gateway not configured");

    const isPdf = data.mime === "application/pdf";
    const userContent: Array<Record<string, unknown>> = [
      { type: "text", text: "Extract the invoice as JSON per the schema." },
    ];
    if (isPdf) {
      userContent.push({
        type: "file",
        file: { filename: "invoice.pdf", file_data: data.file_data_url },
      });
    } else {
      userContent.push({
        type: "image_url",
        image_url: { url: data.file_data_url },
      });
    }

    const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Lovable-API-Key": key },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content: userContent },
        ],
        response_format: { type: "json_object" },
      }),
    });
    if (!r.ok) {
      const txt = await r.text().catch(() => "");
      throw new Error(`OCR failed: ${r.status} ${txt.slice(0, 200)}`);
    }
    const j = await r.json();
    const raw = j.choices?.[0]?.message?.content ?? "{}";
    let parsed: Record<string, unknown> = {};
    try { parsed = JSON.parse(raw); } catch { parsed = {}; }

    const items = Array.isArray(parsed.items) ? parsed.items : [];
    const cleanItems: OCRItem[] = items
      .map((it: Record<string, unknown>) => ({
        name: String(it.name ?? "").trim(),
        qty: Number(it.qty ?? 0),
        cost: Number(it.cost ?? 0),
        hsn: it.hsn ? String(it.hsn) : undefined,
        tax_pct: it.tax_pct != null ? Number(it.tax_pct) : undefined,
        mrp: it.mrp != null ? Number(it.mrp) : undefined,
        barcode: it.barcode ? String(it.barcode) : undefined,
      }))
      .filter((it: OCRItem) => it.name && it.qty > 0);

    return {
      supplier: parsed.supplier ? String(parsed.supplier) : undefined,
      invoice_no: parsed.invoice_no ? String(parsed.invoice_no) : undefined,
      invoice_date: parsed.invoice_date ? String(parsed.invoice_date) : undefined,
      total: parsed.total != null ? Number(parsed.total) : undefined,
      items: cleanItems,
    };
  });
