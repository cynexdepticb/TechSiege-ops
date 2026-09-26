"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, CheckCircle2, Keyboard, Loader2, ScanLine, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/primitives";
import { Separator } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";
import { CHECKPOINT_LABEL } from "@/lib/authz-lite";
import { toast } from "sonner";

const CHECKPOINTS = ["REGISTRATION", "ROUND_1", "ROUND_2", "MIDNIGHT", "SUBMISSION"] as const;
type Checkpoint = (typeof CHECKPOINTS)[number];

type Result =
  | { kind: "ok"; team: { code: string; name: string; status: string; track: { name: string }; _count: { participants: number } }; duplicate: boolean; message?: string }
  | { kind: "error"; reason: string; message: string };

export function CheckinScanner({ actorName }: { actorName: string }) {
  const router = useRouter();
  const [checkpoint, setCheckpoint] = useState<Checkpoint>("REGISTRATION");
  const [manual, setManual] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [scanning, setScanning] = useState(false);
  const lastScan = useRef<{ value: string; at: number }>({ value: "", at: 0 });

  const submit = useCallback(
    async (payload: string) => {
      if (!payload.trim() || busy) return;
      setBusy(true);
      setResult(null);
      try {
        const res = await fetch("/api/admin/checkin", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ payload: payload.trim(), checkpoint }),
        });
        const data = await res.json();
        if (!res.ok || !data.ok) {
          setResult({ kind: "error", reason: data.reason ?? "ERROR", message: data.error ?? "Scan failed." });
          return;
        }
        setResult({ kind: "ok", team: data.team, duplicate: Boolean(data.duplicate), message: data.message });
        toast.success(data.duplicate ? "Already logged" : `${data.team.code} checked in`);
        router.refresh();
      } catch {
        setResult({ kind: "error", reason: "NETWORK", message: "Network error. Try again." });
      } finally {
        setBusy(false);
      }
    },
    [busy, checkpoint, router],
  );

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setScanning(false);
  }, []);

  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
      });
      streamRef.current = stream;
      setScanning(true);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
    } catch {
      toast.error("Camera unavailable. Use the manual code field instead.");
      stopCamera();
    }
  }, [stopCamera]);

  // BarcodeDetector where supported; otherwise the manual field is the path.
  useEffect(() => {
    if (!scanning) return;
    let raf = 0;
    let cancelled = false;

    const detect = async () => {
      if (cancelled) return;
      const video = videoRef.current;
      const Detector = (
        window as unknown as { BarcodeDetector?: new (o?: DetectedBarcodeOptions) => BarcodeDetector }
      ).BarcodeDetector;
      if (video && video.readyState >= 2 && Detector) {
        try {
          const detector = new Detector({ formats: ["qr_code"] });
          const codes = await detector.detect(video);
          const value = codes[0]?.rawValue;
          if (value) {
            const now = Date.now();
            // Ignore the same code within a 2.5s window so it fires once.
            if (lastScan.current.value === value && now - lastScan.current.at < 2500) {
              raf = requestAnimationFrame(detect);
              return;
            }
            lastScan.current = { value, at: now };
            void submit(value);
            stopCamera();
            return;
          }
        } catch {
          /* keep scanning */
        }
      }
      raf = requestAnimationFrame(detect);
    };

    raf = requestAnimationFrame(detect);
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
    };
  }, [scanning, submit, stopCamera]);

  useEffect(() => () => stopCamera(), [stopCamera]);

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Scan a team QR code</CardTitle>
          <CardDescription>
            Signed in as {actorName}. Each scan is logged against your name.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="camera">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="camera">
                <Camera /> Camera
              </TabsTrigger>
              <TabsTrigger value="manual">
                <Keyboard /> Type code
              </TabsTrigger>
            </TabsList>

            <TabsContent value="camera">
              <div className="relative aspect-4/3 overflow-hidden rounded-lg border border-border bg-black">
                <video ref={videoRef} playsInline muted className="h-full w-full object-cover" />
                {!scanning ? (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center">
                    <ScanLine className="size-8 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">
                      Camera scanning uses the browser&rsquo;s built-in barcode detector where available. If it does
                      not start, enter the team code instead.
                    </p>
                    <Button onClick={startCamera}>
                      <Camera /> Start camera
                    </Button>
                  </div>
                ) : (
                  <>
                    <div className="pointer-events-none absolute inset-x-8 top-1/2 h-px bg-primary shadow-[0_0_12px_2px] shadow-primary/60" />
                    <Button
                      variant="secondary"
                      size="sm"
                      className="absolute top-3 right-3"
                      onClick={stopCamera}
                    >
                      Stop
                    </Button>
                  </>
                )}
              </div>
            </TabsContent>

            <TabsContent value="manual">
              <form
                className="space-y-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  void submit(manual);
                  setManual("");
                }}
              >
                <div className="space-y-1.5">
                  <Label htmlFor="team-code">Team code or QR payload</Label>
                  <Input
                    id="team-code"
                    value={manual}
                    onChange={(e) => setManual(e.target.value)}
                    placeholder="AGX-4F2K"
                    autoComplete="off"
                    className="font-mono"
                  />
                </div>
                <Button type="submit" disabled={busy || !manual.trim()} className="w-full">
                  {busy ? <Loader2 className="animate-spin" /> : <CheckCircle2 />} Log checkpoint
                </Button>
              </form>
            </TabsContent>
          </Tabs>

          <Separator className="my-5" />

          <fieldset>
            <legend className="mb-2 text-sm font-medium">Checkpoint</legend>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {CHECKPOINTS.map((cp) => (
                <button
                  key={cp}
                  type="button"
                  onClick={() => setCheckpoint(cp)}
                  aria-pressed={checkpoint === cp}
                  className={cn(
                    "rounded-md border px-3 py-2 text-sm transition-colors",
                    checkpoint === cp
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border text-muted-foreground hover:bg-accent hover:text-foreground",
                  )}
                >
                  {CHECKPOINT_LABEL[cp]}
                </button>
              ))}
            </div>
          </fieldset>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Result</CardTitle>
          <CardDescription>Feedback for the volunteer at the desk</CardDescription>
        </CardHeader>
        <CardContent>
          {busy ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Looking up the team…
            </div>
          ) : !result ? (
            <div className="flex flex-col items-center gap-2 py-10 text-center text-sm text-muted-foreground">
              <ScanLine className="size-7 opacity-40" />
              Scan or type a code to see the result here.
            </div>
          ) : result.kind === "ok" ? (
            <div
              className={cn(
                "rounded-lg border p-4",
                result.duplicate
                  ? "border-warning/40 bg-warning/10"
                  : "border-success/40 bg-success/10",
              )}
              role="status"
            >
              <div className="flex items-center gap-2">
                {result.duplicate ? (
                  <XCircle className="size-5 text-warning" />
                ) : (
                  <CheckCircle2 className="size-5 text-success" />
                )}
                <span className="font-semibold">{result.duplicate ? "Already logged" : "Checkpoint logged"}</span>
              </div>
              <p className="mt-2 font-mono text-sm text-muted-foreground">{result.team.code}</p>
              <p className="text-lg font-medium">{result.team.name}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Badge variant="muted">{result.team.track.name}</Badge>
                <Badge variant="muted">{result.team._count.participants} members</Badge>
                <Badge variant={result.team.status === "DISQUALIFIED" ? "destructive" : "default"}>
                  {result.team.status.replace(/_/g, " ").toLowerCase()}
                </Badge>
              </div>
            </div>
          ) : (
            <div
              className="rounded-lg border border-destructive/40 bg-destructive/10 p-4"
              role="alert"
            >
              <div className="flex items-center gap-2">
                <XCircle className="size-5 text-destructive" />
                <span className="font-semibold">Not logged</span>
              </div>
              <p className="mt-2 text-sm">{result.message}</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
