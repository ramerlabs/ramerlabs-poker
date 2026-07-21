"use client";

import type { CSSProperties } from "react";
import {
  REACTION_VISIBLE_MS,
  THROWABLE_CATALOG,
  type TableReactionEvent,
} from "@/lib/table-reactions";

type SeatLayout = Record<number, { left: string; top: string }>;

export type ActiveReaction = TableReactionEvent & { expiresAt: number };

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
            </div>
            <div
              className={`table-throw-burst ${meta.className}`}
              style={{ left: to.left, top: to.top }}
            />
          </div>
        );
      })}
    </>
  );
}

export function reactionLifetimeMs() {
  return REACTION_VISIBLE_MS;
}
