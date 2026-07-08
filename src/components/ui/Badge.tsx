import * as React from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export type BadgeVariant = 'neutral' | 'green' | 'red' | 'telegram' | 'wechat';

const VARIANT_CLASSES: Record<BadgeVariant, string> = {
  neutral: 'bg-slate-100 text-slate-600',
  green: 'bg-emerald-100 text-emerald-700',
  red: 'bg-red-100 text-red-600',
  telegram: 'bg-sky-100 text-sky-600',
  wechat: 'bg-emerald-100 text-emerald-600',
};

export function Badge({
  children,
  variant = 'neutral',
  color,
  icon,
  dot,
  mono = false,
  uppercase = !mono,
  onRemove,
  removeTitle,
  title,
  className,
}: {
  children: React.ReactNode;
  variant?: BadgeVariant;
  /** Custom hex color for user-configurable data (order statuses, tags) — overrides `variant`. */
  color?: string;
  icon?: React.ReactNode;
  dot?: boolean;
  mono?: boolean;
  uppercase?: boolean;
  onRemove?: () => void;
  removeTitle?: string;
  title?: string;
  className?: string;
}) {
  return (
    <span
      title={title}
      className={cn(
        'inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold whitespace-nowrap shrink-0',
        mono && 'font-mono',
        uppercase && 'uppercase',
        !color && VARIANT_CLASSES[variant],
        className
      )}
      style={color ? { backgroundColor: color + '20', color } : undefined}
    >
      {dot && <span className="w-1.5 h-1.5 rounded-full shrink-0 bg-current" />}
      {icon}
      {children}
      {onRemove && (
        <button
          type="button"
          title={removeTitle}
          onMouseDown={(e) => { e.stopPropagation(); onRemove(); }}
          className="ml-0.5 w-3.5 h-3.5 flex items-center justify-center rounded-full hover:bg-black/10 shrink-0"
        >
          <X size={9} />
        </button>
      )}
    </span>
  );
}
