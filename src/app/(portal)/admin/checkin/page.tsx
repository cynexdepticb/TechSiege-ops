import type { Metadata } from "next";
import { requireModule } from "@/lib/guards";
import { PageHeader } from "@/components/ui/fields";
import { CheckinScanner } from "@/components/checkin/scanner";
import { getSettings } from "@/lib/settings";
import { formatDateTime } from "@/lib/utils";

export const metadata: Metadata = { title: "Check-in" };
export const dynamic = "force-dynamic";

export default async function CheckinPage() {
  const [actor, settings] = await Promise.all([requireModule("checkin"), getSettings()]);

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <PageHeader
        title="Check-in scanner"
        description="Scan a team's QR code at registration, mentor checkpoints or the submission desk."
        actions={
          <span className="text-xs text-muted-foreground">
            Submission deadline {formatDateTime(settings.submissionDeadline)}
          </span>
        }
      />
      <CheckinScanner actorName={actor.name} />
    </div>
  );
}
