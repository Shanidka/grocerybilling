import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Store, Loader2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/auth")({
  ssr: false,
  component: AuthPage,
  head: () => ({ meta: [{ title: "Sign in — FreshMart POS" }] }),
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
          email,
          password,
          options: {
            emailRedirectTo: window.location.origin,
            data: { full_name: fullName },
          },
        });
        if (error) throw error;
        toast.success("Account created. You're signed in.");
        navigate({ to: "/dashboard", replace: true });
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        navigate({ to: "/dashboard", replace: true });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Something went wrong";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      <div className="hidden lg:flex flex-col justify-between p-12 bg-sidebar text-sidebar-foreground">
        <div className="flex items-center gap-3">
          <div className="size-11 rounded-xl bg-sidebar-primary grid place-items-center">
            <Store className="size-6 text-sidebar-primary-foreground" />
          </div>
          <div>
            <div className="text-xl font-semibold">FreshMart POS</div>
            <div className="text-sm text-sidebar-foreground/60">Supermarket billing & inventory</div>
          </div>
        </div>
        <div className="space-y-4 max-w-md">
          <h1 className="text-4xl font-semibold leading-tight">
            Fast checkout.<br />Smart stock.
          </h1>
          <p className="text-sidebar-foreground/70">
            Scan or type. Set margins or selling price — either way works. Get alerted the moment a product crosses its reorder line.
          </p>
        </div>
        <div className="text-xs text-sidebar-foreground/50">
          The first account you create becomes the Admin.
        </div>
      </div>

      <div className="flex items-center justify-center p-6">
        <Card className="w-full max-w-md p-8 shadow-lift">
          <div className="lg:hidden flex items-center gap-2 mb-6">
            <div className="size-9 rounded-lg bg-primary grid place-items-center">
              <Store className="size-5 text-primary-foreground" />
            </div>
            <div className="font-semibold">FreshMart POS</div>
          </div>
          <h2 className="text-2xl font-semibold mb-1">
            {mode === "signin" ? "Welcome back" : "Create your account"}
          </h2>
          <p className="text-sm text-muted-foreground mb-6">
            {mode === "signin" ? "Sign in to start billing" : "Set up your supermarket"}
          </p>

          <form onSubmit={submit} className="space-y-4">
            {mode === "signup" && (
              <div className="space-y-1.5">
                <Label htmlFor="name">Your name</Label>
                <Input id="name" value={fullName} onChange={(e) => setFullName(e.target.value)} required maxLength={80} />
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading && <Loader2 className="size-4 animate-spin mr-2" />}
              {mode === "signin" ? "Sign in" : "Create account"}
            </Button>
          </form>

          <div className="mt-6 text-sm text-center text-muted-foreground">
            {mode === "signin" ? (
              <>No account? <button className="text-primary font-medium hover:underline" onClick={() => setMode("signup")}>Create one</button></>
            ) : (
              <>Already have one? <button className="text-primary font-medium hover:underline" onClick={() => setMode("signin")}>Sign in</button></>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
