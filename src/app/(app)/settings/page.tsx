"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { Button, Input, Label, Panel } from "@/components/ui";
import { useToast } from "@/components/toast-provider";

type TwoFaStatus = { enabled: boolean; email?: string };

export default function SettingsPage() {
  const toast = useToast();
  const { data: session, update } = useSession();
  const [name, setName] = useState(session?.user?.name ?? "");
  const [nameBusy, setNameBusy] = useState(false);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pwBusy, setPwBusy] = useState(false);

  const [twoFa, setTwoFa] = useState<TwoFaStatus | null>(null);
  const [setupQr, setSetupQr] = useState<string | null>(null);
  const [setupSecret, setSetupSecret] = useState<string | null>(null);
  const [enableCode, setEnableCode] = useState("");
  const [disablePassword, setDisablePassword] = useState("");
  const [disableCode, setDisableCode] = useState("");
  const [twoFaBusy, setTwoFaBusy] = useState(false);

  const refreshTwoFa = useCallback(async () => {
    const res = await fetch("/api/profile/2fa/setup", { cache: "no-store" });
    if (!res.ok) return;
    const data = (await res.json()) as TwoFaStatus;
    setTwoFa(data);
  }, []);

  useEffect(() => {
    setName(session?.user?.name ?? "");
  }, [session?.user?.name]);

  useEffect(() => {
    void refreshTwoFa();
  }, [refreshTwoFa]);

  async function saveName(e: FormEvent) {
    e.preventDefault();
    setNameBusy(true);
    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Could not update name");
        return;
      }
      await update({ name: data.user.name });
      toast.success("Display name updated.");
    } catch {
      toast.error("Could not update name");
    } finally {
      setNameBusy(false);
    }
  }

  async function changePassword(e: FormEvent) {
    e.preventDefault();
    setPwBusy(true);
    if (newPassword !== confirmPassword) {
      toast.error("New passwords do not match");
      setPwBusy(false);
      return;
    }
    try {
      const res = await fetch("/api/profile/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Could not change password");
        return;
      }
      toast.success(data.message || "Password updated.");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch {
      toast.error("Could not change password");
    } finally {
      setPwBusy(false);
    }
  }

  async function startTwoFa() {
    setTwoFaBusy(true);
    setSetupQr(null);
    setSetupSecret(null);
    try {
      const res = await fetch("/api/profile/2fa/setup", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Could not start 2FA setup");
        return;
      }
      setSetupQr(data.qrDataUrl);
      setSetupSecret(data.secret);
      toast.success(data.message || "Scan the QR code to continue.");
    } catch {
      toast.error("Could not start 2FA setup");
    } finally {
      setTwoFaBusy(false);
    }
  }

  async function confirmTwoFa(e: FormEvent) {
    e.preventDefault();
    setTwoFaBusy(true);
    try {
      const res = await fetch("/api/profile/2fa/enable", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: enableCode }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Invalid code");
        return;
      }
      toast.success(data.message || "2FA enabled.");
      setSetupQr(null);
      setSetupSecret(null);
      setEnableCode("");
      await refreshTwoFa();
    } catch {
      toast.error("Could not enable 2FA");
    } finally {
      setTwoFaBusy(false);
    }
  }

  async function disableTwoFa(e: FormEvent) {
    e.preventDefault();
    setTwoFaBusy(true);
    try {
      const res = await fetch("/api/profile/2fa/disable", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: disablePassword, code: disableCode }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Could not disable 2FA");
        return;
      }
      toast.success(data.message || "2FA disabled.");
      setDisablePassword("");
      setDisableCode("");
      await refreshTwoFa();
    } catch {
      toast.error("Could not disable 2FA");
    } finally {
      setTwoFaBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-3xl font-semibold text-[var(--gold-soft)]">Account settings</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Manage your profile, password, and two-factor authentication.
        </p>
      </div>

      <Panel className="p-6">
        <h2 className="text-lg font-semibold text-[var(--text)]">Profile</h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Signed in as {session?.user?.email}
        </p>
        <form onSubmit={saveName} className="mt-4 space-y-3">
          <div>
            <Label htmlFor="display-name">Display name</Label>
            <Input
              id="display-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              minLength={2}
              maxLength={32}
              required
            />
          </div>
          <Button type="submit" disabled={nameBusy}>
            {nameBusy ? "Saving…" : "Save name"}
          </Button>
        </form>
      </Panel>

      <Panel className="p-6">
        <h2 className="text-lg font-semibold text-[var(--text)]">Change password</h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Use a strong password you do not reuse elsewhere.
        </p>
        <form onSubmit={changePassword} className="mt-4 space-y-3">
          <div>
            <Label htmlFor="current-password">Current password</Label>
            <Input
              id="current-password"
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              minLength={6}
              required
              autoComplete="current-password"
            />
          </div>
          <div>
            <Label htmlFor="new-password">New password</Label>
            <Input
              id="new-password"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              minLength={6}
              required
              autoComplete="new-password"
            />
          </div>
          <div>
            <Label htmlFor="confirm-password">Confirm new password</Label>
            <Input
              id="confirm-password"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              minLength={6}
              required
              autoComplete="new-password"
            />
          </div>
          <Button type="submit" disabled={pwBusy}>
            {pwBusy ? "Updating…" : "Update password"}
          </Button>
        </form>
      </Panel>

      <Panel className="p-6">
        <h2 className="text-lg font-semibold text-[var(--text)]">Two-factor authentication</h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Protect your account with an authenticator app (Google Authenticator, Authy, 1Password,
          etc.).
        </p>
        <p className="mt-3 text-sm">
          Status:{" "}
          <span className={twoFa?.enabled ? "text-[var(--success)]" : "text-[var(--muted)]"}>
            {twoFa == null ? "…" : twoFa.enabled ? "Enabled" : "Disabled"}
          </span>
        </p>

        {twoFa && !twoFa.enabled && !setupQr && (
          <Button className="mt-4" disabled={twoFaBusy} onClick={() => void startTwoFa()}>
            {twoFaBusy ? "Preparing…" : "Enable 2FA"}
          </Button>
        )}

        {setupQr && (
          <div className="mt-4 space-y-3">
            <p className="text-sm text-[var(--muted)]">
              Scan this QR code, or enter the secret manually in your app.
            </p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={setupQr}
              alt="2FA QR code"
              className="rounded-xl border border-[var(--line)] bg-white p-2"
              width={220}
              height={220}
            />
            {setupSecret && (
              <p className="break-all font-mono text-xs text-[var(--gold-soft)]">{setupSecret}</p>
            )}
            <form onSubmit={confirmTwoFa} className="space-y-3">
              <div>
                <Label htmlFor="enable-code">Authenticator code</Label>
                <Input
                  id="enable-code"
                  value={enableCode}
                  onChange={(e) => setEnableCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="123456"
                  required
                />
              </div>
              <Button type="submit" disabled={twoFaBusy || enableCode.length !== 6}>
                {twoFaBusy ? "Verifying…" : "Confirm & enable"}
              </Button>
            </form>
          </div>
        )}

        {twoFa?.enabled && (
          <form onSubmit={disableTwoFa} className="mt-4 space-y-3">
            <p className="text-sm text-[var(--muted)]">
              To disable 2FA, confirm with your password and a current authenticator code.
            </p>
            <div>
              <Label htmlFor="disable-password">Password</Label>
              <Input
                id="disable-password"
                type="password"
                value={disablePassword}
                onChange={(e) => setDisablePassword(e.target.value)}
                required
                minLength={6}
              />
            </div>
            <div>
              <Label htmlFor="disable-code">Authenticator code</Label>
              <Input
                id="disable-code"
                value={disableCode}
                onChange={(e) => setDisableCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                inputMode="numeric"
                maxLength={6}
                placeholder="123456"
                required
              />
            </div>
            <Button type="submit" variant="danger" disabled={twoFaBusy}>
              {twoFaBusy ? "Disabling…" : "Disable 2FA"}
            </Button>
          </form>
        )}
      </Panel>
    </div>
  );
}
