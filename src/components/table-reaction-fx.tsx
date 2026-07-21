"use client";

import type { CSSProperties } from "react";
import {
  REACTION_VISIBLE_MS,
  THROWABLE_CATALOG,
  type TableReactionEvent,
  type ThrowableItem,
} from "@/lib/table-reactions";

type SeatLayout = Record<number, { left: string; top: string }>;

export type ActiveReaction = TableReactionEvent & { expiresAt: number };

const BURST_PARTICLES: Partial<Record<ThrowableItem, string[]>> = {
  fireworks: ["✨", "🎇", "⭐", "💥", "🎆"],
  ice: ["🧊", "❄️", "💠"],
  water: ["💧", "💦", "🌊"],
  tomato: ["🍅", "💥"],
  beer: ["🍺", "🫧", "✨"],
  crown: ["👑", "✨", "⭐"],
  rocket: ["🚀", "🔥", "💥"],
  egg: ["🥚", "💥"],
  lightning: ["⚡", "✨", "💥"],
  kiss: ["💋", "💖", "✨"],
  bomb: ["💣", "💥", "🔥"],
  haha: ["😂", "🤣", "😆", "✨"],
};

export function TableReactionFx({
  reactions,
  layout,
}: {
  reactions: ActiveReaction[];
  layout: SeatLayout;
}) {
  return (
    <>
      {reactions.map((reaction) => {
        const from = layout[reaction.fromSeat] ?? layout[0]!;
        const to = layout[reaction.toSeat] ?? layout[0]!;
        const meta = THROWABLE_CATALOG[reaction.item];
        const particles = BURST_PARTICLES[reaction.item] ?? [meta.emoji, "✨"];

        return (
          <div key={reaction.id} className="table-reaction-fx" aria-hidden>
            <div
              className={`table-throw-projectile ${meta.className}`}
              style={
                {
                  "--from-x": from.left,
                  "--from-y": from.top,
                  "--to-x": to.left,
                  "--to-y": to.top,
                } as CSSProperties
              }
            >
              <span className="table-throw-emoji">{meta.emoji}</span>
              <span className="table-throw-trail" aria-hidden />
            </div>
            <div
              className={`table-throw-burst ${meta.className}`}
              style={{ left: to.left, top: to.top }}
            />
            <div
              className={`table-throw-ring ${meta.className}`}
              style={{ left: to.left, top: to.top }}
            />
            <div className="table-throw-particles" style={{ left: to.left, top: to.top }}>
              {particles.map((p, i) => (
                <span
                  key={`${reaction.id}-p-${i}`}
                  className="table-throw-particle"
                  style={{ "--p-i": i } as CSSProperties}
                >
                  {p}
                </span>
              ))}
            </div>
            <div className="table-throw-label" style={{ left: to.left, top: to.top }}>
              {meta.emoji} {reaction.fromName}
            </div>
          </div>
        );
      })}
    </>
  );
}

export function reactionLifetimeMs() {
  return REACTION_VISIBLE_MS;
}
