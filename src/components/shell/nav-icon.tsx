import {
  BadgeCheck,
  ChartNoAxesCombined,
  Compass,
  FileText,
  Handshake,
  ListChecks,
  MessagesSquare,
  Scale,
  ScanLine,
  Send,
  Settings,
  Upload,
  UserRound,
  Users,
  type LucideIcon,
} from "lucide-react";

/** Icon registry so nav config can stay a plain serialisable object. */
const REGISTRY: Record<string, LucideIcon> = {
  BadgeCheck,
  ChartNoAxesCombined,
  Compass,
  FileText,
  Handshake,
  ListChecks,
  MessagesSquare,
  Scale,
  ScanLine,
  Send,
  Settings,
  Upload,
  UserRound,
  Users,
};

export function NavIcon({ name, className }: { name: string; className?: string }) {
  const Icon = REGISTRY[name] ?? Compass;
  return <Icon className={className} aria-hidden />;
}
