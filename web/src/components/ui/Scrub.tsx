import { useRef, type KeyboardEvent, type PointerEvent } from "react";

// A number inside a sentence that can be dragged sideways or stepped with the arrow keys
// (after Bret Victor's Tangle). Dashed underline marks it as adjustable.
export function Scrub({
  value,
  onChange,
  min,
  max,
  step,
  format = (v) => String(v),
  label,
  pxPerStep = 6,
}: {
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step: number;
  format?: (v: number) => string;
  label: string;
  pxPerStep?: number;
}) {
  const start = useRef<{ x: number; v: number } | null>(null);
  const clamp = (v: number) => Math.min(max, Math.max(min, Math.round(v / step) * step));

  function down(e: PointerEvent<HTMLSpanElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    start.current = { x: e.clientX, v: value };
  }
  function move(e: PointerEvent<HTMLSpanElement>) {
    if (!start.current) return;
    const steps = Math.round((e.clientX - start.current.x) / pxPerStep);
    onChange(+clamp(start.current.v + steps * step).toFixed(4));
  }
  function up() {
    start.current = null;
  }
  function key(e: KeyboardEvent<HTMLSpanElement>) {
    if (e.key === "ArrowRight" || e.key === "ArrowUp") {
      e.preventDefault();
      onChange(+clamp(value + step).toFixed(4));
    } else if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
      e.preventDefault();
      onChange(+clamp(value - step).toFixed(4));
    }
  }

  return (
    <span
      role="slider"
      tabIndex={0}
      aria-label={label}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={value}
      aria-valuetext={format(value)}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
      onKeyDown={key}
      className="num cursor-ew-resize touch-none select-none border-b border-dashed border-ink text-ink"
    >
      {format(value)}
    </span>
  );
}
