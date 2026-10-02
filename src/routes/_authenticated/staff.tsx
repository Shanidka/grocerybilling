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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Plus, Trash2, Pencil } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAccess, useDesignations, useRolePermissions, PAGES, type AppRoleRow } from "@/lib/permissions";
import { listStaff, createStaff, setStaffRole, deleteStaff } from "@/lib/staff.functions";
import { logActivity } from "@/lib/activity-log";

export const Route = createFileRoute("/_authenticated/staff")({
  ssr: false,
  component: StaffPage,
  head: () => ({ meta: [{ title: "Staff — Bazaar POS" }] }),
});

const BASE_ROLES = [
  { v: "admin", l: "Admin level" },
  { v: "manager", l: "Manager level" },
  { v: "cashier", l: "Cashier level" },
  { v: "sales_executive", l: "Sales executive level" },
  { v: "store_keeper", l: "Store keeper level" },
];

function StaffPage() {
  const access = useAccess();
  const canSee = access.isAdmin || access.isManager;
  if (!access.isLoading && !canSee) return <Navigate to="/dashboard" />;

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-6xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Staff</h1>
        <p className="text-sm text-muted-foreground">
          {access.isAdmin ? "Manage staff, roles and what each role can open." : "Add staff using the existing roles."}
        </p>
      </div>
      <Tabs defaultValue="people">
        <TabsList>
          <TabsTrigger value="people">People</TabsTrigger>
          {access.isAdmin && <TabsTrigger value="roles">Roles &amp; access</TabsTrigger>}
        </TabsList>
        <TabsContent value="people" className="mt-4"><PeopleTab isAdmin={access.isAdmin} enabled={canSee} /></TabsContent>
        {access.isAdmin && <TabsContent value="roles" className="mt-4"><RolesTab /></TabsContent>}
      </Tabs>
    </div>
  );
}

