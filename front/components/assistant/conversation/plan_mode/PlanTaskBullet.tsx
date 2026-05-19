import { cn } from "@dust-tt/sparkle";

// `mt-0.5` vertically centers the 16px circle on the 20px first line of
// `copy-sm` text.
export function PlanTaskBullet() {
  return (
    <span
      aria-hidden
      className={cn(
        "mt-0.5 h-4 w-4 shrink-0 rounded-full border-2",
        "border-faint dark:border-faint-night"
      )}
    />
  );
}
