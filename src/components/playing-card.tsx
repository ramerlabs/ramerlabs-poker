import { cn } from "@/lib/utils";

export function PlayingCard({
  card,
  className,
  delayMs = 0,
}: {
  card: string;
  className?: string;
  delayMs?: number;
}) {
  const style = delayMs ? ({ animationDelay: `${delayMs}ms` } as React.CSSProperties) : undefined;

  if (card === "hidden") {
    return (
      <div className={cn("playing-card hidden-card animate-deal", className)} style={style}>
        RL
      </div>
    );
  }

  const rank = card[0] === "T" ? "10" : card[0];
  const suit = card[1];
  const suitGlyph = suit === "h" ? "♥" : suit === "d" ? "♦" : suit === "c" ? "♣" : "♠";
  const red = suit === "h" || suit === "d";

  return (
    <div className={cn("playing-card animate-deal", red && "red", className)} style={style}>
      <div className="text-center leading-tight">
        <div className="text-base">{rank}</div>
        <div className="text-lg">{suitGlyph}</div>
      </div>
    </div>
  );
}
