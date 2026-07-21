"use client";

import { useCallback, useRef, type PointerEvent } from "react";
import { cn } from "@/lib/utils";

type BetSliderProps = {
  min: number;
  max: number;
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
  className?: string;
};

export function BetSlider({
  min,
  max,
  value,
  onChange,
  disabled,
  className,
}: BetSliderProps) {
  const trackRef = useRef<HTMLDivElement>(null);

  const span = Math.max(0, max - min);
  const pct = span <= 0 ? 100 : ((value - min) / span) * 100;

  const updateFromClientX = useCallback(
    (clientX: number) => {
      const track = trackRef.current;
      if (!track || disabled || span <= 0) return;
      const rect = track.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      const next = Math.round(min + ratio * span);
      onChange(Math.max(min, Math.min(max, next)));
    },
    [disabled, max, min, onChange, span],
  );

  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    if (disabled) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    updateFromClientX(e.clientX);
  }

  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    if (disabled || !e.currentTarget.hasPointerCapture(e.pointerId)) return;
    updateFromClientX(e.clientX);
  }

  return (
    <div className={cn("bet-slider", disabled && "is-disabled", className)}>
      <div className="bet-slider-head">
        <span className="bet-slider-label">Bet / raise to</span>
        <span className="bet-slider-value">{value.toLocaleString()}</span>
      </div>
      <div
        ref={trackRef}
        className="bet-slider-track"
        role="slider"
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-disabled={disabled}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
      >
        <div className="bet-slider-fill" style={{ width: `${pct}%` }} />
        <div className="bet-slider-thumb" style={{ left: `${pct}%` }} />
      </div>
      <div className="bet-slider-range">
        <span>{min.toLocaleString()}</span>
        <span>{max.toLocaleString()}</span>
      </div>
    </div>
  );
}
