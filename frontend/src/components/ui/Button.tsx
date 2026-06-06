import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "outline" | "ghost";
type Size = "sm" | "md" | "lg";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  children: ReactNode;
}

const base =
  "inline-flex items-center justify-center gap-2 rounded-full font-medium transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#F97316]/60 disabled:opacity-50 disabled:pointer-events-none cursor-pointer select-none";

const variants: Record<Variant, string> = {
  primary:
    "bg-[#F97316] text-white hover:bg-[#fb8634] active:bg-[#ea670d] shadow-[0_0_20px_-6px_rgba(249,115,22,0.7)]",
  outline:
    "border border-[#212121] text-[#e0e0e0] hover:border-[#F97316]/60 hover:text-white bg-transparent",
  ghost: "text-[#8a8a8a] hover:text-white hover:bg-white/5",
};

const sizes: Record<Size, string> = {
  sm: "text-sm px-3 py-1.5",
  md: "text-sm px-4 py-2",
  lg: "text-base px-6 py-3",
};

export function Button({
  variant = "primary",
  size = "md",
  className = "",
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      className={`${base} ${variants[variant]} ${sizes[size]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
