import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn, formatNumber } from "@/lib/utils";

export function StatCard({
  label,
  value,
  hint,
  trend,
  tone = "default",
  className,
}: {
  label: string;
  value: number | string;
  hint?: string;
  trend?: { value: number; label: string };
  tone?: "default" | "success" | "warning" | "destructive";
  className?: string;
}) {
  return (
    <Card className={className}>
      <CardContent className="p-5">
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{label}</p>
        <p
          className={cn(
            "mt-2 text-3xl font-semibold tracking-tight tabular-nums",
            tone === "success" && "text-success",
            tone === "warning" && "text-warning",
            tone === "destructive" && "text-destructive",
          )}
        >
          {typeof value === "number" ? formatNumber(value) : value}
        </p>
        {trend ? (
          <div className="mt-2 flex items-center gap-2">
            <Badge variant={trend.value >= 0 ? "success" : "destructive"}>
              {trend.value >= 0 ? "+" : ""}
              {trend.value}
            </Badge>
            <span className="text-xs text-muted-foreground">{trend.label}</span>
          </div>
        ) : hint ? (
          <p className="mt-2 text-xs text-muted-foreground">{hint}</p>
        ) : null}
      </CardContent>
    </Card>
  );
}

/** Thin labelled progress bar used for capacity and checkpoint completion. */
export function MeterBar({
  label,
  value,
  max,
  tone = "primary",
  hint,
}: {
  label: string;
  value: number;
  max: number;
  tone?: "primary" | "success" | "warning" | "destructive";
  hint?: string;
}) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium tabular-nums">
          {formatNumber(value)}
          <span className="text-muted-foreground"> / {formatNumber(max)}</span>
        </span>
      </div>
      <div
        className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-label={label}
      >
        <div
          className={cn(
            "h-full rounded-full transition-[width] duration-700",
            tone === "primary" && "bg-primary",
            tone === "success" && "bg-success",
            tone === "warning" && "bg-warning",
            tone === "destructive" && "bg-destructive",
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
      {hint ? <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
