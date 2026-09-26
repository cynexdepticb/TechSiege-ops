import type { Role } from "@/generated/prisma/enums";

/** Roles that land somewhere other than /admin. */
export function getPortalFor(role: Role): string | null {
  switch (role) {
    case "JUDGE":
      return "/judge";
    case "MENTOR":
      return "/mentor";
    case "VOLUNTEER":
      return "/checkin";
    default:
      return null;
  }
}
