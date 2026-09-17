import { cn } from "@viz/lib/utils";

export const SLIDESHOW_BUTTON_CLASS_NAME =
  "h-10 w-10 rounded-2xl px-2.5 py-2 text-muted-foreground transition-colors duration-150 ease-out hover:bg-transparent hover:text-foreground focus-visible:text-foreground focus-visible:ring-inset dark:hover:bg-transparent motion-reduce:transition-none";
export const SLIDESHOW_ICON_CLASS_NAME =
  "size-5 drop-shadow-[0_0.75px_1.125px_rgba(0,0,0,0.08)]";

export const SLIDESHOW_SURFACE_CLASS_NAME = cn(
  "bg-gradient-to-b from-white to-[oklch(98.6%_0.002_67.802)]",
  "shadow-[0_0_0_1px_rgba(0,0,0,0.06),0_1px_1px_-0.5px_rgba(0,0,0,0.06),0_3px_3px_-1.5px_rgba(0,0,0,0.06)]",
  "dark:from-[oklch(34.6%_0.009_80.674)] dark:to-[oklch(25.6%_0.006_34.298)]",
  "dark:shadow-[0_0_0_1px_rgba(0,0,0,0.12),0_1px_1px_-0.5px_rgba(0,0,0,0.18),0_3px_3px_-1.5px_rgba(0,0,0,0.18),inset_0_1px_0_0_rgba(255,255,255,0.02),inset_0_0_0_1px_rgba(255,255,255,0.02)]",
  // Keep the mock's Stone palette local to the controls so frame themes stay intact.
  "[--foreground:oklch(20.6%_0.005_67.543)] [--muted-foreground:oklch(44.4%_0.011_78.213)] [--border:oklch(94.9%_0.003_106.45)]",
  "dark:[--foreground:oklch(92.3%_0.003_48.717)] dark:[--muted-foreground:oklch(70.9%_0.01_62.526)] dark:[--border:oklch(37.4%_0.01_73.594)]"
);
