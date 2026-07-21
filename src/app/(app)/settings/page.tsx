"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { Button, Input, Label, Panel } from "@/components/ui";
import { PlayerAvatar } from "@/components/player-avatar";
import { useToast } from "@/components/toast-provider";

type TwoFaStatus = { enabled: boolean; email?: string };

function readImageAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Could not read image"));
    reader.readAsDataURL(file);
  });
}

/** Shrink large uploads so they fit the server limit. */
async function compressAvatar(file: File): Promise<string> {
  const raw = await readImageAsDataUrl(file);
  if (file.size <= 120_000) return raw;

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const max = 256;
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const w = Math.max(1, Math.round(img.width * scale));
      const h = Math.max(1, Math.round(img.height * scale));
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(raw);
        return;
      }
      ctx.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL("image/jpeg", 0.85));
    };
    img.onerror = () => reject(new Error("Invalid image"));
    img.src = raw;
  });
}

export default function SettingsPage() {
  const toast = useToast();
  const { data: session, update } = useSession();
  const [name, setName] = useState(session?.user?.name ?? "");
  const [nameBusy, setNameBusy] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

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

  const refreshProfile = useCallback(async () => {
    const res = await fetch("/api/profile", { cache: "no-store" });
    if (!res.ok) return;
    const data = await res.json();
    setAvatarUrl(data.user?.avatarUrl ?? null);
    if (data.user?.name) setName(data.user.name);
  }, []);

  useEffect(() => {
    setName(session?.user?.name ?? "");
  }, [session?.user?.name]);

  useEffect(() => {
    void refreshTwoFa();
    void refreshProfile();
  }, [refreshTwoFa, refreshProfile]);

  async function uploadAvatar(file: File) {
    setAvatarBusy(true);
    try {
      const dataUrl = await compressAvatar(file);
      const res = await fetch("/api/profile/avatar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ avatarUrl: dataUrl }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Could not upload avatar");
        return;
      }
      setAvatarUrl(data.user?.avatarUrl ?? dataUrl);
      toast.success(data.message || "Avatar updated");
    } catch {
      toast.error("Could not upload avatar");
    } finally {
      setAvatarBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function removeAvatar() {
    setAvatarBusy(true);
    try {
      const res = await fetch("/api/profile/avatar", { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Could not remove avatar");
        return;
      }
      setAvatarUrl(null);
      toast.success(data.message || "Avatar removed");
    } catch {
      toast.error("Could not remove avatar");
    } finally {
      setAvatarBusy(false);
    }
  }

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
        <h2 className="text-lg font-semibold text-[var(--text)]">Table avatar</h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Your photo appears on your seat at the poker table. Square images work best.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-4">
          <PlayerAvatar
            userId={session?.user?.id ?? "me"}
            name={name || session?.user?.email || "You"}
            avatarUrl={avatarUrl}
            size="lg"
            className="!h-20 !w-20"
          />
          <div className="flex flex-wrap gap-2">
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void uploadAvatar(file);
              }}
            />
            <Button
              type="button"
              disabled={avatarBusy}
              onClick={() => fileRef.current?.click()}
            >
              {avatarBusy ? "Uploading…" : avatarUrl ? "Change photo" : "Upload photo"}
            </Button>
            {avatarUrl ? (
              <Button type="button" variant="ghost" disabled={avatarBusy} onClick={() => void removeAvatar()}>
                Remove
              </Button>
            ) : null}
          </div>
        </div>
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
