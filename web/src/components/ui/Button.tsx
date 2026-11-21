import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from "react";
import { Link, type LinkProps } from "react-router-dom";

type Variant = "primary" | "secondary" | "ghost";
type Size = "sm" | "md";

// One button pair for the whole console: ink-filled primary, outlined secondary (brief: "ink" buttons, 2–4px radius).
const base =
  "hit relative inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-control border font-medium transition-[color,background-color,border-color,transform] duration-[120ms] ease-out active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100";

const variants: Record<Variant, string> = {
  primary: "border-ink bg-ink text-on-ink hover:bg-ink-secondary hover:border-ink-secondary",
  secondary: "border-line-strong bg-paper-raised text-ink hover:border-ink",
  ghost: "border-transparent bg-transparent text-ink-secondary hover:text-ink",
};

const sizes: Record<Size, string> = {
  sm: "h-8 px-3 text-[13px]",
  md: "h-10 px-4 text-[14px]",
};

export function buttonClasses(variant: Variant = "secondary", size: Size = "md", extra = "") {
  return `${base} ${variants[variant]} ${sizes[size]} ${extra}`.trim();
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

export function Button({ variant = "secondary", size = "md", className = "", type = "button", ...props }: ButtonProps) {
  return <button type={type} className={buttonClasses(variant, size, className)} {...props} />;
}

interface ButtonLinkProps extends LinkProps {
  variant?: Variant;
  size?: Size;
  children: ReactNode;
}

export function ButtonLink({ variant = "secondary", size = "md", className = "", children, ...props }: ButtonLinkProps) {
  return (
    <Link className={buttonClasses(variant, size, className)} {...props}>
      {children}
    </Link>
  );
}

interface ButtonAnchorProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  variant?: Variant;
  size?: Size;
}

export function ButtonAnchor({ variant = "secondary", size = "md", className = "", ...props }: ButtonAnchorProps) {
  return <a className={buttonClasses(variant, size, className)} {...props} />;
}
