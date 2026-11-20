type Tone = "verified" | "finding" | "neutral";

const tones: Record<Tone, string> = {
  verified: "text-verified",
  finding: "text-finding",
  neutral: "text-ink-secondary",
};

// `delay` lets the stamp land after the card it sits on has settled, so the press reads as the
// last beat instead of happening mid-entrance. Reduced motion resets the delay in index.css.
export function Stamp({
  tone = "neutral",
  children,
  animate = false,
  delay = 0,
  className = "",
}: {
  tone?: Tone;
  children: string;
  animate?: boolean;
  delay?: number;
  className?: string;
}) {
  return (
    <span
      className={`stamp ${tones[tone]} ${animate ? "animate-stamp" : ""} ${className}`}
      style={animate && delay ? { animationDelay: `${delay}ms` } : undefined}
    >
      {children}
    </span>
  );
}
