import { cn } from "@/lib/utils";

const SKINS = ["#e8c4a8", "#d4a574", "#c68642", "#f1c27d", "#ffdbac", "#e0ac69"];
const HAIR = ["#3a2a1e", "#1a1208", "#5c4033", "#2c1a0e", "#4a3728", "#0d0d0d"];
const LIPS = ["#b33a4a", "#a04555", "#c45c6a"];

function hash(input: string) {
  let h = 0;
  for (let i = 0; i < input.length; i += 1) h = (h * 31 + input.charCodeAt(i)) >>> 0;
  return h;
}

/** Seeded human-style face — same treatment for every seat (no bot tells). */
function Face({ seed }: { seed: string }) {
  const h = hash(seed);
  const skin = SKINS[h % SKINS.length]!;
  const hair = HAIR[(h >> 3) % HAIR.length]!;
  const lip = LIPS[(h >> 6) % LIPS.length]!;
  const smile = (h >> 5) % 3;

  return (
    <svg viewBox="0 0 64 64" className="h-full w-full" aria-hidden>
      <circle cx="32" cy="32" r="30" fill="#2a3348" />
      <circle cx="32" cy="36" r="18" fill={skin} />
      <path d="M14 34 C16 16 48 16 50 34 L48 28 C44 18 20 18 16 28 Z" fill={hair} />
      <circle cx="24" cy="34" r="2.4" fill="#1a1a2e" />
      <circle cx="40" cy="34" r="2.4" fill="#1a1a2e" />
      <circle cx="23.2" cy="33.2" r="0.8" fill="#fff" opacity="0.75" />
      <circle cx="39.2" cy="33.2" r="0.8" fill="#fff" opacity="0.75" />
      {smile === 0 && (
        <line x1="26" y1="45" x2="38" y2="45" stroke={lip} strokeWidth="1.8" strokeLinecap="round" />
      )}
      {smile === 1 && (
        <path d="M26 44 Q32 48 38 44" fill="none" stroke={lip} strokeWidth="1.8" strokeLinecap="round" />
      )}
      {smile === 2 && (
        <path d="M26 43 Q32 50 38 43" fill="none" stroke={lip} strokeWidth="1.8" strokeLinecap="round" />
      )}
      <path
        d="M20 28 Q24 24 28 28"
        fill="none"
        stroke={hair}
        strokeWidth="1.4"
        strokeLinecap="round"
        opacity="0.5"
      />
      <path
        d="M36 28 Q40 24 44 28"
        fill="none"
        stroke={hair}
        strokeWidth="1.4"
        strokeLinecap="round"
        opacity="0.5"
      />
    </svg>
  );
}

export function PlayerAvatar({
  userId,
  name,
  className,
  size = "md",
}: {
  userId: string;
  name?: string;
  className?: string;
  size?: "sm" | "md" | "lg";
}) {
  const sizes = { sm: "h-8 w-8", md: "h-11 w-11", lg: "h-14 w-14" };

  return (
    <div
      className={cn(
        "player-avatar relative shrink-0 overflow-hidden rounded-full border border-[rgba(255,255,255,0.2)] bg-[#1c222e] shadow-[0_4px_12px_rgba(0,0,0,0.35)]",
        sizes[size],
        className,
      )}
      title={name}
    >
      <Face seed={userId || name || "player"} />
    </div>
  );
}
