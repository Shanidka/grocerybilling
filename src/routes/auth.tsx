import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ShoppingCart, Loader2, ScanLine, Zap, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/auth")({
  ssr: false,
  component: AuthPage,
  head: () => ({ meta: [{ title: "Sign in — Bazaar POS" }] }),
});

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) navigate({ to: "/dashboard", replace: true });
    });
  }, [navigate]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email, password,
          options: { emailRedirectTo: window.location.origin, data: { full_name: fullName } },
        });
        if (error) throw error;
        toast.success("Account ready. You're in.");
        navigate({ to: "/dashboard", replace: true });
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        navigate({ to: "/dashboard", replace: true });
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-[1.1fr_1fr]">
      {/* Brand panel */}
      <div className="hidden lg:flex flex-col justify-between p-12 bg-sidebar text-sidebar-foreground relative overflow-hidden">
        <div className="absolute -top-32 -right-32 size-96 rounded-full bg-sidebar-primary/20 blur-3xl" />
        <div className="absolute -bottom-40 -left-20 size-96 rounded-full bg-accent/10 blur-3xl" />

        <div className="relative flex items-center gap-3">
          <div className="size-12 rounded-2xl bg-sidebar-primary grid place-items-center shadow-lift">
            <ShoppingCart className="size-6 text-sidebar-primary-foreground" />
          </div>
          <div>
            <div className="text-xl font-semibold tracking-tight">Bazaar POS</div>
            <div className="text-xs text-sidebar-foreground/60">Built for Indian supermarkets</div>
          </div>
        </div>

        <div className="relative space-y-8 max-w-md">
          <div>
            <h1 className="text-5xl font-semibold leading-[1.05] tracking-tight">
              Bill faster.<br/>
              <span className="text-sidebar-primary">Stock smarter.</span>
            </h1>
            <p className="mt-4 text-sidebar-foreground/70 text-lg">
              A modern, offline-first point of sale for kirana stores, supermarkets and chains across India.
            </p>
          </div>

          <div className="grid gap-3">
            <Feature icon={ScanLine} title="Scan & bill in seconds" desc="Camera or USB barcode scanner. Manual fallback always works." />
            <Feature icon={Zap} title="Works offline" desc="Keep billing even when the internet drops." />
            <Feature icon={ShieldCheck} title="Roles & audit" desc="Admin, manager and cashier with proper access control." />
          </div>
        </div>

        <div className="relative text-xs text-sidebar-foreground/50">
          First account becomes the Admin · GST ready · ₹ Indian Rupees
        </div>
      </div>

      {/* Auth panel */}
      <div className="flex items-center justify-center p-6 bg-background">
        <div className="w-full max-w-md">
          <div className="lg:hidden flex items-center gap-2 mb-8">
            <div className="size-10 rounded-xl bg-primary grid place-items-center">
              <ShoppingCart className="size-5 text-primary-foreground" />
            </div>
            <div className="font-semibold text-lg">Bazaar POS</div>
          </div>

          <div className="inline-flex p-1 rounded-lg bg-muted text-sm mb-6">
            <button
              onClick={() => setMode("signin")}
              className={`px-4 py-1.5 rounded-md transition-colors ${mode==="signin" ? "bg-background shadow-sm font-medium" : "text-muted-foreground"}`}
            >Sign in</button>
            <button
              onClick={() => setMode("signup")}
              className={`px-4 py-1.5 rounded-md transition-colors ${mode==="signup" ? "bg-background shadow-sm font-medium" : "text-muted-foreground"}`}
            >Create account</button>
          </div>

          <h2 className="text-3xl font-semibold tracking-tight">
            {mode === "signin" ? "Welcome back" : "Set up your store"}
          </h2>
          <p className="text-muted-foreground mt-1 mb-8">
            {mode === "signin" ? "Sign in to start a billing session." : "Create the first user — you'll be the admin."}
          </p>

          <form onSubmit={submit} className="space-y-4">
            {mode === "signup" && (
              <div className="space-y-1.5">
                <Label htmlFor="name">Your name</Label>
                <Input id="name" value={fullName} onChange={(e) => setFullName(e.target.value)} required maxLength={80} className="h-11" />
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required className="h-11" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" autoComplete={mode === "signin" ? "current-password" : "new-password"} value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} className="h-11" />
            </div>
            <Button type="submit" className="w-full h-11 text-base" disabled={loading}>
              {loading && <Loader2 className="size-4 animate-spin" />}
              {mode === "signin" ? "Sign in" : "Create account & continue"}
            </Button>
          </form>

          <p className="mt-8 text-xs text-center text-muted-foreground">
            By continuing you agree to fair and lawful use of the system.
          </p>
        </div>
      </div>
    </div>
  );
}

function Feature({ icon: Icon, title, desc }: { icon: React.ComponentType<{ className?: string }>; title: string; desc: string }) {
  return (
    <div className="flex gap-3 items-start">
      <div className="size-9 rounded-lg bg-sidebar-accent grid place-items-center shrink-0">
        <Icon className="size-4 text-sidebar-primary" />
      </div>
      <div>
        <div className="font-medium">{title}</div>
        <div className="text-sm text-sidebar-foreground/60">{desc}</div>
      </div>
    </div>
  );
}
