import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const Input = z.object({ barcode: z.string().min(4).max(32) });

export type ProductLookup = {
  source: "openfoodfacts" | "ai" | "none";
  name?: string;
  brand?: string;
  category?: string;
  net_weight_g?: number;
  image_url?: string;
};

function parseQuantity(q?: string): number | undefined {
  if (!q) return;
  const m = q.toLowerCase().match(/([\d.]+)\s*(kg|g|gm|gms|ml|l|ltr)/);
  if (!m) return;
  const n = parseFloat(m[1]);
  if (isNaN(n)) return;
  switch (m[2]) {
    case "kg": return n * 1000;
    case "l":
    case "ltr": return n * 1000; // treat ml/g equally for "net weight"
    default: return n;
  }
}

async function fromOpenFoodFacts(barcode: string): Promise<ProductLookup | null> {
  try {
    const r = await fetch(`https://world.openfoodfacts.org/api/v2/product/${barcode}.json?fields=product_name,brands,categories,quantity,image_front_small_url`, {
      headers: { "User-Agent": "BazaarPOS/1.0" },
    });
    if (!r.ok) return null;
    const j = await r.json();
    if (j.status !== 1 || !j.product) return null;
    const p = j.product;
    if (!p.product_name) return null;
    return {
      source: "openfoodfacts",
      name: p.product_name,
      brand: p.brands?.split(",")[0]?.trim(),
      category: p.categories?.split(",").pop()?.trim(),
      net_weight_g: parseQuantity(p.quantity),
      image_url: p.image_front_small_url,
    };
  } catch { return null; }
}

async function fromAI(barcode: string): Promise<ProductLookup | null> {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) return null;
  try {
    const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Lovable-API-Key": key },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: "You identify retail products by barcode/GTIN. Respond ONLY with compact JSON: {\"name\":\"…\",\"brand\":\"…\",\"category\":\"…\",\"net_weight_g\":<number or null>}. If you don't know, return {\"name\":null}." },
          { role: "user", content: `Barcode: ${barcode}` },
        ],
        response_format: { type: "json_object" },
      }),
    });
    if (!r.ok) return null;
    const j = await r.json();
    const txt = j.choices?.[0]?.message?.content;
    if (!txt) return null;
    const parsed = JSON.parse(txt);
    if (!parsed?.name) return null;
    return {
      source: "ai",
      name: String(parsed.name),
      brand: parsed.brand ?? undefined,
      category: parsed.category ?? undefined,
      net_weight_g: typeof parsed.net_weight_g === "number" ? parsed.net_weight_g : undefined,
    };
  } catch { return null; }
}

export const lookupBarcode = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => Input.parse(d))
  .handler(async ({ data }): Promise<ProductLookup> => {
    const off = await fromOpenFoodFacts(data.barcode);
    if (off) return off;
    const ai = await fromAI(data.barcode);
    if (ai) return ai;
    return { source: "none" };
  });
