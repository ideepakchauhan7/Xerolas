import { type ComponentPropsWithoutRef } from "react";
import { cn } from "@/lib/utils";

export interface AnimatedGradientTextProps extends ComponentPropsWithoutRef<"span"> {
  colorFrom?: string;
  colorTo?: string;
}

export function AnimatedGradientText({
  children,
  className,
  colorFrom = "#a78bfa",
  colorTo = "#60a5fa",
  ...props
}: AnimatedGradientTextProps) {
  return (
    <span
      style={
        {
          "--color-from": colorFrom,
          "--color-to": colorTo,
        } as React.CSSProperties
      }
      className={cn(
        "animate-gradient inline bg-gradient-to-r from-[--color-from] via-[--color-to] to-[--color-from] bg-[length:200%_100%] bg-clip-text text-transparent",
        className
      )}
      {...props}
    >
      {children}
    </span>
  );
}
