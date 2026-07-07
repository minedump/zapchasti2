import * as React from "react";
import { cn } from "@/lib/utils";

interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  className?: string;
  "aria-label"?: string;
}

export const Toggle = React.forwardRef<HTMLButtonElement, ToggleProps>((
  { checked, onChange, disabled, className, ...props }, ref
) => (
  <button
    ref={ref}
    type="button"
    role="switch"
    aria-checked={checked}
    disabled={disabled}
    onClick={() => onChange(!checked)}
    className={cn(
      "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2",
      checked ? "bg-blue-600" : "bg-slate-200",
      className
    )}
    {...props}
  >
    <span
      className={cn(
        "inline-block h-4 w-4 transform rounded-full bg-white transition-transform",
        checked ? "translate-x-6" : "translate-x-1"
      )}
    />
  </button>
));
Toggle.displayName = "Toggle";
