"use client";

import { useState } from "react";
import Link from "next/link";
import { QrBadge } from "@/components/teams/qr-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ExternalLink, FileDown, CheckCircle2, QrCode } from "lucide-react";

export type ParticipantQrInfo = {
  id: string;
  name: string;
  role: string;
  ticketId: string | null;
  qrToken: string | null;
  checkedIn: boolean;
  checkedInAt?: string | null;
  pdfFilename: string | null;
};

export function MemberQrCards({
  participants,
  teamCode,
  teamName,
  teamQrToken,
  origin,
}: {
  participants: ParticipantQrInfo[];
  teamCode: string;
  teamName: string;
  teamQrToken: string;
  origin: string;
}) {
  const [selectedId, setSelectedId] = useState<string>(
    participants[0]?.id || "team",
  );

  const selectedParticipant = participants.find((p) => p.id === selectedId);

  const qrValue =
    selectedParticipant
      ? selectedParticipant.qrToken || `${origin}/ticket/${selectedParticipant.ticketId || selectedParticipant.id}`
      : `${origin}/ticket/${teamQrToken}`;

  const ticketUrl = selectedParticipant
    ? `${origin}/ticket/${selectedParticipant.ticketId || selectedParticipant.qrToken}`
    : `${origin}/ticket/${teamQrToken}`;

  return (
    <Card className="border-border">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base font-semibold flex items-center gap-1.5">
              <QrCode className="size-4 text-cyan-400" />
              Participant Check-in QR Codes
            </CardTitle>
            <CardDescription className="text-xs">
              Each attendee has a unique QR code for individual admission scan.
            </CardDescription>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Attendee Selector Pills */}
        <div className="flex flex-wrap gap-1.5 border-b border-border pb-3">
          {participants.map((p) => {
            const isSel = p.id === selectedId;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => setSelectedId(p.id)}
                className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium transition-all ${
                  isSel
                    ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/50 shadow-sm"
                    : "bg-muted/40 text-muted-foreground hover:bg-muted/80 hover:text-foreground border border-transparent"
                }`}
              >
                <span>{p.name}</span>
                {p.role === "LEADER" ? (
                  <span className="text-[9px] bg-cyan-950 px-1 py-0.2 rounded text-cyan-400 border border-cyan-800/40">
                    Lead
                  </span>
                ) : null}
                {p.checkedIn ? (
                  <CheckCircle2 className="size-3 text-emerald-400" />
                ) : null}
              </button>
            );
          })}

          <button
            type="button"
            onClick={() => setSelectedId("team")}
            className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium transition-all ${
              selectedId === "team"
                ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/50 shadow-sm"
                : "bg-muted/40 text-muted-foreground hover:bg-muted/80 hover:text-foreground border border-transparent"
            }`}
          >
            <span>Team Pass</span>
          </button>
        </div>

        {/* Selected Member QR Display */}
        <div className="flex flex-col items-center gap-2.5 text-center">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-sm text-foreground">
              {selectedParticipant ? selectedParticipant.name : `${teamName} Master Pass`}
            </span>
            {selectedParticipant?.role === "LEADER" ? (
              <Badge className="text-[10px] py-0 px-1.5 h-4">Lead</Badge>
            ) : null}
          </div>

          {selectedParticipant?.ticketId ? (
            <div className="font-mono text-xs text-cyan-400 bg-cyan-950/60 border border-cyan-800/50 px-2 py-0.5 rounded">
              Ticket ID: {selectedParticipant.ticketId}
            </div>
          ) : (
            <div className="font-mono text-xs text-muted-foreground">
              Team Code: {teamCode}
            </div>
          )}

          <div className="my-1 rounded-xl p-2 bg-black/40 border border-border">
            <QrBadge value={qrValue} size={168} />
          </div>

          {/* Check-in status for this participant */}
          {selectedParticipant ? (
            <div className="mt-1">
              {selectedParticipant.checkedIn ? (
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-400 bg-emerald-950/40 border border-emerald-800/40 px-2.5 py-0.5 rounded-full">
                  <CheckCircle2 className="size-3" /> Checked in at venue
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-xs text-muted-foreground bg-muted/30 border border-border px-2.5 py-0.5 rounded-full">
                  Not checked in yet
                </span>
              )}
            </div>
          ) : null}

          {/* Action Links */}
          <div className="flex flex-wrap items-center gap-2 pt-1 w-full justify-center">
            <Link
              href={ticketUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg bg-secondary/80 px-3 py-1.5 text-xs font-medium text-foreground hover:bg-secondary border border-border"
            >
              <ExternalLink className="size-3.5" /> Open Ticket Page
            </Link>

            {selectedParticipant ? (
              <a
                href={`/api/admin/participants/${selectedParticipant.id}/pdf`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg bg-cyan-950/40 px-3 py-1.5 text-xs font-medium text-cyan-300 hover:bg-cyan-950/70 border border-cyan-800/50"
              >
                <FileDown className="size-3.5" /> PDF Ticket
              </a>
            ) : null}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
