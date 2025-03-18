import React from "react";

import { cn } from "@sparkle/lib";

export default {
  title: "Playground/Demo",
};

export const Demo = () => {
  return (
    <div
      className={cn(
        "s-space-y-2 s-border-y s-px-3 s-py-3 s-text-xs",
        "s-border-info-200 dark:s-border-info-200-night",
        "s-bg-info-100 dark:s-bg-info-100-night",
        "s-text-info-900 dark:s-text-info-900-night"
      )}
    >
      <div className="s-font-bold">Title</div>
      <div className="s-font-normal">Description</div>
      <div>Check our page for updates.</div>
    </div>
  );
};
