export const inr = (n: number | string | null | undefined) => {
  const v = Number(n ?? 0);
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(v);
};

export const num = (n: number | string | null | undefined, d = 2) =>
  Number(n ?? 0).toLocaleString("en-IN", { maximumFractionDigits: d });

export const dt = (s: string) =>
  new Date(s).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
