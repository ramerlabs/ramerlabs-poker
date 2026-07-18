import { cn } from "@/lib/utils";

const BOT_SKINS = ["#7ec8e3", "#9ad0a0", "#e8b4b8", "#c9b1ff", "#f0c674", "#f5a97f"];
const BOT_EYES = ["#1a1a2e", "#0d3b2e", "#3b1f4a", "#1f2a44"];

function hash(input: string) {
  let h = 0;
  for (let i = 0; i < input.length; i += 1) h = (h * 31 + input.charCodeAt(i)) >>> 0;
  return h;
}

function BotFace({ seed }: { seed: string }) {
  const h = hash(seed);
  const skin = BOT_SKINS[h % BOT_SKINS.length]!;
  const eye = BOT_EYES[(h >> 3) % BOT_EYES.length]!;
  const antenna = h % 2 === 0;
  const smile = (h >> 5) % 3; // 0 flat, 1 smile, 2 grin
  const gradId = `botShine-${h.toString(36)}`;

  return (
    <svg viewBox="0 0 64 64" className="h-full w-full" aria-hidden>
      <defs>
        <radialGradient id={gradId} cx="30%" cy="30%" r="70%">
          <stop offset="0%" stopColor="#fff" />
          <stop offset="100%" stopColor="transparent" />
        </radialGradient>
      </defs>
      <circle cx="32" cy="34" r="22" fill={skin} />
      <circle cx="32" cy="34" r="22" fill={`url(#${gradId})`} opacity="0.35" />
      {antenna && (
        <>
          <line x1="32" y1="12" x2="32" y2="4" stroke="#d4a853" strokeWidth="2" />
          <circle cx="32" cy="3" r="2.5" fill="#f0d59a" />
        </>
      )}
      <rect x="16" y="26" width="32" height="14" rx="7" fill="#0e1624" opacity="0.85" />
      <circle cx="24" cy="33" r="3.2" fill={eye} />
      <circle cx="40" cy="33" r="3.2" fill={eye} />
      <circle cx="23" cy="32" r="1" fill="#fff" opacity="0.7" />
      <circle cx="39" cy="32" r="1" fill="#fff" opacity="0.7" />
      {smile === 0 && (
        <line x1="24" y1="46" x2="40" y2="46" stroke="#1a1a2e" strokeWidth="2" strokeLinecap="round" />
      )}
      {smile === 1 && (
        <path d="M24 45 Q32 52 40 45" fill="none" stroke="#1a1a2e" strokeWidth="2" strokeLinecap="round" />
      )}
      {smile === 2 && (
        <path d="M23 44 Q32 54 41 44" fill="#1a1a2e" stroke="#1a1a2e" strokeWidth="1" />
      )}
    </svg>
  );
}

function HumanFace() {
  return (
    <svg viewBox="0 0 64 64" className="h-full w-full" aria-hidden>
      <circle cx="32" cy="32" r="30" fill="#2a3348" />
      <circle cx="32" cy="36" r="18" fill="#e8c4a8" />
      {/* hair */}
      <path d="M14 34 C16 16 48 16 50 34 L48 28 C44 18 20 18 16 28 Z" fill="#3a2a1e" />
      <circle cx="24" cy="34" r="2.4" fill="#1a1a2e" />
      <circle cx="40" cy="34" r="2.4" fill="#1a1a2e" />
      <circle cx="23.2" cy="33.2" r="0.8" fill="#fff" opacity="0.75" />
      <circle cx="39.2" cy="33.2" r="0.8" fill="#fff" opacity="0.75" />
      <path d="M26 44 Q32 48 38 44" fill="none" stroke="#b33a4a" strokeWidth="1.8" strokeLinecap="round" />
      <path
        d="M20 28 Q24 24 28 28"
        fill="none"
        stroke="#3a2a1e"
        strokeWidth="1.4"
        strokeLinecap="round"
        opacity="0.5"
      />
      <path
        d="M36 28 Q40 24 44 28"
        fill="none"
        stroke="#3a2a1e"
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
  const bot = userId.startsWith("bot_");
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
      {bot ? <BotFace seed={userId} /> : <HumanFace />}
      {bot && (
        <span className="absolute bottom-0 right-0 rounded-sm bg-[var(--gold)] px-0.5 text-[7px] font-bold leading-none text-[#1a1205]">
          AI
        </span>
      )}
    </div>
  );
}
