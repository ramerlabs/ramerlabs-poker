"use client";

import { THROWABLE_CATALOG, type ThrowableItem } from "@/lib/table-reactions";

export type ReactionMenuTarget = {
  userId: string;
  seat: number;
  name: string;
  left: string;
  top: string;
};

export function SeatReactionMenu({
  target,
  busy,
  onPick,
  onClose,
}: {
  target: ReactionMenuTarget;
  busy: boolean;
  onPick: (item: ThrowableItem) => void;
  onClose: () => void;
}) {
  return (
    <>
      <button
        type="button"
        className="seat-reaction-backdrop"
        aria-label="Close throw menu"
        onClick={onClose}
      />
      <div
        className="seat-reaction-menu"
        role="dialog"
        aria-modal="true"
        aria-label={`Throw at ${target.name}`}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <div className="seat-reaction-menu-head">
          <span>Throw at {target.name}</span>
          <button type="button" className="seat-reaction-menu-close" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="seat-reaction-menu-grid">
          {(Object.keys(THROWABLE_CATALOG) as ThrowableItem[]).map((item) => {
            const meta = THROWABLE_CATALOG[item];
            return (
              <button
                key={item}
                type="button"
                className="seat-reaction-menu-item"
                disabled={busy}
                title={meta.label}
                onClick={() => onPick(item)}
              >
                <span className="seat-reaction-menu-emoji" aria-hidden>
                  {meta.emoji}
                </span>
                <span className="seat-reaction-menu-label">{meta.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
}
