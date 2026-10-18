import { useEffect, useRef, useState } from "react";
import { Mic, MicOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "sonner";

type Recognition = {
  lang: string; continuous: boolean; interimResults: boolean;
  onresult: ((event: { results: { [key: number]: { [key: number]: { transcript: string } } } }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void; stop: () => void; abort: () => void;
};
type SpeechWindow = Window & { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };

export function VoiceSearch({ onResult }: { onResult: (text: string) => void }) {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [language, setLanguage] = useState("en-IN");
  const recognition = useRef<Recognition | null>(null);
  useEffect(() => {
    const w = window as SpeechWindow;
    setSupported(!!(w.SpeechRecognition || w.webkitSpeechRecognition));
    return () => {
      if (recognition.current) {
        recognition.current.onend = null;
        recognition.current.onresult = null;
        recognition.current.onerror = null;
        recognition.current.abort();
      }
    };
  }, []);
  const toggle = () => {
    if (listening) { recognition.current?.stop(); return; }
    const w = window as SpeechWindow;
    const Constructor = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!Constructor) return;
    const next = new Constructor();
    next.lang = language;
    next.continuous = false;
    next.interimResults = false;
    next.onresult = (event) => {
      const text = event.results[0]?.[0]?.transcript.trim();
      if (text) onResult(text.replace(/[.!?]+$/, ""));
    };
    next.onerror = (event) => {
      setListening(false);
      if (event.error === "aborted") return;
      toast.error(event.error === "not-allowed" ? "Allow microphone access to search by voice." : event.error === "no-speech" ? "No speech heard. Try again." : "Voice search unavailable. Check your connection or type the product name.");
    };
    next.onend = () => setListening(false);
    recognition.current = next;
    try { next.start(); setListening(true); }
    catch { setListening(false); toast.error("Couldn't start the microphone. Try again."); }
  };
  return (
    <div className="flex gap-1 items-center">
      <TooltipProvider><Tooltip><TooltipTrigger asChild>
        <Button type="button" size="icon" variant={listening ? "destructive" : "outline"} className="size-11 shrink-0" disabled={!supported} aria-label={listening ? "Stop voice search" : "Start voice search"} aria-pressed={listening} onClick={toggle}>
          {listening ? <MicOff /> : <Mic />}
        </Button>
      </TooltipTrigger><TooltipContent>{!supported ? "Voice search isn't supported in this browser" : listening ? "Listening — tap to stop" : "Search by voice"}</TooltipContent></Tooltip></TooltipProvider>
      {supported && <Select value={language} onValueChange={setLanguage} disabled={listening}>
        <SelectTrigger aria-label="Voice language" className="w-24 h-11"><SelectValue /></SelectTrigger>
        <SelectContent><SelectItem value="en-IN">English</SelectItem><SelectItem value="ml-IN">Malayalam</SelectItem><SelectItem value="hi-IN">Hindi</SelectItem><SelectItem value="ta-IN">Tamil</SelectItem><SelectItem value="kn-IN">Kannada</SelectItem></SelectContent>
      </Select>}
      <span role="status" className="sr-only">{listening ? "Listening" : ""}</span>
    </div>
  );
}