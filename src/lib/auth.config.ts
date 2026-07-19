import type { NextAuthConfig } from "next-auth";

/** Edge-safe Auth.js config (no Prisma / bcrypt). Used by middleware. */
export const authConfig = {
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
  },
  providers: [],
  callbacks: {
    authorized({ auth, request }) {
      const { pathname } = request.nextUrl;
      const isLoggedIn = Boolean(auth?.user);
      const isAuthPage = pathname.startsWith("/login") || pathname.startsWith("/register");
      const isProtected =
        pathname.startsWith("/dashboard") ||
        pathname.startsWith("/rooms") ||
        pathname.startsWith("/wallet") ||
        pathname.startsWith("/support") ||
        pathname.startsWith("/settings") ||
        pathname.startsWith("/admin");

      if (isProtected && !isLoggedIn) return false;
      if (isAuthPage && isLoggedIn) {
        return Response.redirect(new URL("/dashboard", request.nextUrl));
      }
      if (pathname.startsWith("/admin") && auth?.user?.role !== "ADMIN") {
        return Response.redirect(new URL("/dashboard", request.nextUrl));
      }
      return true;
    },
    async jwt({ token, user, trigger, session }) {
      if (user) {
        token.id = user.id!;
        token.role = (user as { role?: string }).role ?? "USER";
        token.name = user.name;
      }
      if (trigger === "update" && session?.name != null) {
        token.name = session.name as string;
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
  trustHost: true,
} satisfies NextAuthConfig;
