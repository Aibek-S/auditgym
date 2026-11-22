import { useEffect, useRef, useState } from "react";
import { Type } from "lucide-react";
import { usePrefs, useT, type Contrast, type Motion, type TextSize } from "../lib/i18n";

/** Reading comfort in one place: text size, contrast, animation and the error colours. */
export function ViewMenu() {
  const { t } = useT();
  const { size, setSize, contrast, setContrast, motion, setMotion, scheme, setScheme } = usePrefs();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        button.current?.focus();
      }
    };
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  return (
    <div ref={box} className="relative">
      <button
        ref={button}
        type="button"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((v) => !v)}
        className={`hit relative inline-flex h-8 items-center gap-1.5 rounded-control border px-3 text-[13px] font-medium transition-[color,background-color,border-color] duration-[120ms] ${open ? "border-ink bg-ink text-on-ink" : "border-line-strong text-ink-secondary hover:border-ink hover:text-ink"}`}
      >
        <Type size={14} aria-hidden="true" />
        {t("view.button")}
      </button>
      {open ? (
        <div
          role="dialog"
          aria-label={t("view.title")}
          className="animate-rise absolute top-full right-0 z-40 mt-2 w-[min(320px,calc(100vw-32px))] origin-top-right rounded-card border border-line-strong bg-paper-raised p-4 shadow-[0_12px_32px_rgba(0,0,0,0.14)]"
        >
          <p className="text-[15px] font-medium text-ink">{t("view.title")}</p>
          <Choice<TextSize>
            label={t("view.size")}
            value={size}
            onChange={setSize}
            options={[
              { value: "m", label: t("view.size.m"), sample: "text-[14px]" },
              { value: "l", label: t("view.size.l"), sample: "text-[16px]" },
              { value: "xl", label: t("view.size.xl"), sample: "text-[18px]" },
            ]}
          />
          <Choice<Contrast>
            label={t("view.contrast")}
            value={contrast}
            onChange={setContrast}
            options={[
              { value: "normal", label: t("view.contrast.normal") },
              { value: "high", label: t("view.contrast.high") },
            ]}
          />
          <Choice<Motion>
            label={t("view.motion")}
            value={motion}
            onChange={setMotion}
            options={[
              { value: "auto", label: t("view.motion.auto") },
              { value: "off", label: t("view.motion.off") },
            ]}
          />
          <Choice<"default" | "alt">
            label={t("view.scheme")}
            value={scheme}
            onChange={setScheme}
            options={[
              { value: "default", label: t("shell.scheme.default") },
              { value: "alt", label: t("shell.scheme.alt") },
            ]}
          />
          <p className="mt-3 text-[13px] text-ink-muted">{t("view.saved")}</p>
        </div>
      ) : null}
    </div>
  );
}

function Choice<V extends string>({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: V;
  onChange: (v: V) => void;
  options: { value: V; label: string; sample?: string }[];
}) {
  return (
    <fieldset className="mt-4">
      <legend className="text-[13px] text-ink-muted">{label}</legend>
      <div className="mt-1.5 flex gap-1.5">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            aria-pressed={value === o.value}
            onClick={() => onChange(o.value)}
            className={`min-h-11 flex-1 rounded-control border px-2 py-2 text-[14px] leading-tight transition-[color,background-color,border-color,transform] duration-[120ms] active:scale-[0.98] ${o.sample ?? ""} ${value === o.value ? "border-ink bg-ink text-on-ink" : "border-line-strong text-ink hover:border-ink"}`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </fieldset>
  );
}
