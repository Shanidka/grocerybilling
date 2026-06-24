import { Link, Outlet, useRouter, useRouterState } from "@tanstack/react-router";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import {
  LayoutDashboard,
  ScanBarcode,
  Package,
  Receipt,
  BarChart3,
  LogOut,
  Store,
  Menu,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { useMyRoles } from "@/hooks/use-role";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    return { user: data.user };
  },
  component: AppShell,
});

const nav = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/billing", label: "Billing", icon: ScanBarcode },
  { to: "/products", label: "Products", icon: Package },
  { to: "/sales", label: "Sales", icon: Receipt },
  { to: "/reports", label: "Reports", icon: BarChart3 },
] as const;

function AppShell() {
  const router = useRouter();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { data: roles } = useMyRoles();
  const [open, setOpen] = useState(false);

  const lowStock = useQuery({
    queryKey: ["low-stock-alert"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id,name,stock_qty,min_qty")
        .eq("active", true);
      if (error) throw error;
      return (data ?? []).filter((p) => Number(p.stock_qty) <= Number(p.min_qty));
    },
    refetchInterval: 60000,
  });

  useEffect(() => {
    if (lowStock.data && lowStock.data.length > 0) {
      toast.warning(`${lowStock.data.length} product(s) at or below minimum stock`, {
        id: "low-stock",
        description: lowStock.data.slice(0, 3).map((p) => p.name).join(", ") + (lowStock.data.length > 3 ? "…" : ""),
        duration: 6000,
      });
    }
  }, [lowStock.data]);

  const signOut = async () => {
    await supabase.auth.signOut();
    router.navigate({ to: "/auth", replace: true });
  };

  return (
    <div className="min-h-screen flex bg-background text-foreground">
      {/* Sidebar */}
      <aside
        className={`fixed lg:static inset-y-0 left-0 z-40 w-64 bg-sidebar text-sidebar-foreground flex flex-col transform transition-transform ${
          open ? "translate-x-0" : "-translate-x-full"
        } lg:translate-x-0`}
      >
        <div className="px-5 py-5 flex items-center gap-2 border-b border-sidebar-border">
          <div className="size-9 rounded-lg bg-sidebar-primary text-sidebar-primary-foreground grid place-items-center">
            <Store className="size-5" />
          </div>
          <div>
            <div className="font-semibold leading-tight">FreshMart POS</div>
            <div className="text-xs text-sidebar-foreground/60">Supermarket billing</div>
          </div>
        </div>
        <nav className="flex-1 p-3 space-y-1">
          {nav.map((n) => {
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
          <div className="px-3 py-2 text-xs text-sidebar-foreground/60">
            Role: <span className="text-sidebar-foreground">{roles?.[0] ?? "—"}</span>
          </div>
          <button
            onClick={signOut}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          >
            <LogOut className="size-4" /> Sign out
          </button>
        </div>
      </aside>

      {open && (
        <div className="fixed inset-0 z-30 bg-black/40 lg:hidden" onClick={() => setOpen(false)} />
      )}

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="lg:hidden h-14 px-4 flex items-center gap-3 border-b bg-surface">
          <Button variant="ghost" size="icon" onClick={() => setOpen((v) => !v)}>
            {open ? <X className="size-5" /> : <Menu className="size-5" />}
          </Button>
          <div className="font-semibold">FreshMart POS</div>
        </header>
        <main className="flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
