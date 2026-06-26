import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

// Supported formats — broadened to cover retail 1D, postal, and 2D codes.
export const SUPPORTED_FORMAT_NAMES = [
  "EAN_13", "EAN_8", "UPC_A", "UPC_E", "UPC_EAN_EXTENSION",
  "CODE_128", "CODE_93", "CODE_39", "CODABAR", "ITF", "RSS_14", "RSS_EXPANDED",
  "QR_CODE", "DATA_MATRIX", "AZTEC", "PDF_417", "MAXICODE",
] as const;

export const FORMAT_LABEL: Record<string, string> = {
  EAN_13: "EAN-13", EAN_8: "EAN-8", UPC_A: "UPC-A", UPC_E: "UPC-E", UPC_EAN_EXTENSION: "UPC/EAN ext.",
  CODE_128: "Code 128", CODE_93: "Code 93", CODE_39: "Code 39", CODABAR: "Codabar", ITF: "ITF",
  RSS_14: "GS1 DataBar", RSS_EXPANDED: "GS1 DataBar Exp.",
  QR_CODE: "QR", DATA_MATRIX: "Data Matrix", AZTEC: "Aztec", PDF_417: "PDF417", MAXICODE: "MaxiCode",
};

type ScannerProps = {
  /** active=false stops the camera */
  active: boolean;
  onScan: (code: string, format: string) => void;
  /** If true, scanner keeps running after a hit — for bulk mode */
  continuous?: boolean;
  onCameraError?: () => void;
};

export function ScannerPanel({ active, onScan, continuous, onCameraError }: ScannerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = useState<string | undefined>(undefined);
  const [manual, setManual] = useState("");
  const [lastFormat, setLastFormat] = useState<string | null>(null);
  const [lastCode, setLastCode] = useState<string | null>(null);
  const lastHitRef = useRef<{ code: string; t: number } | null>(null);

  useEffect(() => {
    if (!active) {
      setLastFormat(null);
      setLastCode(null);
      lastHitRef.current = null;
      return;
    }
    let controls: { stop: () => void } | null = null;
    let cancelled = false;

    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          toast.error("Camera not supported on this device");
          return;
        }
        const { BrowserMultiFormatReader } = await import("@zxing/browser");
        const { DecodeHintType, BarcodeFormat } = await import("@zxing/library");
        const formats = SUPPORTED_FORMAT_NAMES
          .map((n) => (BarcodeFormat as unknown as Record<string, number>)[n])
          .filter((v) => typeof v === "number");
        const hints = new Map();
        hints.set(DecodeHintType.POSSIBLE_FORMATS, formats);
        hints.set(DecodeHintType.TRY_HARDER, true);
        const reader = new BrowserMultiFormatReader(hints);

        try {
          const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
          stream.getTracks().forEach((t) => t.stop());
        } catch {
          toast.error("Camera permission denied");
          onCameraError?.();
          return;
        }
        const cams = await BrowserMultiFormatReader.listVideoInputDevices();
        if (cancelled) return;
        setDevices(cams);
        const preferred = cams.find((c) => /back|rear|environment/i.test(c.label))?.deviceId
          ?? deviceId
          ?? cams[0]?.deviceId;
        setDeviceId(preferred);
        if (!videoRef.current) return;

        controls = await reader.decodeFromVideoDevice(
          preferred,
          videoRef.current,
          (result, _err, ctrl) => {
            if (!result) return;
            const text = result.getText();
            const fmt = BarcodeFormat[result.getBarcodeFormat()] ?? "Unknown";
            const now = Date.now();
            if (lastHitRef.current && lastHitRef.current.code === text && now - lastHitRef.current.t < 1500) return;
            lastHitRef.current = { code: text, t: now };
            setLastFormat(fmt);
            setLastCode(text);
            if (!continuous) ctrl.stop();
            onScan(text, fmt);
          },
        );
      } catch (e) {
        console.error("scanner error", e);
        toast.error("Camera unavailable");
        onCameraError?.();
      }
    })();

    return () => {
      cancelled = true;
      controls?.stop();
    };
  }, [active, deviceId, onScan, onCameraError, continuous]);

  return (
    <div className="space-y-3">
      <div className="w-full aspect-[4/3] bg-black rounded-md overflow-hidden relative">
        <video ref={videoRef} className="w-full h-full object-cover" muted playsInline />
        {lastFormat && (
          <div className="absolute top-2 right-2 px-2 py-0.5 rounded bg-primary text-primary-foreground text-xs font-medium">
            {FORMAT_LABEL[lastFormat] ?? lastFormat}
          </div>
        )}
        {continuous && lastCode && (
          <div className="absolute bottom-2 left-2 right-2 px-2 py-1 rounded bg-black/70 text-white text-xs font-mono truncate">
            ✓ {lastCode}
          </div>
        )}
      </div>
      {devices.length > 1 && (
        <Select value={deviceId} onValueChange={setDeviceId}>
          <SelectTrigger className="h-9"><SelectValue placeholder="Camera" /></SelectTrigger>
          <SelectContent>
            {devices.map((d) => (
              <SelectItem key={d.deviceId} value={d.deviceId}>{d.label || `Camera ${d.deviceId.slice(0, 6)}`}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      <p className="text-xs text-muted-foreground text-center">
        {continuous ? "Keep scanning — each new code is captured" : "Point the camera at the barcode"}
      </p>
      <div className="border-t pt-3 space-y-2">
        <Label className="text-xs">Or enter barcode manually</Label>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const code = manual.trim();
            if (!code) return;
            onScan(code, "MANUAL");
            setManual("");
          }}
        >
          <Input value={manual} onChange={(e) => setManual(e.target.value)} placeholder="Type or paste barcode" />
          <Button type="submit">Add</Button>
        </form>
      </div>
    </div>
  );
}

type Props = {
  open: boolean;
  onClose: () => void;
  onScan: (code: string, format: string) => void;
  continuous?: boolean;
  title?: string;
};

export function CameraScanner({ open, onClose, onScan, continuous, title }: Props) {
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>{title ?? "Scan barcode"}</DialogTitle></DialogHeader>
        <ScannerPanel
          active={open}
          continuous={continuous}
          onCameraError={onClose}
          onScan={(code, fmt) => {
            if (!continuous) onClose();
            onScan(code, fmt);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

