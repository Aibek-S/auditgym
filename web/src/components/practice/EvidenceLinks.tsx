import { useLayoutEffect, useRef, useState } from "react";
import { useT } from "../../lib/i18n";

/** The reader's evidence on the left, the set that proves the error on the right, and a line drawn
    once from each of the reader's ids to the same record. Ids the error does not need stay unlinked. */
export function EvidenceLinks({ yours, needed, delay = 0 }: { yours: string[]; needed: string[]; delay?: number }) {
  const { t } = useT();
  const box = useRef<HTMLDivElement>(null);
  const left = useRef<Record<string, HTMLLIElement | null>>({});
  const right = useRef<Record<string, HTMLLIElement | null>>({});
  const [lines, setLines] = useState<{ id: string; d: string }[]>([]);
  const [size, setSize] = useState({ w: 0, h: 0 });

  useLayoutEffect(() => {
    const measure = () => {
      const root = box.current?.getBoundingClientRect();
      if (!root) return;
      const out: { id: string; d: string }[] = [];
      for (const id of yours) {
        // measure the chips themselves, not their full-width list items
        const a = left.current[id]?.firstElementChild?.getBoundingClientRect();
        const b = right.current[id]?.firstElementChild?.getBoundingClientRect();
        if (!a || !b) continue;
        const x1 = a.right - root.left + 6;
        const y1 = a.top + a.height / 2 - root.top;
        const x2 = b.left - root.left - 6;
        const y2 = b.top + b.height / 2 - root.top;
        const mid = (x1 + x2) / 2;
        out.push({ id, d: `M${x1},${y1} C${mid},${y1} ${mid},${y2} ${x2},${y2}` });
      }
      setLines(out);
      setSize({ w: root.width, h: root.height });
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (box.current) ro.observe(box.current);
    return () => ro.disconnect();
  }, [yours, needed]);

  const chip = "inline-block rounded-control border px-2 py-1 font-mono text-[13px]";
  return (
    <div ref={box} className="relative mt-3 grid grid-cols-2 gap-x-16 sm:gap-x-24">
      <div>
        <p className="text-[13px] text-ink-muted">{t("practice.result.yours")}</p>
        <ul className="mt-1.5 space-y-1.5">
          {yours.map((id) => (
            <li key={id} ref={(el) => void (left.current[id] = el)}>
              <span className={`${chip} ${needed.includes(id) ? "border-evidence/60 bg-evidence-soft text-evidence" : "border-line text-ink-muted"}`}>{id}</span>
            </li>
          ))}
        </ul>
      </div>
      <div>
        <p className="text-[13px] text-ink-muted">{t("practice.result.needed")}</p>
        <ul className="mt-1.5 space-y-1.5">
          {needed.map((id) => (
            <li key={id} ref={(el) => void (right.current[id] = el)}>
              <span className={`${chip} border-evidence/60 text-evidence`}>{id}</span>
            </li>
          ))}
        </ul>
      </div>
      <svg className="pointer-events-none absolute inset-0 text-evidence" width={size.w} height={size.h} aria-hidden="true">
        {lines.map((l, i) => (
          <path key={l.id} d={l.d} fill="none" stroke="currentColor" strokeWidth="1.5" className="link-line" style={{ animationDelay: `${delay + i * 120}ms` }} />
        ))}
      </svg>
    </div>
  );
}
