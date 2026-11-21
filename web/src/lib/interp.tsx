import { Fragment, type ReactNode } from "react";

/** Puts React nodes into a translated sentence: "With F1 = {f1} and {s} steps" -> parts with the nodes in place. */
export function interp(text: string, nodes: Record<string, ReactNode>): ReactNode {
  const out: ReactNode[] = [];
  const re = /\{(\w+)\}/g;
  let last = 0;
  let match: RegExpExecArray | null;
  let i = 0;
  while ((match = re.exec(text))) {
    if (match.index > last) out.push(<Fragment key={`t${i}`}>{text.slice(last, match.index)}</Fragment>);
    out.push(<Fragment key={`n${i}`}>{match[1] in nodes ? nodes[match[1]] : match[0]}</Fragment>);
    last = re.lastIndex;
    i += 1;
  }
  if (last < text.length) out.push(<Fragment key="end">{text.slice(last)}</Fragment>);
  return out;
}
