import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Search, Pencil, Trash2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/customers")({
  ssr: false,
  component: CustomersPage,
  head: () => ({ meta: [{ title: "Customers — Bazaar POS" }] }),
});

type Customer = { id: string; name: string; phone: string | null; email: string | null; notes: string | null };

function CustomersPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [form, setForm] = useState({ name: "", phone: "", email: "", notes: "" });

  const q = useQuery({
    queryKey: ["customers"],
    queryFn: async () => {
      const { data, error } = await supabase.from("customers").select("*").order("name");
      if (error) throw error;
      return (data ?? []) as Customer[];
    },
  });

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return q.data ?? [];
    return (q.data ?? []).filter((c) => c.name.toLowerCase().includes(s) || (c.phone ?? "").includes(s));
  }, [q.data, search]);

  const openNew = () => { setEditing(null); setForm({ name: "", phone: "", email: "", notes: "" }); setOpen(true); };
  const openEdit = (c: Customer) => { setEditing(c); setForm({ name: c.name, phone: c.phone ?? "", email: c.email ?? "", notes: c.notes ?? "" }); setOpen(true); };
  const save = async () => {
    if (!form.name.trim()) return toast.error("Name required");
    const payload = { name: form.name.trim(), phone: form.phone || null, email: form.email || null, notes: form.notes || null };
    const res = editing ? await supabase.from("customers").update(payload).eq("id", editing.id) : await supabase.from("customers").insert(payload);
    if (res.error) return toast.error(res.error.message);
    toast.success(editing ? "Updated" : "Added");
    setOpen(false); qc.invalidateQueries({ queryKey: ["customers"] });
  };
  const remove = async (c: Customer) => {
    if (!confirm(`Delete ${c.name}?`)) return;
    const { error } = await supabase.from("customers").delete().eq("id", c.id);
    if (error) return toast.error(error.message);
    toast.success("Deleted"); qc.invalidateQueries({ queryKey: ["customers"] });
  };

  return (
    <div className="p-6 lg:p-8 space-y-4 max-w-5xl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Customers</h1>
          <p className="text-sm text-muted-foreground">Directory of customer contacts.</p>
        </div>
        <Button onClick={openNew}><Plus className="size-4" /> Add customer</Button>
      </div>

      <Card className="p-3">
        <div className="relative">
          <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search by name or phone…" className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </Card>

      <Card className="p-0 overflow-hidden">
        {!filtered.length ? <div className="p-8 text-center text-sm text-muted-foreground">No customers.</div> : (
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left"><tr><th className="px-4 py-2.5">Name</th><th className="px-4 py-2.5">Phone</th><th className="px-4 py-2.5">Email</th><th className="px-4 py-2.5">Notes</th><th></th></tr></thead>
            <tbody className="divide-y">{filtered.map((c) => (
              <tr key={c.id}>
                <td className="px-4 py-3 font-medium">{c.name}</td>
                <td className="px-4 py-3">{c.phone ?? "—"}</td>
                <td className="px-4 py-3 text-muted-foreground">{c.email ?? "—"}</td>
                <td className="px-4 py-3 text-muted-foreground truncate max-w-xs">{c.notes ?? "—"}</td>
                <td className="px-4 py-3 text-right">
                  <Button size="icon" variant="ghost" onClick={() => openEdit(c)}><Pencil className="size-4" /></Button>
                  <Button size="icon" variant="ghost" className="text-destructive" onClick={() => remove(c)}><Trash2 className="size-4" /></Button>
                </td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing ? "Edit customer" : "Add customer"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Name *</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div><Label>Phone</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
            <div><Label>Email</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
            <div><Label>Notes</Label><Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
          </div>
          <DialogFooter><Button onClick={save}>Save</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
