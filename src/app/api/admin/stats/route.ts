import { NextResponse } from "next/server";
import { guard } from "@/lib/http";
import {
  getDailyRegistrations,
  getDeliveryStats,
  getGeography,
  getHeadline,
  getSponsorStats,
  getStatusMix,
  getTeamSizeMix,
  getTrackStats,
} from "@/lib/analytics";

export const dynamic = "force-dynamic";

/** Single call that fills the whole analytics dashboard. */
export async function GET(req: Request) {
  const auth = await guard("analytics", "read");
  if ("response" in auth) return auth.response;

  const days = Math.min(90, Math.max(7, Number(new URL(req.url).searchParams.get("days") ?? 30)));

  const [headline, daily, tracks, geography, sizes, statusMix, delivery, sponsors] = await Promise.all([
    getHeadline(),
    getDailyRegistrations(days),
    getTrackStats(),
    getGeography(12),
    getTeamSizeMix(),
    getStatusMix(),
    getDeliveryStats(),
    getSponsorStats(),
  ]);

  return NextResponse.json({
    ok: true,
    headline,
    daily,
    tracks,
    geography,
    sizes,
    statusMix,
    delivery,
    sponsors,
  });
}
