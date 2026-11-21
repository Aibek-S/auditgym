type Tone = "verified" | "finding" | "neutral";

const tones: Record<Tone, string> = {
  verified: "text-verified",
  finding: "text-finding",
  neutral: "text-ink-secondary",
};

// A posting stamp: code letter, verdict, the date in a second ink and the run or issue id.
// `delay` lets it land after the card under it has settled; reduced motion resets the delay.
export function Stamp({
  tone = "neutral",
  code,
  label,
  date,
  id,
  animate = false,
  delay = 0,
  className = "",
}: {
  tone?: Tone;
  code: string;
  label: string;
  date?: string;
  id?: string;
  animate?: boolean;
  delay?: number;
  className?: string;
}) {
  return (
    <span
      className={`stamp ${tones[tone]} ${animate ? "animate-stamp" : ""} ${className}`}
      style={animate && delay ? { animationDelay: `${delay}ms` } : undefined}
    >
      <span className="stamp__code" aria-hidden="true">
        {code}
      </span>
      <span className="stamp__label">{label}</span>
      {date || id ? (
        <span className="stamp__meta num">
          {date ? <span className="stamp__date">{date}</span> : null}
          {id ? <span>{id}</span> : null}
        </span>
      ) : null}
    </span>
  );
}
