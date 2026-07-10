import * as React from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export const Checkbox = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>((
  { className, ...props }, ref
) => (
  <span className="relative inline-flex h-[18px] w-[18px] shrink-0">
    <input
      ref={ref}
      type="checkbox"
      className={cn(
        "peer h-[18px] w-[18px] shrink-0 appearance-none rounded-md border border-slate-300 bg-white cursor-pointer transition-colors checked:bg-blue-600 checked:border-blue-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    />
    <Check
      size={13}
      strokeWidth={3}
      className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-white opacity-0 peer-checked:opacity-100"
    />
  </span>
));
Checkbox.displayName = "Checkbox";
