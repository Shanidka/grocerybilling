import { Link, Outlet, useRouter, useRouterState } from "@tanstack/react-router";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { LayoutDashboard, ScanBarcode, LogOut, ShoppingCart, Menu, X, WifiOff, Package, Settings as SettingsIcon, AlertTriangle, BarChart3, Boxes, Users, Truck, UserCog } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { useMyRoles } from "@/hooks/use-role";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";

const INACTIVITY_MS = 24 * 60 * 60 * 1000; // 24 hours

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    // Use getSession() so auth works offline (reads from localStorage; no network required)
    const { data: sess } = await supabase.auth.getSession();
    if (!sess.session) throw redirect({ to: "/auth" });

    // 24-hour inactivity auto-logout
    try {
      const last = Number(localStorage.getItem("bz_last_activity") ?? "0");
      if (last && Date.now() - last > INACTIVITY_MS) {
        await supabase.auth.signOut();
        localStorage.removeItem("bz_last_activity");
        throw redirect({ to: "/auth" });
      }
    } catch { /* ignore storage errors */ }

    return { user: sess.session.user };
  },
  component: AppShell,
});

type Role = "admin" | "manager" | "cashier";
const nav: Array<{ to: string; label: string; icon: typeof LayoutDashboard; roles?: Role[] }> = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/billing", label: "Billing", icon: ScanBarcode },
  { to: "/products", label: "Products", icon: Package },
  { to: "/inventory", label: "Inventory", icon: Boxes },
  { to: "/alerts", label: "Alerts", icon: AlertTriangle },
  { to: "/customers", label: "Customers", icon: Users },
  { to: "/suppliers", label: "Suppliers", icon: Truck, roles: ["admin", "manager"] },
  { to: "/reports", label: "Reports", icon: BarChart3, roles: ["admin", "manager"] },
  { to: "/staff", label: "Staff", icon: UserCog, roles: ["admin"] },
  { to: "/settings", label: "Settings", icon: SettingsIcon, roles: ["admin", "manager"] },
];

function AppShell() {
  const router = useRouter();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { data: roles } = useMyRoles();
  const [open, setOpen] = useState(false);
  const [online, setOnline] = useState(typeof navigator === "undefined" ? true : navigator.onLine);

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, []);

  // Track activity to power 24-hour inactivity auto-logout
  useEffect(() => {
    const touch = () => { try { localStorage.setItem("bz_last_activity", String(Date.now())); } catch { /* noop */ } };
    touch();
    const evts = ["click", "keydown", "touchstart", "mousemove", "visibilitychange"];
    evts.forEach((e) => window.addEventListener(e, touch, { passive: true }));
    const iv = setInterval(touch, 60_000);
    return () => { evts.forEach((e) => window.removeEventListener(e, touch)); clearInterval(iv); };
  }, []);

  // Low stock toast
  useQuery({
    queryKey: ["low-stock-alert"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id,name,stock_qty,min_qty")
        .eq("is_active", true);
      if (error) throw error;
      const low = (data ?? []).filter((p) => Number(p.stock_qty) <= Number(p.min_qty) && Number(p.min_qty) > 0);
      if (low.length > 0) {
        toast.warning(`${low.length} product(s) at or below minimum stock`, {
          id: "low-stock",
          description: low.slice(0, 3).map((p) => p.name).join(", ") + (low.length > 3 ? "…" : ""),
          duration: 6000,
        });
      }
      return low;
    },
    refetchInterval: 2 * 60 * 60 * 1000, // every 2 hours
  });

  const signOut = async () => {
    await supabase.auth.signOut();
    router.navigate({ to: "/auth", replace: true });
  };

  return (
    <div className="min-h-screen flex bg-background text-foreground">
      <aside
        className={`fixed lg:static inset-y-0 left-0 z-40 w-64 bg-sidebar text-sidebar-foreground flex flex-col transform transition-transform ${
          open ? "translate-x-0" : "-translate-x-full"
        } lg:translate-x-0`}
      >
        <div className="px-5 py-5 flex items-center gap-2 border-b border-sidebar-border">
          <div className="size-10 rounded-xl bg-sidebar-primary text-sidebar-primary-foreground grid place-items-center">
            <ShoppingCart className="size-5" />
          </div>
          <div>
            <div className="font-semibold leading-tight">Bazaar POS</div>
            <div className="text-xs text-sidebar-foreground/60">Supermarket billing</div>
          </div>
        </div>
        <nav className="flex-1 p-3 space-y-1">
          {nav.filter((n) => !n.roles || n.roles.some((r) => (roles ?? []).includes(r))).map((n) => {
            const active = pathname === n.to || pathname.startsWith(n.to + "/");
            const Icon = n.icon;
            return (
              <Link
                key={n.to}
                to={n.to}
                onClick={() => setOpen(false)}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-md text-sm transition-colors ${
                  active
                    ? "bg-sidebar-primary text-sidebar-primary-foreground"
                    : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                }`}
              >
                <Icon className="size-4" />
                {n.label}
              </Link>
            );
          })}
        </nav>
        <div className="p-3 border-t border-sidebar-border space-y-2">
          {!online && (
            <div className="px-3 py-1.5 rounded-md bg-warning/20 text-warning text-xs flex items-center gap-2">
              <WifiOff className="size-3" /> Offline mode
            </div>
          )}
          <div className="px-3 py-2 text-xs text-sidebar-foreground/60">
            Role: <span className="text-sidebar-foreground capitalize">{roles?.[0] ?? "—"}</span>
          </div>
          <button
            onClick={signOut}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          >
            <LogOut className="size-4" /> Sign out
          </button>
        </div>
      </aside>

      {open && <div className="fixed inset-0 z-30 bg-black/40 lg:hidden" onClick={() => setOpen(false)} />}

      <div className="flex-1 flex flex-col min-w-0">
        <header className="lg:hidden h-14 px-4 flex items-center gap-3 border-b bg-surface">
          <Button variant="ghost" size="icon" onClick={() => setOpen((v) => !v)}>
            {open ? <X className="size-5" /> : <Menu className="size-5" />}
          </Button>
          <div className="font-semibold">Bazaar POS</div>
        </header>
        <main className="flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
