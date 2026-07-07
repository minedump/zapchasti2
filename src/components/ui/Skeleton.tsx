import { cn } from "@/lib/utils";

export const Skeleton = ({ className }: { className?: string }) => (
  <div className={cn("animate-pulse rounded-md bg-slate-200", className)} />
);
