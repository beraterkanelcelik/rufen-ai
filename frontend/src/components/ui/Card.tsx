import type { HTMLAttributes, ReactNode } from "react";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  hover?: boolean;
}

export function Card({
  children,
  hover = false,
  className = "",
  ...props
}: CardProps) {
  const hoverCls = hover
    ? "transition-all duration-200 hover:border-[#F97316]/50 hover:shadow-[0_0_30px_-10px_rgba(249,115,22,0.5)] cursor-pointer"
    : "";
  return (
    <div
      className={`rounded-[8px] border border-[#212121] bg-[#121212] ${hoverCls} ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={`p-5 pb-3 ${className}`}>{children}</div>;
}

export function CardBody({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={`p-5 pt-2 ${className}`}>{children}</div>;
}
