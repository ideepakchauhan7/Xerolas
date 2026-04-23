"use client";

import React, { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

interface MeteorsProps {
  number?: number;
  className?: string;
}

export function Meteors({ number = 15, className }: MeteorsProps) {
  const [meteorStyles, setMeteorStyles] = useState<React.CSSProperties[]>([]);

  // Only set styles on the client to avoid SSR/hydration mismatch with Math.random()
  useEffect(() => {
    const styles = Array.from({ length: number }, () => ({
      top: `${Math.random() * 40}%`,
      left: `${Math.random() * 100}%`,
      animationDelay: `${Math.random() * 8}s`,
      animationDuration: `${Math.random() * 4 + 3}s`,
    }));
    setMeteorStyles(styles);
  }, [number]);

  // Render nothing on server — populated only after client mount
  if (meteorStyles.length === 0) return null;

  return (
    <>
      {meteorStyles.map((style, idx) => (
        <span
          key={idx}
          style={style}
          className={cn(
            "animate-meteor pointer-events-none absolute h-0.5 w-0.5 rounded-full bg-violet-400/40 shadow-[0_0_0_1px_rgba(167,139,250,0.1)]",
            className
          )}
        >
          <div className="pointer-events-none absolute top-1/2 -z-10 h-px w-20 -translate-y-1/2 bg-gradient-to-r from-violet-400/40 to-transparent" />
        </span>
      ))}
    </>
  );
}
