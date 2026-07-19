import NextAuth from "next-auth";
import { authConfig } from "@/lib/auth.config";

export default NextAuth(authConfig).auth;

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/rooms/:path*",
    "/wallet/:path*",
    "/support/:path*",
    "/settings/:path*",
    "/club/:path*",
    "/admin/:path*",
    "/login",
    "/register",
  ],
};
