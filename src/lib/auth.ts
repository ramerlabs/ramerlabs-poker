import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authConfig } from "@/lib/auth.config";
import { decryptTotpSecret, verifyTotpCode } from "@/lib/totp";
import { loginPasswordSchema } from "@/lib/password";
import { checkRateLimit } from "@/lib/rate-limit";

const credentialsSchema = z.object({
  email: z.string().email(),
  password: loginPasswordSchema,
  totp: z.string().optional(),
});

const ROLE_REFRESH_MS = 5 * 60 * 1000;

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  callbacks: {
    ...authConfig.callbacks,
    async jwt({ token, user, trigger, session }) {
      if (user) {
        token.id = user.id!;
        token.role = (user as { role?: string }).role ?? "USER";
        token.name = user.name;
        token.roleCheckedAt = Date.now();
      }
      if (trigger === "update" && session?.name != null) {
        token.name = session.name as string;
      }

      const checkedAt = (token.roleCheckedAt as number | undefined) ?? 0;
      if (token.id && Date.now() - checkedAt > ROLE_REFRESH_MS) {
        const dbUser = await prisma.user.findUnique({
          where: { id: token.id as string },
          select: { role: true, name: true },
        });
        if (dbUser) {
          token.role = dbUser.role;
          if (dbUser.name) token.name = dbUser.name;
        }
        token.roleCheckedAt = Date.now();
      }

      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = (token.role as "USER" | "ADMIN") ?? "USER";
        if (token.name) session.user.name = token.name as string;
      }
      return session;
    },
  },
  providers: [
    Credentials({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
        totp: { label: "Authenticator code", type: "text" },
      },
      async authorize(raw) {
        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success) return null;

        const email = parsed.data.email.toLowerCase();
        const limited = checkRateLimit(`login:${email}`, 12, 15 * 60_000);
        if (!limited.ok) return null;

        const user = await prisma.user.findUnique({
          where: { email },
        });
        if (!user) return null;

        const valid = await bcrypt.compare(parsed.data.password, user.passwordHash);
        if (!valid) return null;

        if (user.totpEnabled) {
          if (!user.totpSecret) return null;
          const code = parsed.data.totp?.trim() ?? "";
          if (!code) return null;
          let secret: string;
          try {
            secret = decryptTotpSecret(user.totpSecret);
          } catch {
            return null;
          }
          if (!verifyTotpCode(secret, code)) return null;
        }

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
        };
      },
    }),
  ],
});
