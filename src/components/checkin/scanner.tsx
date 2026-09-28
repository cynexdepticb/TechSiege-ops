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
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type Participant = {
  id: string;
  name: string;
  email: string;
  role: string;
  ticketId?: string | null;
  checkedIn?: boolean;
  checkedInAt?: string | null;
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
      duplicate: boolean;
      message?: string;
    }
  | { kind: "error"; reason: string; message: string };

export function CheckinScanner({ actorName }: { actorName: string }) {
  const router = useRouter();
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
      try {
        const res = await fetch("/api/admin/checkin", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ payload: cleanPayload }),
        });
        const data = await res.json();
        if (!res.ok || !data.ok) {
          setResult({
            kind: "error",
            reason: data.reason ?? "ERROR",
            message: data.error ?? "Ticket scan failed. Please check the code and try again.",
          });
          toast.error(data.error ?? "Check-in failed.");
          return;
        }

        setResult({
          kind: "ok",
          team: data.team,
          matchedParticipant: data.matchedParticipant,
          duplicate: Boolean(data.duplicate),
          message: data.message,
        });

        if (data.duplicate) {
          toast.warning(
            data.matchedParticipant
              ? `${data.matchedParticipant.name} is already checked in`
              : "Already checked in",
            {
              description: data.message,
            },
          );
        } else {
          toast.success(
            data.matchedParticipant
              ? `${data.matchedParticipant.name} admitted!`
              : `${data.team.name} admitted!`,
            {
              description: data.message || "Admission verified and checked in.",
            },
          );
        }
        router.refresh();
      } catch {
        setResult({ kind: "error", reason: "NETWORK", message: "Network error. Try again." });
        toast.error("Network error during check-in.");
      } finally {
        setBusy(false);
      }
    },
    [busy, router],
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

  // Client-side QR frame decoder using jsQR (Continuous scanning - no manual restart needed)
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
          let code = jsQR(imageData.data, imageData.width, imageData.height, {
            inversionAttempts: "dontInvert",
          });
          if (!code) {
            code = jsQR(imageData.data, imageData.width, imageData.height, {
              inversionAttempts: "attemptBoth",
            });
          }

          if (code && code.data) {
            const rawVal = code.data.trim();
            const now = Date.now();
            // Debounce: don't re-submit identical QR code within 3 seconds
            if (lastScan.current.value === rawVal && now - lastScan.current.at < 3000) {
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

            // Submit check-in — keep camera scanning for the next attendee in line!
            void submit(rawVal);
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
  }, [scanning, submit]);

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
            <span>Event Check-in Scanner</span>
            <Badge variant="outline" className="text-xs font-normal">
              Staff: {actorName}
            </Badge>
          </CardTitle>
          <CardDescription className="text-xs">
            Scan attendee ticket PDF QR code, upload an image, or type Ticket ID / Team Code.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          <Tabs defaultValue="camera">
            <TabsList className="grid w-full grid-cols-3 h-10">
              <TabsTrigger value="camera" className="text-xs flex items-center justify-center gap-1 sm:gap-1.5 px-1 sm:px-3">
                <Camera className="size-3.5 shrink-0" />
                <span>Camera</span>
              </TabsTrigger>
              <TabsTrigger value="manual" className="text-xs flex items-center justify-center gap-1 sm:gap-1.5 px-1 sm:px-3">
                <Keyboard className="size-3.5 shrink-0" />
                <span>Type Code</span>
              </TabsTrigger>
              <TabsTrigger value="upload" className="text-xs flex items-center justify-center gap-1 sm:gap-1.5 px-1 sm:px-3">
                <FileImage className="size-3.5 shrink-0" />
                <span>Upload</span>
              </TabsTrigger>
            </TabsList>

            {/* Live Continuous Camera Scanner */}
            <TabsContent value="camera" className="mt-3">
              <div className="relative aspect-4/3 overflow-hidden rounded-lg border border-border bg-black flex items-center justify-center">
                <video
                  ref={videoRef}
                  playsInline
                  muted
                  className="h-full w-full object-cover"
                />

                {!scanning ? (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-2.5 p-4 sm:p-6 text-center bg-black/80">
                    <div className="rounded-full bg-primary/10 p-2.5 sm:p-3 text-primary border border-primary/20">
                      <ScanLine className="size-6 sm:size-7" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground">Live Camera Scanner</p>
                      <p className="text-xs text-muted-foreground mt-0.5 max-w-xs">
                        Point camera at attendee ticket QR code. Scans instantly and admits attendee.
                      </p>
                    </div>
                    {cameraError ? (
                      <p className="text-xs text-destructive bg-destructive/10 px-2.5 py-1 rounded max-w-xs">
                        {cameraError}
                      </p>
                    ) : null}
                    <Button onClick={startCamera} className="bg-primary text-primary-foreground font-semibold text-xs h-8.5 px-4 touch-manipulation">
                      <Camera className="size-3.5 mr-1.5" /> Start Camera
                    </Button>
                  </div>
                ) : (
                  <>
                    {/* Viewfinder Target */}
                    <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-4">
                      <div className="relative size-44 sm:size-60 rounded-xl border-2 border-primary/80 bg-primary/5 shadow-[0_0_24px_rgba(34,211,238,0.25)] flex items-center justify-center">
                        <div className="absolute inset-x-2 top-0 h-0.5 bg-gradient-to-r from-transparent via-cyan-400 to-transparent animate-pulse" />
                        <span className="text-[9px] sm:text-[10px] uppercase tracking-wider text-cyan-400 font-bold bg-black/70 px-2 py-0.5 rounded border border-cyan-800/40">
                          Align ticket QR code
                        </span>
                      </div>
                    </div>

                    <div className="absolute top-2 left-2 sm:top-3 sm:left-3 bg-black/80 px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-md text-[10px] sm:text-[11px] text-cyan-300 border border-cyan-500/30 flex items-center gap-1.5">
                      <span className="size-2 rounded-full bg-emerald-400 animate-ping" />
                      Live scanning active
                    </div>

                    <Button
                      variant="secondary"
                      size="sm"
                      className="absolute top-2 right-2 sm:top-3 sm:right-3 text-[11px] sm:text-xs h-7 sm:h-8 bg-black/80 hover:bg-black/95 text-white border border-white/20 touch-manipulation"
                      onClick={stopCamera}
                    >
                      Stop Camera
                    </Button>
                  </>
                )}
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
                    placeholder="TS26-XXXXXX, AGX-XXXX, or attendee@example.com"
                    autoComplete="off"
                    className="font-mono text-sm"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Accepts individual Ticket ID (e.g. TS26-BJKFVJ), Team Code (e.g. AGX-RUEB), or Member Email.
                  </p>
                </div>

                <Button type="submit" disabled={busy || !manual.trim()} className="w-full text-xs h-9">
                  {busy ? <Loader2 className="size-4 animate-spin mr-1.5" /> : <CheckCircle2 className="size-4 mr-1.5" />}
                  Check In Attendee
                </Button>
              </form>
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
                <p className="text-sm font-medium text-foreground">Drop ticket QR image or click to upload</p>
                <p className="text-xs text-muted-foreground mt-1 max-w-xs">
                  Upload an image of the ticket QR code (PNG, JPG, WEBP) to check in instantly.
                </p>
                <Button variant="outline" size="sm" className="mt-3 text-xs">
                  Choose Image File
                </Button>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Result Card */}
      <Card className="border-border">
        <CardHeader>
          <CardTitle className="text-base font-semibold">Admission Verification Result</CardTitle>
          <CardDescription className="text-xs">
            Live desk check-in confirmation and attendee details.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {busy ? (
            <div className="flex flex-col items-center justify-center gap-2 py-16 text-center text-sm text-muted-foreground">
              <Loader2 className="size-8 animate-spin text-primary" />
              <span>Verifying ticket &amp; checking in…</span>
            </div>
          ) : !result ? (
            <div className="flex flex-col items-center justify-center gap-2 py-16 text-center text-sm text-muted-foreground">
              <ScanLine className="size-8 opacity-40" />
              <p className="font-medium text-foreground">Ready to Scan</p>
              <p className="text-xs text-muted-foreground max-w-xs">
                Scan attendee ticket QR code, upload an image, or type code to check in.
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
                    <UserCheck className="size-5 text-amber-400 shrink-0" />
                  ) : (
                    <CheckCircle2 className="size-5 text-emerald-400 shrink-0" />
                  )}
                  <span className="font-bold text-sm text-foreground">
                    {result.duplicate ? "Already Checked In" : "Checked In & Admitted"}
                  </span>
                </div>
                <Badge
                  variant={result.duplicate ? "outline" : "default"}
                  className={result.duplicate ? "border-amber-400 text-amber-300" : "bg-emerald-600 text-white"}
                >
                  {result.duplicate ? "Duplicate Scan" : "Admitted"}
                </Badge>
              </div>

              {/* Matched Participant Details if individual ticket was scanned */}
              {result.matchedParticipant ? (
                <div className="rounded-md border border-cyan-800/40 bg-cyan-950/40 p-3 text-xs space-y-1">
                  <div className="flex items-center justify-between">
                    <div className="text-[10px] font-bold text-cyan-400 uppercase tracking-wider flex items-center gap-1">
                      <UserCheck className="size-3.5" /> Admitted Attendee
                    </div>
                    {result.matchedParticipant.checkedIn ? (
                      <span className="text-[10px] font-semibold text-emerald-400 bg-emerald-950/60 border border-emerald-800/60 px-1.5 py-0.2 rounded">
                        {result.duplicate ? "Previously Checked In" : "Checked In Now"}
                      </span>
                    ) : null}
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
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-muted-foreground shrink-0">College:</span>
                  <span className="truncate max-w-[140px] sm:max-w-[220px] text-right">{result.team.college}</span>
                </div>
                <div className="flex items-baseline justify-between">
                  <span className="text-muted-foreground">Payment:</span>
                  <Badge variant={result.team.paymentStatus === "PAID" ? "default" : "secondary"}>
                    {result.team.paymentStatus === "PAID" ? "Verified" : result.team.paymentStatus}
                  </Badge>
                </div>
              </div>

              {/* Member Attendance Roster */}
              {result.team.participants && result.team.participants.length > 0 ? (
                <div className="border-t border-border/40 pt-2 space-y-1">
                  <div className="flex items-center justify-between text-[11px] font-medium text-muted-foreground">
                    <span>Team Attendance</span>
                    <span>
                      {result.team.participants.filter((p) => p.checkedIn).length} / {result.team.participants.length} present
                    </span>
                  </div>
                  <div className="space-y-1">
                    {result.team.participants.map((p) => (
                      <div
                        key={p.id}
                        className={`flex items-center justify-between rounded px-2 py-1 text-[11px] ${
                          p.checkedIn
                            ? "bg-emerald-950/30 text-emerald-300 border border-emerald-800/30"
                            : "bg-muted/20 text-muted-foreground"
                        }`}
                      >
                        <div className="flex items-center gap-1.5">
                          {p.checkedIn ? (
                            <CheckCircle2 className="size-3 text-emerald-400" />
                          ) : (
                            <span className="size-2 rounded-full bg-muted-foreground/30 inline-block ml-0.5" />
                          )}
                          <span className={p.checkedIn ? "font-medium text-foreground" : ""}>
                            {p.name}
                          </span>
                        </div>
                        <span className="font-mono text-[10px] opacity-75">
                          {p.ticketId || (p.checkedIn ? "Checked in" : "Awaiting")}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {result.message ? (
                <p className="text-xs text-muted-foreground pt-1 border-t border-border/40">
                  {result.message}
                </p>
              ) : null}

              <div className="pt-2 text-center">
                <span className="text-[11px] text-muted-foreground">
                  Scanner is active — present next attendee ticket to scan.
                </span>
              </div>
            </div>
          ) : (
            <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 space-y-2" role="alert">
              <div className="flex items-center gap-2 text-destructive">
                <XCircle className="size-5 shrink-0" />
                <span className="font-bold text-sm">Ticket Not Found / Invalid</span>
              </div>
              <p className="text-xs text-destructive-foreground">{result.message}</p>
              <div className="pt-2 text-center">
                <span className="text-[11px] text-muted-foreground">
                  Scanner is active — present next attendee ticket to scan.
                </span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
