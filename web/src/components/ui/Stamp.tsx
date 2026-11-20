type Tone = "verified" | "finding" | "neutral";

const tones: Record<Tone, string> = {
  verified: "text-verified",
  finding: "text-finding",
  neutral: "text-ink-secondary",
};

export function Stamp({
  tone = "neutral",
  children,
  animate = false,
  className = "",
}: {
  tone?: Tone;
  children: string;
  animate?: boolean;
  className?: string;
}) {
  return (
    <span className={`stamp ${tones[tone]} ${animate ? "animate-stamp" : ""} ${className}`}>
      {children}
    </span>
  );
}
