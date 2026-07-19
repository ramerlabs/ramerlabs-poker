import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authConfig } from "@/lib/auth.config";
import { decryptTotpSecret, verifyTotpCode } from "@/lib/totp";

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  totp: z.string().optional(),
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
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

        const user = await prisma.user.findUnique({
          where: { email: parsed.data.email.toLowerCase() },
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
