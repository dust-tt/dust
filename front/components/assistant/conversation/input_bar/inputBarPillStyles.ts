// Shared border/background/shadow treatment for the input bar's left-cluster
// pill controls (agent pill, "+" menu button) so they read as one consistent
// set. Kept in its own module (not exported from InputBarButtons.tsx) so
// InputBarPlusMenu can use it without an import cycle.
export const INPUT_BAR_PILL_SURFACE_CLASSNAME =
  "border-[0.5px] border-border-dark bg-background dark:bg-[oklch(0.346_0.009_80.674)] " +
  "shadow-[inset_2px_-2px_7px_0px_rgba(0,0,0,0.02),0px_0.5px_0.5px_0px_rgba(0,0,0,0.04)]";

export const INPUT_BAR_PILL_HOVER_CLASSNAME =
  "hover:bg-primary-100 dark:hover:bg-[oklch(0.393_0.013_76.451)]";
