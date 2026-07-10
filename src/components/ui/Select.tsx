import * as React from "react";
import { cn } from "@/lib/utils";

const CHEVRON = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`;

export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>((
  { className, children, style, ...props }, ref
) => (
  <select
    ref={ref}
    className={cn(
      "flex h-10 w-full appearance-none rounded-lg border border-slate-200 bg-white bg-no-repeat bg-[right_0.75rem_center] pl-3 pr-9 py-2 text-sm text-slate-900 focus-visible:outline-none focus-visible:border-slate-400 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer",
      className
    )}
    style={{ backgroundImage: CHEVRON, ...style }}
    {...props}
  >
    {children}
  </select>
));
Select.displayName = "Select";
