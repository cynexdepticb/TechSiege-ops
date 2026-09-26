import NextAuth, { type DefaultSession, type NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import { prisma } from "@/lib/prisma";
import { fakeVerify, verifyPassword } from "@/lib/password";
import { AUTH_INVALID_MESSAGE } from "@/lib/constants";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: string;
      vertical: string | null;
    } & DefaultSession["user"];
  }
}

const hasGoogle = Boolean(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET);

export const authConfig = {
  trustHost: true,
  secret: process.env.AUTH_SECRET,
  pages: {
    signIn: "/signin",
    error: "/signin",
  },
  session: { strategy: "jwt", maxAge: 60 * 60 * 12 },
  providers: [
    Credentials({
      name: "Email and password",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(raw) {
        const email = typeof raw?.email === "string" ? raw.email.trim().toLowerCase() : "";
        const password = typeof raw?.password === "string" ? raw.password : "";
        if (!email || !password) return null;

        const user = await prisma.user.findUnique({ where: { email } });
        if (!user?.passwordHash || !user.active) {
          // Still burn CPU so a missing account and a wrong password take
          // the same amount of time.
          fakeVerify();
          return null;
        }
        if (!verifyPassword(password, user.passwordHash)) return null;

        await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          vertical: user.vertical,
        };
      },
    }),
    ...(hasGoogle ? [Google] : []),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id as string;
        token.role = (user as { role?: string }).role ?? "TEAM_LEAD";
        token.vertical = (user as { vertical?: string | null }).vertical ?? null;
        return token;
      }
      // Refresh role/vertical from the DB so a demotion takes effect immediately.
      if (token.id) {
        const row = await prisma.user.findUnique({
          where: { id: token.id as string },
          select: { role: true, vertical: true, active: true, name: true },
        });
        if (!row?.active) {
          token.invalid = true;
          return token;
        }
        token.role = row.role;
        token.vertical = row.vertical;
      }
      return token;
    },
    async session({ session, token }) {
      // A deactivated account keeps a structurally valid session, but with no
      // user — every server-side guard checks `session.user` first.
      if (token.invalid || !token.id) {
        return { ...session, user: undefined } as unknown as typeof session;
      }
      session.user.id = token.id as string;
      session.user.role = token.role as string;
      session.user.vertical = (token.vertical as string | null) ?? null;
      return session;
    },
  },
} satisfies NextAuthConfig;

export const { handlers, auth, signIn, signOut } = NextAuth(authConfig);

/** Convenience: the signed-in user, or null. */
export async function currentUser() {
  const session = await auth();
  return session?.user ?? null;
}

export { AUTH_INVALID_MESSAGE };
