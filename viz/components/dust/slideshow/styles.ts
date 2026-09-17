import { cn } from "@viz/lib/utils";

export const SLIDESHOW_BUTTON_CLASS_NAME =
  "h-10 w-10 rounded-2xl px-2.5 py-2 text-muted-foreground transition-colors duration-150 ease-out hover:bg-transparent hover:text-foreground focus-visible:text-foreground focus-visible:ring-inset dark:hover:bg-transparent motion-reduce:transition-none";
export const SLIDESHOW_ICON_CLASS_NAME =
  "size-5 drop-shadow-[0_0.75px_1.125px_rgba(0,0,0,0.08)]";

export const SLIDESHOW_SURFACE_CLASS_NAME = cn(
  "bg-gradient-to-b from-white to-stone-50",
  "shadow-[0_0_0_1px_rgba(0,0,0,0.06),0_1px_1px_-0.5px_rgba(0,0,0,0.06),0_3px_3px_-1.5px_rgba(0,0,0,0.06)]",
  "dark:from-stone-725 dark:to-stone-800",
  "dark:shadow-[0_0_0_1px_rgba(0,0,0,0.12),0_1px_1px_-0.5px_rgba(0,0,0,0.18),0_3px_3px_-1.5px_rgba(0,0,0,0.18),inset_0_1px_0_0_rgba(255,255,255,0.02),inset_0_0_0_1px_rgba(255,255,255,0.02)]",
  // Keep the controls on the Stone palette even when a frame customizes its theme.
  "[--foreground:theme(colors.stone.900)] [--muted-foreground:theme(colors.stone.600)] [--border:theme(colors.stone.150)]",
  "dark:[--foreground:theme(colors.stone.200)] dark:[--muted-foreground:theme(colors.stone.400)] dark:[--border:theme(colors.stone.700)]"
);
