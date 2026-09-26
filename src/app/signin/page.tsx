import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getPortalFor } from "@/lib/portals";
import { prisma } from "@/lib/prisma";
import { SignInForm } from "@/components/auth/signin-form";
import { Card, CardContent } from "@/components/ui/card";
import { SITE } from "@/lib/site";

export const metadata: Metadata = { title: "Sign in" };
export const dynamic = "force-dynamic";

export default async function SignInPage() {
  const session = await auth();
  if (session?.user?.id) {
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { role: true, active: true },
    });
    if (user?.active) redirect(getPortalFor(user.role) ?? "/admin");
  }

  const hasGoogle = Boolean(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET);

  return (
    <div className="flex min-h-dvh items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <p className="text-xs font-semibold tracking-[0.2em] text-primary uppercase">Internal tool</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">{SITE.name} operations</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Staff, volunteers, judges and mentors sign in here.
          </p>
        </div>
        <Card>
          <CardContent className="p-6">
            <SignInForm hasGoogle={hasGoogle} />
          </CardContent>
        </Card>
        <p className="mt-6 text-center text-xs text-muted-foreground">
          Participants don&rsquo;t need an account —{" "}
          <a href="/register" className="text-primary underline-offset-4 hover:underline">
            registration is public
          </a>
          .
        </p>
      </div>
    </div>
  );
}
