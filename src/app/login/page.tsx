"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { FormEvent, Suspense, useState } from "react";
import { Button, Input, Label, Panel } from "@/components/ui";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [requires2fa, setRequires2fa] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [totp, setTotp] = useState("");

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const ac = new AbortController();
    const kill = window.setTimeout(() => ac.abort(), 12_000);
    try {
      if (!requires2fa) {
        const pre = await fetch("/api/auth/prelogin", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password }),
          signal: ac.signal,
        });
        const preData = (await pre.json()) as {
          ok?: boolean;
          requires2fa?: boolean;
          error?: string;
        };
        if (!pre.ok || !preData.ok) {
          setError(preData.error || "Invalid email or password");
          setLoading(false);
          return;
        }
        if (preData.requires2fa) {
          setRequires2fa(true);
          setLoading(false);
          return;
        }
      }

      const res = await signIn("credentials", {
        email,
        password,
        totp: totp.trim() || undefined,
        redirect: false,
      });
      if (res?.error) {
        setError(
          requires2fa
            ? "Invalid authenticator code"
            : "Invalid email or password",
        );
        setLoading(false);
        return;
      }
      router.push(params.get("callbackUrl") || "/dashboard");
      router.refresh();
    } catch (err) {
      const timedOut =
        err instanceof DOMException && err.name === "AbortError";
      setError(
        timedOut
          ? "Server is busy — wait a moment and try again"
          : "Could not sign in. Try again.",
      );
      setLoading(false);
    } finally {
      window.clearTimeout(kill);
    }
  }

  return (
    <Panel className="w-full max-w-md p-8 animate-fade-up">
      <h1 className="text-3xl font-semibold text-[var(--gold-soft)]">Welcome back</h1>
      <p className="mt-2 text-sm text-[var(--muted)]">
        {requires2fa
          ? "Enter the 6-digit code from your authenticator app."
          : "Sign in to your RamerLabs Poker account."}
      </p>
      <form onSubmit={onSubmit} className="mt-6 space-y-4">
        {!requires2fa ? (
          <>
            <div>
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                name="email"
                type="email"
                required
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
              />
            </div>
            <div>
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                name="password"
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
              />
            </div>
          </>
        ) : (
          <div>
            <Label htmlFor="totp">Authenticator code</Label>
            <Input
              id="totp"
              name="totp"
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              required
              placeholder="123456"
              value={totp}
              onChange={(e) => setTotp(e.target.value.replace(/\D/g, "").slice(0, 6))}
              autoFocus
              autoComplete="one-time-code"
            />
            <button
              type="button"
              className="mt-2 text-xs text-[var(--muted)] underline-offset-2 hover:underline"
              onClick={() => {
                setRequires2fa(false);
                setTotp("");
                setError(null);
              }}
            >
              Back to email &amp; password
            </button>
          </div>
        )}
        {error && <p className="text-sm text-[var(--crimson)]">{error}</p>}
        <Button type="submit" disabled={loading} className="w-full">
          {loading ? "Signing in…" : requires2fa ? "Verify & sign in" : "Sign in"}
        </Button>
      </form>
      <p className="mt-4 text-sm text-[var(--muted)]">
        No account?{" "}
        <Link href="/register" className="text-[var(--gold)] underline-offset-2 hover:underline">
          Register
        </Link>
      </p>
    </Panel>
  );
}

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <Suspense>
        <LoginForm />
      </Suspense>
    </div>
  );
}
