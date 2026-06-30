// Service worker registration with strict preview/dev guards.
// Registers only in production and outside Lovable preview iframes.
export async function registerAppSW() {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
  const inIframe = (() => { try { return window.self !== window.top; } catch { return true; } })();
  const host = window.location.hostname;
  const url = new URL(window.location.href);
  const isLovablePreviewHost =
    host.startsWith("id-preview--") ||
    host.startsWith("preview--") ||
    host === "lovableproject.com" ||
    host.endsWith(".lovableproject.com") ||
    host === "lovableproject-dev.com" ||
    host.endsWith(".lovableproject-dev.com") ||
    host === "beta.lovable.dev" ||
    host.endsWith(".beta.lovable.dev");
  const refuse = !import.meta.env.PROD || inIframe || isLovablePreviewHost || url.searchParams.get("sw") === "off";

  if (refuse) {
    try {
      const regs = await navigator.serviceWorker.getRegistrations();
      for (const r of regs) {
        if (r.active?.scriptURL.endsWith("/sw.js")) await r.unregister();
      }
    } catch { /* ignore */ }
    return;
  }
  try {
    await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  } catch (e) {
    console.warn("SW registration failed", e);
  }
}
