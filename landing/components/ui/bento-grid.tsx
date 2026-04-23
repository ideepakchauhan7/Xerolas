import { type ComponentPropsWithoutRef, type ReactNode } from "react";
import { cn } from "@/lib/utils";

interface BentoGridProps extends ComponentPropsWithoutRef<"div"> {
  children: ReactNode;
  className?: string;
}

interface BentoCardProps {
  name: string;
  className?: string;
  background?: ReactNode;
  Icon: React.ElementType;
  description: string;
  tag?: string;
}

export function BentoGrid({ children, className, ...props }: BentoGridProps) {
  return (
    <div
      className={cn(
        "grid w-full auto-rows-[18rem] grid-cols-1 md:grid-cols-3 gap-4",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function BentoCard({
  name,
  className,
  background,
  Icon,
  description,
  tag,
}: BentoCardProps) {
  return (
    <div
      className={cn(
        "group relative col-span-1 flex flex-col justify-between overflow-hidden rounded-2xl",
        "bg-white/[0.03] border border-white/[0.08]",
        "transition-all duration-300 hover:border-violet-500/30 hover:shadow-[0_0_40px_rgba(139,92,246,0.08)]",
        className
      )}
    >
      {background && (
        <div className="absolute inset-0 opacity-60 transition-opacity duration-300 group-hover:opacity-80">
          {background}
        </div>
      )}

      <div className="relative z-10 flex flex-col gap-3 p-6 h-full justify-end">
        {tag && (
          <span className="w-fit text-xs font-medium px-2 py-0.5 rounded-full bg-violet-500/10 text-violet-400 border border-violet-500/20">
            {tag}
          </span>
        )}
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/[0.06] border border-white/[0.08] group-hover:bg-violet-500/10 group-hover:border-violet-500/20 transition-colors duration-300">
            <Icon className="h-5 w-5 text-neutral-400 group-hover:text-violet-400 transition-colors duration-300" />
          </div>
          <h3 className="font-semibold text-white text-base leading-tight">
            {name}
          </h3>
        </div>
        <p className="text-sm text-neutral-500 leading-relaxed">{description}</p>
      </div>
    </div>
  );
}
