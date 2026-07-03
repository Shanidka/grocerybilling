import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { useMyRoles } from "@/hooks/use-role";
import { listStaff, createStaff, setStaffRole, deleteStaff } from "@/lib/staff.functions";

export const Route = createFileRoute("/_authenticated/staff")({
  ssr: false,
  component: StaffPage,
  head: () => ({ meta: [{ title: "Staff — Bazaar POS" }] }),
});

type Role = "admin" | "manager" | "cashier";

function StaffPage() {
  const { data: roles, isLoading: rl } = useMyRoles();
  const isAdmin = (roles ?? []).includes("admin");
  const list = useServerFn(listStaff);
  const create = useServerFn(createStaff);
  const setRole = useServerFn(setStaffRole);
  const del = useServerFn(deleteStaff);
  const qc = useQueryClient();

  const q = useQuery({
    enabled: isAdmin,
    queryKey: ["staff-list"],
    queryFn: () => list(),
  });

  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState(""); const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState(""); const [role, setNewRole] = useState<Role>("cashier");
  const [saving, setSaving] = useState(false);

  if (!rl && !isAdmin) return <Navigate to="/dashboard" />;

  const save = async () => {
    if (!email || password.length < 8 || !fullName) return toast.error("Fill all fields (password ≥ 8 chars)");
    setSaving(true);
    try {
      await create({ data: { email, password, full_name: fullName, role } });
      toast.success("Staff created");
      setOpen(false); setEmail(""); setPassword(""); setFullName(""); setNewRole("cashier");
      qc.invalidateQueries({ queryKey: ["staff-list"] });
    } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
    finally { setSaving(false); }
  };

  const changeRole = async (user_id: string, r: Role) => {
    try { await setRole({ data: { user_id, role: r } }); toast.success("Role updated"); qc.invalidateQueries({ queryKey: ["staff-list"] }); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
  };
  const remove = async (user_id: string, name: string) => {
    if (!confirm(`Remove ${name}?`)) return;
    try { await del({ data: { user_id } }); toast.success("Removed"); qc.invalidateQueries({ queryKey: ["staff-list"] }); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
  };

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-5xl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Staff</h1>
          <p className="text-sm text-muted-foreground">Manage cashiers, managers, and admins.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><Plus className="size-4" /> Add staff</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Add new staff</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>Full name</Label><Input value={fullName} onChange={(e) => setFullName(e.target.value)} /></div>
              <div><Label>Email</Label><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
              <div><Label>Password (min 8)</Label><Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} /></div>
              <div><Label>Role</Label>
                <Select value={role} onValueChange={(v) => setNewRole(v as Role)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cashier">Cashier — billing only</SelectItem>
                    <SelectItem value="manager">Manager — billing + inventory + reports</SelectItem>
                    <SelectItem value="admin">Admin — full access</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter><Button onClick={save} disabled={saving}>Create</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card className="p-0 overflow-hidden">
        {q.isLoading ? <div className="p-8 text-center text-sm text-muted-foreground">Loading…</div>
          : !q.data?.length ? <div className="p-8 text-center text-sm text-muted-foreground">No staff yet.</div>
          : (
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left"><tr><th className="px-4 py-2.5">Name</th><th className="px-4 py-2.5">Email</th><th className="px-4 py-2.5">Role</th><th className="px-4 py-2.5">Added</th><th className="px-4 py-2.5"></th></tr></thead>
              <tbody className="divide-y">
                {q.data.map((u) => (
                  <tr key={u.id}>
                    <td className="px-4 py-3">{u.full_name ?? "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground">{u.email}</td>
                    <td className="px-4 py-3">
                      <Select value={u.role} onValueChange={(v) => changeRole(u.id, v as Role)}>
                        <SelectTrigger className="w-32 h-8"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="cashier">Cashier</SelectItem>
                          <SelectItem value="manager">Manager</SelectItem>
                          <SelectItem value="admin">Admin</SelectItem>
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{new Date(u.created_at).toLocaleDateString("en-IN")}</td>
                    <td className="px-4 py-3 text-right">
                      <Button size="icon" variant="ghost" className="text-destructive" onClick={() => remove(u.id, u.full_name ?? u.email)}><Trash2 className="size-4" /></Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
      </Card>

      <div className="text-xs text-muted-foreground">
        <Badge variant="outline">Admin</Badge> full access · <Badge variant="outline">Manager</Badge> billing + inventory + reports · <Badge variant="outline">Cashier</Badge> billing only
      </div>
    </div>
  );
}
