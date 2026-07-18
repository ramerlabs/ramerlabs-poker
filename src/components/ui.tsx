import { cn } from "@/lib/utils";

export function Panel({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-[var(--line)] bg-[rgba(14,22,36,0.88)] backdrop-blur-md shadow-[0_20px_50px_rgba(0,0,0,0.35)]",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function Button({
  className,
  variant = "primary",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "ghost" | "danger" | "felt";
}) {
  const styles = {
    primary:
      "bg-gradient-to-r from-[#b8892d] to-[#d4a853] text-[#1a1205] hover:brightness-110",
    ghost: "bg-transparent border border-[var(--line)] text-[var(--text)] hover:bg-white/5",
    danger: "bg-[var(--crimson)] text-white hover:brightness-110",
    felt: "bg-[#145c45] text-[var(--gold-soft)] border border-[rgba(212,168,83,0.35)] hover:bg-[#176b50]",
  } as const;

  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold tracking-wide transition disabled:opacity-50 disabled:cursor-not-allowed",
        styles[variant],
        className,
      )}
      {...props}
    />
  );
}

export function Input({
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "w-full rounded-xl border border-[var(--line)] bg-[#0a1220] px-3.5 py-2.5 text-sm text-[var(--text)] outline-none placeholder:text-[var(--muted)] focus:border-[var(--gold)]",
        className,
      )}
      {...props}
    />
  );
}

export function Label({
  className,
  ...props
}: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      className={cn("mb-1.5 block text-xs uppercase tracking-[0.14em] text-[var(--muted)]", className)}
      {...props}
    />
  );
}

export function Badge({
  children,
  tone = "gold",
}: {
  children: React.ReactNode;
  tone?: "gold" | "green" | "muted";
}) {
  const tones = {
    gold: "border-[rgba(212,168,83,0.4)] text-[var(--gold-soft)] bg-[rgba(212,168,83,0.08)]",
    green: "border-[rgba(62,207,142,0.4)] text-[var(--success)] bg-[rgba(62,207,142,0.08)]",
    muted: "border-white/10 text-[var(--muted)] bg-white/5",
  };
  return (
    <span className={cn("inline-flex rounded-full border px-2.5 py-0.5 text-[11px] font-semibold tracking-wide", tones[tone])}>
      {children}
    </span>
  );
}
