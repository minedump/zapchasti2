import * as React from "react";
import { cn } from "@/lib/utils";

export const Checkbox = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>((
  { className, ...props }, ref
) => (
  <input
    ref={ref}
    type="checkbox"
    className={cn(
      "h-4 w-4 shrink-0 rounded border border-slate-300 text-blue-600 cursor-pointer accent-blue-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
      className
    )}
    {...props}
  />
));
Checkbox.displayName = "Checkbox";
