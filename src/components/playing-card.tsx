import { cn } from "@/lib/utils";

export function PlayingCard({
  card,
  className,
}: {
  card: string;
  className?: string;
}) {
  if (card === "hidden") {
    return <div className={cn("playing-card hidden-card animate-chip-in", className)}>RL</div>;
  }

  const rank = card[0] === "T" ? "10" : card[0];
  const suit = card[1];
  const suitGlyph = suit === "h" ? "♥" : suit === "d" ? "♦" : suit === "c" ? "♣" : "♠";
  const red = suit === "h" || suit === "d";

  return (
    <div className={cn("playing-card animate-chip-in", red && "red", className)}>
      <div className="text-center leading-tight">
        <div className="text-base">{rank}</div>
        <div className="text-lg">{suitGlyph}</div>
      </div>
    </div>
  );
}
