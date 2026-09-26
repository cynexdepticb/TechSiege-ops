import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getPortalFor } from "@/lib/portals";

export const dynamic = "force-dynamic";

export default async function Root() {
  const session = await auth();
  if (session?.user?.id) {
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { role: true, active: true },
    });
    if (user?.active) redirect(getPortalFor(user.role) ?? "/admin");
  }
  redirect("/signin");
}
