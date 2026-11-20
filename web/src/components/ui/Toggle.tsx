export function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="inline-flex items-center gap-2.5 text-[12px] text-ink-secondary transition-colors hover:text-ink"
    >
      <span
        className={`relative h-5 w-9 rounded-full border transition-colors duration-150 ${
          checked ? "border-accent bg-accent" : "border-line-strong bg-paper-sunken"
        }`}
      >
        <span
          className={`absolute top-1/2 h-3.5 w-3.5 -translate-y-1/2 rounded-full bg-paper-raised shadow-sm transition-transform duration-150 ${
            checked ? "translate-x-[18px]" : "translate-x-[3px]"
          }`}
        />
      </span>
      {label}
    </button>
  );
}
