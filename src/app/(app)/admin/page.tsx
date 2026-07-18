"use client";

import { FormEvent, useEffect, useState } from "react";
import { Badge, Button, Input, Label, Panel } from "@/components/ui";

type Currency = {
  id: string;
  code: string;
  name: string;
  enabled: boolean;
  usdtAddress: string | null;
  gcashMerchantId: string | null;
  minDeposit: number;
  minWithdrawal: number;
};

export default function AdminPage() {
  const [currencies, setCurrencies] = useState<Currency[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const res = await fetch("/api/admin/currencies");
    const json = await res.json();
    if (!res.ok) {
      setError(json.error || "Admin access required");
      return;
    }
    setCurrencies(json.currencies ?? []);
  }

  useEffect(() => {
    void load();
  }, []);

  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMessage(null);
    setError(null);
    const form = new FormData(e.currentTarget);
    const res = await fetch("/api/admin/currencies", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code: String(form.get("code")),
        name: String(form.get("name")),
        enabled: form.get("enabled") === "on",
        usdtAddress: String(form.get("usdtAddress") || "") || null,
        gcashMerchantId: String(form.get("gcashMerchantId") || "") || null,
        minDeposit: Number(form.get("minDeposit")),
        minWithdrawal: Number(form.get("minWithdrawal")),
      }),
    });
    const json = await res.json();
    if (!res.ok) {
      setError(json.error || "Update failed");
      return;
    }
    setMessage(`Saved ${json.currency.code}`);
    await load();
  }

  async function toggle(code: string, enabled: boolean) {
    const res = await fetch("/api/admin/currencies", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, enabled }),
    });
    if (res.ok) await load();
  }

  return (
    <div className="space-y-6 animate-fade-up">
      <div>
        <h1 className="text-4xl font-semibold text-[var(--gold-soft)]">Admin</h1>
        <p className="mt-2 text-[var(--muted)]">
          Toggle currencies and assign localized payment parameters for mock gateways.
        </p>
      </div>

      <div className="grid gap-4">
        {currencies.map((c) => (
          <Panel key={c.id} className="p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-2xl font-semibold">
                    {c.code} — {c.name}
                  </h2>
                  <Badge tone={c.enabled ? "green" : "muted"}>
                    {c.enabled ? "Enabled" : "Disabled"}
                  </Badge>
                </div>
                <p className="mt-1 text-sm text-[var(--muted)]">
                  USDT: {c.usdtAddress || "—"} · GCash: {c.gcashMerchantId || "—"}
                </p>
                <p className="text-sm text-[var(--muted)]">
                  Min deposit {c.minDeposit} · Min withdrawal {c.minWithdrawal}
                </p>
              </div>
              <Button variant="ghost" onClick={() => toggle(c.code, !c.enabled)}>
                {c.enabled ? "Disable" : "Enable"}
              </Button>
            </div>
          </Panel>
        ))}
      </div>

      <Panel className="p-6">
        <h2 className="text-xl font-semibold">Upsert currency</h2>
        <form onSubmit={save} className="mt-4 grid gap-3 md:grid-cols-2">
          <div>
            <Label>Code</Label>
            <Input name="code" required placeholder="USD" />
          </div>
          <div>
            <Label>Name</Label>
            <Input name="name" required placeholder="US Dollar" />
          </div>
          <div>
            <Label>USDT address</Label>
            <Input name="usdtAddress" placeholder="T…" />
          </div>
          <div>
            <Label>GCash merchant ID</Label>
            <Input name="gcashMerchantId" placeholder="GCASH-…" />
          </div>
          <div>
            <Label>Min deposit</Label>
            <Input name="minDeposit" type="number" defaultValue={10} required />
          </div>
          <div>
            <Label>Min withdrawal</Label>
            <Input name="minWithdrawal" type="number" defaultValue={10} required />
          </div>
          <label className="flex items-center gap-2 text-sm text-[var(--muted)] md:col-span-2">
            <input type="checkbox" name="enabled" defaultChecked className="accent-[var(--gold)]" />
            Enabled for players
          </label>
          <div className="md:col-span-2">
            <Button type="submit">Save currency</Button>
          </div>
        </form>
      </Panel>

      {(message || error) && (
        <div
          className={`rounded-xl px-4 py-3 text-sm ${
            error
              ? "border border-[rgba(179,58,74,0.4)] bg-[rgba(179,58,74,0.12)]"
              : "border border-[rgba(62,207,142,0.35)] bg-[rgba(62,207,142,0.08)]"
          }`}
        >
          {error || message}
        </div>
      )}
    </div>
  );
}
