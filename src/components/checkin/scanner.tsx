"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import jsQR from "jsqr";
import {
  Camera,
  CheckCircle2,
  FileImage,
  Keyboard,
  Loader2,
  ScanLine,
  Upload,
  UserCheck,
  XCircle,
} from "lucide-react";
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

type Participant = {
  id: string;
  name: string;
  email: string;
  role: string;
  ticketId?: string | null;
};

type Result =
  | {
      kind: "ok";
      team: {
        id: string;
        code: string;
        name: string;
        status: string;
        paymentStatus: string;
        college: string;
        track: { name: string };
        participants?: Participant[];
        _count: { participants: number };
      };
      matchedParticipant?: Participant;
      checkpoint: string;
      duplicate: boolean;
      message?: string;
    }
  | { kind: "error"; reason: string; message: string };

export function CheckinScanner({ actorName }: { actorName: string }) {
  const router = useRouter();
  const [checkpoint, setCheckpoint] = useState<Checkpoint>("REGISTRATION");
  const [manual, setManual] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [scanning, setScanning] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const lastScan = useRef<{ value: string; at: number }>({ value: "", at: 0 });

  const submit = useCallback(
    async (payload: string) => {
      const cleanPayload = payload.trim();
      if (!cleanPayload || busy) return;
      setBusy(true);
      setResult(null);
      try {
        const res = await fetch("/api/admin/checkin", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ payload: cleanPayload, checkpoint }),
        });
        const data = await res.json();
        if (!res.ok || !data.ok) {
          setResult({
            kind: "error",
            reason: data.reason ?? "ERROR",
            message: data.error ?? "Scan failed.",
          });
          return;
        }

        setResult({
          kind: "ok",
          team: data.team,
          matchedParticipant: data.matchedParticipant,
          checkpoint: data.checkpoint || checkpoint,
          duplicate: Boolean(data.duplicate),
          message: data.message,
        });

        if (data.duplicate) {
          toast.warning("Already checked in", {
            description: `${data.team.code} has already logged checkpoint ${data.checkpoint || checkpoint}.`,
          });
        } else {
          toast.success(`${data.team.code} checked in!`, {
            description: data.matchedParticipant
              ? `${data.matchedParticipant.name} admitted for ${data.team.name}`
              : `${data.team.name} admitted`,
          });
        }
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
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setScanning(false);
  }, []);

  const startCamera = useCallback(async () => {
    setCameraError(null);
    let stream: MediaStream | null = null;
    try {
      // First attempt environment camera (back camera on phones/tablets)
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } },
      });
    } catch {
      // Fallback for laptops/webcams that don't support facingMode: "environment"
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: true,
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Camera permission denied or camera not found.";
        setCameraError(msg);
        toast.error("Camera unavailable. Enter the code manually or upload a QR image.");
        stopCamera();
        return;
      }
    }

    streamRef.current = stream;
    setScanning(true);
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
      try {
        await videoRef.current.play();
      } catch {
        /* play error handling */
      }
    }
  }, [stopCamera]);

  // Robust client-side QR frame decoder using jsQR
  useEffect(() => {
    if (!scanning) return;
    let rafId = 0;
    let cancelled = false;

    if (!canvasRef.current) {
      canvasRef.current = document.createElement("canvas");
    }
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });

    const scanFrame = () => {
      if (cancelled) return;
      const video = videoRef.current;

      if (video && video.readyState === video.HAVE_ENOUGH_DATA && ctx) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        try {
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          // Try standard scan
          let code = jsQR(imageData.data, imageData.width, imageData.height, {
            inversionAttempts: "dontInvert",
          });
          // If not found, try inverted
          if (!code) {
            code = jsQR(imageData.data, imageData.width, imageData.height, {
              inversionAttempts: "attemptBoth",
            });
          }

          if (code && code.data) {
            const rawVal = code.data.trim();
            const now = Date.now();
            if (lastScan.current.value === rawVal && now - lastScan.current.at < 2500) {
              rafId = requestAnimationFrame(scanFrame);
              return;
            }
            lastScan.current = { value: rawVal, at: now };

            // Beep audio feedback
            try {
              const audioCtx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
              const osc = audioCtx.createOscillator();
              const gain = audioCtx.createGain();
              osc.type = "sine";
              osc.frequency.setValueAtTime(880, audioCtx.currentTime);
              gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
              osc.connect(gain);
              gain.connect(audioCtx.destination);
              osc.start();
              osc.stop(audioCtx.currentTime + 0.15);
            } catch {}

            void submit(rawVal);
            stopCamera();
            return;
          }
        } catch {
          /* ignore frame capture error and keep scanning */
        }
      }

      rafId = requestAnimationFrame(scanFrame);
    };

    rafId = requestAnimationFrame(scanFrame);
    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
    };
  }, [scanning, submit, stopCamera]);

  useEffect(() => () => stopCamera(), [stopCamera]);

  // Decode QR code from an uploaded image file
  const handleImageUpload = (file: File) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (!ctx) return;
        canvas.width = img.width;
        canvas.height = img.height;
        ctx.drawImage(img, 0, 0);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        let code = jsQR(imageData.data, imageData.width, imageData.height, {
          inversionAttempts: "dontInvert",
        });
        if (!code) {
          code = jsQR(imageData.data, imageData.width, imageData.height, {
            inversionAttempts: "attemptBoth",
          });
        }
        if (code && code.data) {
          void submit(code.data);
        } else {
          toast.error("No QR code detected in the uploaded image. Please try another image or type the code.");
        }
      };
      img.src = e.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card className="border-border">
        <CardHeader>
          <CardTitle className="text-base font-semibold flex items-center justify-between">
            <span>Ticket Scanner &amp; Check-in</span>
            <Badge variant="outline" className="text-xs font-normal">
              Logged as: {actorName}
            </Badge>
          </CardTitle>
          <CardDescription className="text-xs">
            Scan attendee ticket PDF QR codes, upload a ticket image, or type any Ticket ID / Team Code.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          <Tabs defaultValue="camera">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="camera" className="text-xs flex items-center gap-1.5">
                <Camera className="size-3.5" /> Camera
              </TabsTrigger>
              <TabsTrigger value="upload" className="text-xs flex items-center gap-1.5">
                <FileImage className="size-3.5" /> Upload QR
              </TabsTrigger>
              <TabsTrigger value="manual" className="text-xs flex items-center gap-1.5">
                <Keyboard className="size-3.5" /> Type Code
              </TabsTrigger>
            </TabsList>

            {/* Live Camera Scanner */}
            <TabsContent value="camera" className="mt-3">
              <div className="relative aspect-4/3 overflow-hidden rounded-lg border border-border bg-black flex items-center justify-center">
                <video
                  ref={videoRef}
                  playsInline
                  muted
                  className="h-full w-full object-cover"
                />

                {!scanning ? (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center bg-black/80">
                    <div className="rounded-full bg-primary/10 p-3 text-primary border border-primary/20">
                      <ScanLine className="size-7" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground">Live Camera Scanner</p>
                      <p className="text-xs text-muted-foreground mt-0.5 max-w-xs">
                        Point your camera at the QR code on any member&rsquo;s admission ticket PDF or mobile pass.
                      </p>
                    </div>
                    {cameraError ? (
                      <p className="text-xs text-destructive bg-destructive/10 px-2.5 py-1 rounded">
                        {cameraError}
                      </p>
                    ) : null}
                    <Button onClick={startCamera} className="bg-primary text-primary-foreground font-semibold text-xs h-8">
                      <Camera className="size-3.5 mr-1.5" /> Start Camera
                    </Button>
                  </div>
                ) : (
                  <>
                    {/* Viewfinder Target */}
                    <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                      <div className="relative size-56 sm:size-64 rounded-xl border-2 border-primary/80 bg-primary/5 shadow-[0_0_24px_rgba(34,211,238,0.25)] flex items-center justify-center">
                        <div className="absolute inset-x-2 top-0 h-0.5 bg-gradient-to-r from-transparent via-cyan-400 to-transparent animate-pulse" />
                        <span className="text-[10px] uppercase tracking-wider text-cyan-400 font-bold bg-black/60 px-2 py-0.5 rounded border border-cyan-800/40">
                          Align QR code here
                        </span>
                      </div>
                    </div>

                    <Button
                      variant="secondary"
                      size="sm"
                      className="absolute top-3 right-3 text-xs bg-black/70 hover:bg-black/90 text-white border border-white/20"
                      onClick={stopCamera}
                    >
                      Stop Camera
                    </Button>
                  </>
                )}
              </div>
            </TabsContent>

            {/* Upload QR Image */}
            <TabsContent value="upload" className="mt-3">
              <div
                className="relative aspect-4/3 rounded-lg border-2 border-dashed border-border/80 bg-muted/20 hover:bg-muted/30 transition-colors flex flex-col items-center justify-center p-6 text-center cursor-pointer"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const file = e.dataTransfer.files[0];
                  if (file) handleImageUpload(file);
                }}
                onClick={() => {
                  const input = document.createElement("input");
                  input.type = "file";
                  input.accept = "image/*";
                  input.onchange = (e) => {
                    const file = (e.target as HTMLInputElement).files?.[0];
                    if (file) handleImageUpload(file);
                  };
                  input.click();
                }}
              >
                <div className="rounded-full bg-secondary p-3 text-muted-foreground mb-2">
                  <Upload className="size-6" />
                </div>
                <p className="text-sm font-medium text-foreground">Drop ticket screenshot or click to upload</p>
                <p className="text-xs text-muted-foreground mt-1 max-w-xs">
                  Upload an image of the ticket QR code (PNG, JPG, WEBP) to decode and check in instantly.
                </p>
                <Button variant="outline" size="sm" className="mt-3 text-xs">
                  Choose Image File
                </Button>
              </div>
            </TabsContent>

            {/* Manual Code Input */}
            <TabsContent value="manual" className="mt-3">
              <form
                className="space-y-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  void submit(manual);
                  setManual("");
                }}
              >
                <div className="space-y-1.5">
                  <Label htmlFor="team-code" className="text-xs text-muted-foreground">
                    Ticket ID, Team Code, or Attendee Email
                  </Label>
                  <Input
                    id="team-code"
                    value={manual}
                    onChange={(e) => setManual(e.target.value)}
                    placeholder="TS26-XXXXXX, AGX-XXXX, or email"
                    autoComplete="off"
                    className="font-mono text-sm"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Accepts Ticket ID (e.g. TS26-BJKFVJ), Team Code (e.g. AGX-RUEB), or Leader/Member Email.
                  </p>
                </div>

                <Button type="submit" disabled={busy || !manual.trim()} className="w-full text-xs h-9">
                  {busy ? <Loader2 className="size-4 animate-spin mr-1.5" /> : <CheckCircle2 className="size-4 mr-1.5" />}
                  Check In Attendee
                </Button>
              </form>
            </TabsContent>
          </Tabs>

          <Separator className="my-3" />

          {/* Checkpoint selector buttons */}
          <div>
            <div className="mb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider text-[10px]">
              Active Checkpoint Station
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {CHECKPOINTS.map((cp) => (
                <button
                  key={cp}
                  type="button"
                  onClick={() => setCheckpoint(cp)}
                  aria-pressed={checkpoint === cp}
                  className={cn(
                    "rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors text-left",
                    checkpoint === cp
                      ? "border-primary bg-primary/10 text-primary shadow-sm"
                      : "border-border text-muted-foreground hover:bg-accent hover:text-foreground",
                  )}
                >
                  {CHECKPOINT_LABEL[cp]}
                </button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Result Card */}
      <Card className="border-border">
        <CardHeader>
          <CardTitle className="text-base font-semibold">Check-in Verification Result</CardTitle>
          <CardDescription className="text-xs">Live desk verification status and admitted team details.</CardDescription>
        </CardHeader>
        <CardContent>
          {busy ? (
            <div className="flex flex-col items-center justify-center gap-2 py-16 text-center text-sm text-muted-foreground">
              <Loader2 className="size-8 animate-spin text-primary" />
              <span>Verifying ticket &amp; logging checkpoint…</span>
            </div>
          ) : !result ? (
            <div className="flex flex-col items-center justify-center gap-2 py-16 text-center text-sm text-muted-foreground">
              <ScanLine className="size-8 opacity-40" />
              <p className="font-medium text-foreground">Waiting for Scan</p>
              <p className="text-xs text-muted-foreground max-w-xs">
                Scan any ticket QR code, upload an image, or type a code to verify admission.
              </p>
            </div>
          ) : result.kind === "ok" ? (
            <div
              className={cn(
                "rounded-lg border p-4 space-y-3",
                result.duplicate
                  ? "border-amber-500/40 bg-amber-500/10 text-amber-200"
                  : "border-emerald-500/40 bg-emerald-500/10 text-emerald-100",
              )}
              role="status"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {result.duplicate ? (
                    <XCircle className="size-5 text-amber-400 shrink-0" />
                  ) : (
                    <CheckCircle2 className="size-5 text-emerald-400 shrink-0" />
                  )}
                  <span className="font-bold text-sm text-foreground">
                    {result.duplicate ? "Already Checked In" : "Admission Verified & Logged"}
                  </span>
                </div>
                <Badge variant={result.duplicate ? "outline" : "default"}>
                  {CHECKPOINT_LABEL[result.checkpoint as Checkpoint] || result.checkpoint}
                </Badge>
              </div>

              {/* Matched Participant Details if individual ticket was scanned */}
              {result.matchedParticipant ? (
                <div className="rounded-md border border-cyan-800/40 bg-cyan-950/40 p-3 text-xs space-y-1">
                  <div className="text-[10px] font-bold text-cyan-400 uppercase tracking-wider flex items-center gap-1">
                    <UserCheck className="size-3.5" /> Admitted Attendee
                  </div>
                  <div className="text-sm font-bold text-white flex items-center gap-2">
                    <span>{result.matchedParticipant.name}</span>
                    {result.matchedParticipant.role === "LEADER" ? (
                      <Badge className="text-[10px] py-0 px-1.5 h-4">Lead</Badge>
                    ) : null}
                  </div>
                  {result.matchedParticipant.ticketId ? (
                    <div className="font-mono text-cyan-300 text-xs">
                      Ticket ID: {result.matchedParticipant.ticketId}
                    </div>
                  ) : null}
                  <div className="text-slate-400 text-[11px]">{result.matchedParticipant.email}</div>
                </div>
              ) : null}

              {/* Team Information */}
              <div className="space-y-1 text-xs text-foreground/90">
                <div className="flex items-baseline justify-between">
                  <span className="text-muted-foreground">Team:</span>
                  <span className="font-bold">{result.team.name}</span>
                </div>
                <div className="flex items-baseline justify-between font-mono">
                  <span className="text-muted-foreground font-sans">Team ID:</span>
                  <span className="text-cyan-400 font-bold">{result.team.code}</span>
                </div>
                <div className="flex items-baseline justify-between">
                  <span className="text-muted-foreground">Track:</span>
                  <span>{result.team.track.name}</span>
                </div>
                <div className="flex items-baseline justify-between">
                  <span className="text-muted-foreground">College:</span>
                  <span className="truncate max-w-[200px]">{result.team.college}</span>
                </div>
                <div className="flex items-baseline justify-between">
                  <span className="text-muted-foreground">Payment:</span>
                  <Badge variant={result.team.paymentStatus === "PAID" ? "default" : "secondary"}>
                    {result.team.paymentStatus}
                  </Badge>
                </div>
              </div>

              {result.message ? (
                <p className="text-xs text-muted-foreground pt-1 border-t border-border/40">
                  {result.message}
                </p>
              ) : null}

              <Button
                variant="outline"
                size="sm"
                className="w-full text-xs mt-2"
                onClick={() => setResult(null)}
              >
                Scan Next Attendee
              </Button>
            </div>
          ) : (
            <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 space-y-2" role="alert">
              <div className="flex items-center gap-2 text-destructive">
                <XCircle className="size-5 shrink-0" />
                <span className="font-bold text-sm">Ticket Not Found / Invalid</span>
              </div>
              <p className="text-xs text-destructive-foreground">{result.message}</p>
              <Button
                variant="outline"
                size="sm"
                className="w-full text-xs mt-2 border-destructive/30"
                onClick={() => setResult(null)}
              >
                Try Again
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
