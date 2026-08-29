import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useStoreId } from "@/lib/active-store";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { FileText, Upload, Loader2, Download, Trash2, CalendarClock, Plus } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/documents")({
  ssr: false,
  component: DocumentsPage,
  head: () => ({
    meta: [
      { title: "Shop documents — Bazaar POS" },
      { name: "description", content: "Store licenses, GST certificates and shop agreements with expiry reminders." },
    ],
  }),
});

const DOC_TYPES = [
  "Trade license", "FSSAI license", "GST certificate", "Shop & establishment",
  "Rent agreement", "Insurance", "Electricity", "Fire safety", "Other",
];

type Doc = {
  id: string; title: string; doc_type: string; doc_number: string | null;
  issued_on: string | null; expires_on: string | null; file_path: string;
  file_name: string; size_bytes: number | null; notes: string | null; created_at: string;
};

function daysLeft(d: string | null) {
  if (!d) return null;
  return Math.ceil((new Date(d).getTime() - Date.now()) / 86400000);
}

function DocumentsPage() {
  const storeId = useStoreId();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  const q = useQuery({
    queryKey: ["shop-documents", storeId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("shop_documents")
        .select("id,title,doc_type,doc_number,issued_on,expires_on,file_path,file_name,size_bytes,notes,created_at")
        .eq("store_id", storeId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Doc[];
    },
  });

  const docs = q.data ?? [];
  const expiring = useMemo(
    () => docs.filter((d) => { const n = daysLeft(d.expires_on); return n !== null && n <= 30; }),
    [docs],
  );

  const openFile = async (d: Doc) => {
    const { data, error } = await supabase.storage.from("shop-documents").createSignedUrl(d.file_path, 120);
    if (error || !data) return toast.error(error?.message ?? "Could not open file");
    window.open(data.signedUrl, "_blank", "noopener");
  };

  const remove = async (d: Doc) => {
    if (!confirm(`Delete "${d.title}"?`)) return;
    await supabase.storage.from("shop-documents").remove([d.file_path]);
    const { error } = await supabase.from("shop_documents").delete().eq("id", d.id);
    if (error) return toast.error(error.message);
    toast.success("Document deleted");
    qc.invalidateQueries({ queryKey: ["shop-documents"] });
  };

  return (
    <div className="p-4 lg:p-6 space-y-6 max-w-5xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Shop documents</h1>
          <p className="text-sm text-muted-foreground">Licenses, certificates and agreements — with renewal reminders.</p>
        </div>
        <Button onClick={() => setOpen(true)}><Plus className="size-4" /> Upload document</Button>
      </div>

      {expiring.length > 0 && (
        <Card className="p-4 border-warning/40 bg-warning/10">
          <div className="flex items-center gap-2 text-warning font-medium text-sm">
            <CalendarClock className="size-4" /> {expiring.length} document(s) expiring within 30 days
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            {expiring.map((d) => `${d.title} (${daysLeft(d.expires_on)}d)`).join(" · ")}
          </div>
        </Card>
      )}

      <Card className="p-0 overflow-hidden">
        {q.isLoading ? (
          <div className="p-8 grid place-items-center"><Loader2 className="size-5 animate-spin" /></div>
        ) : docs.length === 0 ? (
          <div className="p-10 text-center text-sm text-muted-foreground">
            <FileText className="size-8 mx-auto mb-2 opacity-40" />
            No documents yet. Upload your shop licenses and certificates.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left">
                <tr>
                  {["Document", "Type", "Number", "Issued", "Expires", ""].map((h) => (
                    <th key={h} className="px-4 py-2.5 font-medium text-muted-foreground">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {docs.map((d) => {
                  const n = daysLeft(d.expires_on);
                  return (
                    <tr key={d.id}>
                      <td className="px-4 py-3">
                        <button className="font-medium hover:underline text-left" onClick={() => openFile(d)}>{d.title}</button>
                        <div className="text-xs text-muted-foreground truncate max-w-[220px]">{d.file_name}</div>
                      </td>
                      <td className="px-4 py-3">{d.doc_type}</td>
                      <td className="px-4 py-3">{d.doc_number ?? "—"}</td>
                      <td className="px-4 py-3">{d.issued_on ?? "—"}</td>
                      <td className="px-4 py-3">
                        {d.expires_on ? (
                          <Badge variant={n !== null && n < 0 ? "destructive" : n !== null && n <= 30 ? "secondary" : "outline"}>
                            {d.expires_on}{n !== null && (n < 0 ? ` · expired` : ` · ${n}d`)}
                          </Badge>
                        ) : "—"}
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <Button size="icon" variant="ghost" onClick={() => openFile(d)}><Download className="size-4" /></Button>
                        <Button size="icon" variant="ghost" onClick={() => remove(d)}><Trash2 className="size-4 text-destructive" /></Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <UploadDialog open={open} onClose={() => setOpen(false)} storeId={storeId} />
    </div>
  );
}

function UploadDialog({ open, onClose, storeId }: { open: boolean; onClose: () => void; storeId: string }) {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [docType, setDocType] = useState(DOC_TYPES[0]);
  const [docNumber, setDocNumber] = useState("");
  const [issuedOn, setIssuedOn] = useState("");
  const [expiresOn, setExpiresOn] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setFile(null); setTitle(""); setDocType(DOC_TYPES[0]); setDocNumber("");
    setIssuedOn(""); setExpiresOn(""); setNotes("");
  };

  const save = async () => {
    if (!file) return toast.error("Choose a file");
    if (!title.trim()) return toast.error("Title required");
    setBusy(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = `${storeId}/${Date.now()}-${safe}`;
      const up = await supabase.storage.from("shop-documents").upload(path, file, { upsert: false });
      if (up.error) throw up.error;
      const { error } = await supabase.from("shop_documents").insert({
        store_id: storeId,
        title: title.trim(),
        doc_type: docType,
        doc_number: docNumber || null,
        issued_on: issuedOn || null,
        expires_on: expiresOn || null,
        file_path: path,
        file_name: file.name,
        mime_type: file.type || null,
        size_bytes: file.size,
        notes: notes || null,
        uploaded_by: u.user!.id,
      });
      if (error) throw error;
      toast.success("Document uploaded");
      qc.invalidateQueries({ queryKey: ["shop-documents"] });
      reset();
      onClose();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Upload shop document</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>File (PDF or image, max 25MB)</Label>
            <input
              ref={fileRef}
              type="file"
              accept="application/pdf,image/*,.doc,.docx"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0] ?? null;
                setFile(f);
                if (f && !title) setTitle(f.name.replace(/\.[^.]+$/, ""));
              }}
            />
            <Button variant="outline" className="w-full mt-1" onClick={() => fileRef.current?.click()}>
              <Upload className="size-4" /> {file ? file.name : "Choose file"}
            </Button>
          </div>
          <div><Label>Title</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="FSSAI license 2026" /></div>
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <Label>Type</Label>
              <Select value={docType} onValueChange={setDocType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{DOC_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Document number</Label><Input value={docNumber} onChange={(e) => setDocNumber(e.target.value)} /></div>
            <div><Label>Issued on</Label><Input type="date" value={issuedOn} onChange={(e) => setIssuedOn(e.target.value)} /></div>
            <div><Label>Expires on</Label><Input type="date" value={expiresOn} onChange={(e) => setExpiresOn(e.target.value)} /></div>
          </div>
          <div><Label>Notes</Label><Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={busy}>{busy ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />} Upload</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
