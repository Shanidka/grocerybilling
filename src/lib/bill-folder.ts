// Save bill PDFs into a user-chosen folder (Chrome/Edge File System Access API).
// The folder handle is remembered in IndexedDB; falls back to share sheet / download.

type DirHandle = {
  name: string;
  queryPermission?: (o: { mode: string }) => Promise<string>;
  requestPermission?: (o: { mode: string }) => Promise<string>;
  getFileHandle: (n: string, o: { create: boolean }) => Promise<{ createWritable: () => Promise<{ write: (b: Blob) => Promise<void>; close: () => Promise<void> }> }>;
};

const DB = "bz_files", STORE = "handles", KEY = "bill_folder";

function idb(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function put(v: unknown) {
  const db = await idb();
  await new Promise((res, rej) => { const t = db.transaction(STORE, "readwrite"); t.objectStore(STORE).put(v, KEY); t.oncomplete = res; t.onerror = () => rej(t.error); });
}
async function get(): Promise<DirHandle | null> {
  try {
    const db = await idb();
    return await new Promise((res) => { const r = db.transaction(STORE).objectStore(STORE).get(KEY); r.onsuccess = () => res((r.result as DirHandle) ?? null); r.onerror = () => res(null); });
  } catch { return null; }
}

export const folderPickerSupported = () => typeof window !== "undefined" && "showDirectoryPicker" in window;

export async function chooseBillFolder(): Promise<string | null> {
  if (!folderPickerSupported()) return null;
  const h = await (window as unknown as { showDirectoryPicker: (o: object) => Promise<DirHandle> }).showDirectoryPicker({ mode: "readwrite" });
  await put(h);
  return h.name;
}
export async function getBillFolderName() { return (await get())?.name ?? null; }
export async function clearBillFolder() { await put(null); }

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

/** Returns where the file went: folder name, "share", or "download". */
export async function saveBillFile(blob: Blob, filename: string): Promise<string> {
  const h = await get();
  if (h) {
    try {
      let perm = (await h.queryPermission?.({ mode: "readwrite" })) ?? "granted";
      if (perm !== "granted") perm = (await h.requestPermission?.({ mode: "readwrite" })) ?? "denied";
      if (perm === "granted") {
        const fh = await h.getFileHandle(filename, { create: true });
        const w = await fh.createWritable(); await w.write(blob); await w.close();
        return h.name;
      }
    } catch { /* fall through */ }
  }
  const w = window as unknown as { showSaveFilePicker?: (o: object) => Promise<{ createWritable: () => Promise<{ write: (b: Blob) => Promise<void>; close: () => Promise<void> }> }> };
  if (w.showSaveFilePicker) {
    try {
      const fh = await w.showSaveFilePicker({ suggestedName: filename, types: [{ description: "PDF", accept: { "application/pdf": [".pdf"] } }] });
      const s = await fh.createWritable(); await s.write(blob); await s.close();
      return "chosen location";
    } catch (e) { if ((e as DOMException).name === "AbortError") return "cancelled"; }
  }
  const file = new File([blob], filename, { type: "application/pdf" });
  if (matchMedia("(pointer: coarse)").matches && navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title: filename }); return "share"; } catch { /* ignore */ }
  }
  download(blob, filename);
  return "download";
}

/** Normalize an Indian phone number for wa.me (adds 91 to 10-digit numbers). */
export function waNumber(raw: string): string | null {
  const d = (raw || "").replace(/\D/g, "").replace(/^0+/, "");
  if (d.length === 10) return "91" + d;
  if (d.length === 12 && d.startsWith("91")) return d;
  if (d.length >= 11 && d.length <= 15) return d;
  return null;
}