function PeopleTab({ isAdmin, enabled }: { isAdmin: boolean; enabled: boolean }) {
  const list = useServerFn(listStaff);
  const create = useServerFn(createStaff);
  const setRole = useServerFn(setStaffRole);
  const del = useServerFn(deleteStaff);
  const qc = useQueryClient();
  const { data: designations = [] } = useDesignations();
  const assignable = isAdmin ? designations : designations.filter((d) => d.base_role !== "admin");
  const labelOf = (k: string) => designations.find((d) => d.key === k)?.label ?? k;

  const q = useQuery({ enabled, queryKey: ["staff-list"], queryFn: () => list() });

  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState(""); const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState(""); const [roleKey, setRoleKey] = useState("cashier");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!email || password.length < 8 || !fullName) return toast.error("Fill all fields (password ≥ 8 chars)");
    setSaving(true);
    try {
      await create({ data: { email, password, full_name: fullName, role_key: roleKey } });
      toast.success("Staff created");
      setOpen(false); setEmail(""); setPassword(""); setFullName(""); setRoleKey("cashier");
      qc.invalidateQueries({ queryKey: ["staff-list"] });
    } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
    finally { setSaving(false); }
  };

  const changeRole = async (user_id: string, k: string) => {
    try { await setRole({ data: { user_id, role_key: k } }); toast.success("Role updated"); qc.invalidateQueries({ queryKey: ["staff-list"] }); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
  };
  const remove = async (user_id: string, name: string) => {
    if (!confirm(`Remove ${name}?`)) return;
    try { await del({ data: { user_id } }); toast.success("Removed"); qc.invalidateQueries({ queryKey: ["staff-list"] }); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><Plus className="size-4" /> Add staff</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Add new staff</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>Full name</Label><Input value={fullName} onChange={(e) => setFullName(e.target.value)} /></div>
              <div><Label>Email</Label><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
              <div><Label>Password (min 8)</Label><Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} /></div>
              <div><Label>Role</Label>
                <Select value={roleKey} onValueChange={setRoleKey}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{assignable.map((d) => <SelectItem key={d.key} value={d.key}>{d.label}</SelectItem>)}</SelectContent>
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
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-left"><tr><th className="px-4 py-2.5">Name</th><th className="px-4 py-2.5">Email</th><th className="px-4 py-2.5">Role</th><th className="px-4 py-2.5">Added</th><th className="px-4 py-2.5"></th></tr></thead>
                <tbody className="divide-y">
                  {q.data.map((u) => (
                    <tr key={u.id}>
                      <td className="px-4 py-3">{u.full_name ?? "—"}</td>
                      <td className="px-4 py-3 text-muted-foreground">{u.email}</td>
                      <td className="px-4 py-3">
                        {isAdmin ? (
                          <Select value={u.role_key} onValueChange={(v) => changeRole(u.id, v)}>
                            <SelectTrigger className="w-44 h-8"><SelectValue /></SelectTrigger>
                            <SelectContent>{designations.map((d) => <SelectItem key={d.key} value={d.key}>{d.label}</SelectItem>)}</SelectContent>
                          </Select>
                        ) : <span>{labelOf(u.role_key)}</span>}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{new Date(u.created_at).toLocaleDateString("en-IN")}</td>
                      <td className="px-4 py-3 text-right">
                        {isAdmin && <Button size="icon" variant="ghost" className="text-destructive" onClick={() => remove(u.id, u.full_name ?? u.email)}><Trash2 className="size-4" /></Button>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
      </Card>
    </div>
  );
}

function RolesTab() {
  const qc = useQueryClient();
  const { data: designations = [] } = useDesignations();
  const { data: perms = [] } = useRolePermissions();
  const [editing, setEditing] = useState<AppRoleRow | null>(null);
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState(""); const [base, setBase] = useState("cashier");

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["app-roles"] });
    qc.invalidateQueries({ queryKey: ["role-permissions"] });
  };
  const allowed = (rk: string, page: string) => {
    if (rk === "admin") return true;
    return perms.find((p) => p.role_key === rk && p.page === page)?.allowed ?? false;
  };

  const startNew = () => { setEditing(null); setLabel(""); setBase("cashier"); setOpen(true); };
  const startEdit = (d: AppRoleRow) => { setEditing(d); setLabel(d.label); setBase(d.base_role); setOpen(true); };

  const saveRole = async () => {
    if (!label.trim()) return toast.error("Name required");
    if (editing) {
      const { error } = await supabase.from("app_roles").update({ label: label.trim(), ...(editing.is_system ? {} : { base_role: base }) }).eq("key", editing.key);
      if (error) return toast.error(error.message);
      void logActivity("staff", "role-edit", `Edited role ${label.trim()}`, { entityId: editing.key });
    } else {
      const key = label.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || `role_${Date.now()}`;
      const { error } = await supabase.from("app_roles").insert({ key, label: label.trim(), base_role: base, is_system: false });
      if (error) return toast.error(error.message);
      // copy page access from the base level as a starting point
      const seed = PAGES.map((p) => ({ role_key: key, page: p.key, allowed: allowed(base, p.key) }));
      await supabase.from("role_permissions").upsert(seed, { onConflict: "role_key,page" });
      void logActivity("staff", "role-create", `Created role ${label.trim()}`, { entityId: key });
    }
    toast.success("Saved");
    setOpen(false); refresh();
  };

  const removeRole = async (d: AppRoleRow) => {
    if (d.is_system) return;
    if (!confirm(`Delete role ${d.label}? Staff with this role should be reassigned first.`)) return;
    await supabase.from("role_permissions").delete().eq("role_key", d.key);
    const { error } = await supabase.from("app_roles").delete().eq("key", d.key);
    if (error) return toast.error(error.message);
    void logActivity("staff", "role-delete", `Deleted role ${d.label}`, { entityId: d.key });
    toast.success("Deleted"); refresh();
  };

  const toggle = async (rk: string, page: string, v: boolean) => {
    const { error } = await supabase.from("role_permissions").upsert({ role_key: rk, page, allowed: v }, { onConflict: "role_key,page" });
    if (error) return toast.error(error.message);
    void logActivity("staff", "access-change", `${v ? "Allowed" : "Blocked"} ${page} for ${designations.find((d) => d.key === rk)?.label ?? rk}`, { entityId: rk });
    qc.invalidateQueries({ queryKey: ["role-permissions"] });
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={startNew}><Plus className="size-4" /> New role</Button>
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing ? "Edit role" : "New role / designation"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Name</Label><Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Senior cashier" /></div>
            <div><Label>Permission level</Label>
              <Select value={base} onValueChange={setBase} disabled={!!editing?.is_system}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{BASE_ROLES.map((b) => <SelectItem key={b.v} value={b.v}>{b.l}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter><Button onClick={saveRole}>Save</Button></DialogFooter>
        </DialogContent>
      </Dialog>
      <Card className="p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left">
              <tr>
                <th className="px-3 py-2.5 sticky left-0 bg-muted">Page</th>
                {designations.map((d) => (
                  <th key={d.key} className="px-3 py-2.5 text-center whitespace-nowrap">
                    <div>{d.label}</div>
                    <div className="flex justify-center gap-1 mt-1">
                      <Button size="icon" variant="ghost" className="size-6" onClick={() => startEdit(d)}><Pencil className="size-3" /></Button>
                      {!d.is_system && <Button size="icon" variant="ghost" className="size-6 text-destructive" onClick={() => removeRole(d)}><Trash2 className="size-3" /></Button>}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {PAGES.map((p) => (
                <tr key={p.key}>
                  <td className="px-3 py-2 sticky left-0 bg-card font-medium">{p.label}</td>
                  {designations.map((d) => (
                    <td key={d.key} className="px-3 py-2 text-center">
                      <Checkbox
                        checked={allowed(d.key, p.key)}
                        disabled={d.key === "admin"}
                        onCheckedChange={(v) => toggle(d.key, p.key, v === true)}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <p className="text-xs text-muted-foreground">Admin always has full access. Managers can add staff but cannot change roles or access.</p>
    </div>
  );
}
