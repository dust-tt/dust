import type { Meta } from "@storybook/react";
import React from "react";

import {
  Icon,
  KeyboardShortcut,
  Robot,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipRoot,
  TooltipTrigger,
} from "../index_with_tw_base";

const meta = {
  title: "Overlays/Tooltip",
  component: TooltipProvider,
  parameters: {
    docs: {
      description: {
        component: `Displays a brief, contextual label when the user hovers or focuses a trigger — ideal for clarifying icon-only controls or surfacing a keyboard shortcut. Use the simple **Tooltip** (a **trigger** plus a **label**, with an optional **shortcut**) for most cases, or compose **TooltipProvider** / **TooltipRoot** / **TooltipTrigger** / **TooltipContent** for full control over placement and timing.

**When to use**
- To name or explain an icon-only button or a truncated value.
- To reveal a keyboard shortcut for an action.

**Guidelines**
- Never place essential information or interactive elements only inside a tooltip — it is not reachable on touch and disappears on blur.
- Keep labels to a few words.
- Always provide a tooltip for icon-only buttons.`,
      },
    },
  },
} satisfies Meta<typeof TooltipProvider>;

export default meta;

export const TooltipExample = () => (
  <Tooltip
    trigger={
      <div className="s-text-foreground dark:s-text-foreground-night">
        Hover
      </div>
    }
    label={<p>Add to library</p>}
  />
);

export const TooltipWithShortcut = () => (
  <Tooltip
    trigger={
      <div className="s-text-foreground dark:s-text-foreground-night">
        Hover for shortcut
      </div>
    }
    label="Add to library"
    shortcut="Cmd+K"
  />
);

export const TooltipWithManual = () => (
  <TooltipProvider delayDuration={800} skipDelayDuration={500}>
    <TooltipRoot
      onOpenChange={(open: boolean) => {
        console.log(`Is open: ${open}`);
      }}
    >
      <TooltipTrigger>
        <Icon visual={Robot} size="xs" />
      </TooltipTrigger>
      <TooltipContent side="right" sideOffset={50}>
        This is a tooltip with a very long label that should wrap onto multiple
        lines. Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed non
        risus. Suspendisse lectus tortor, dignissim sit amet, adipiscing nec,
        ultricies sed, dolor.
      </TooltipContent>
    </TooltipRoot>
  </TooltipProvider>
);

export const TooltipWithKeyboardShortcutComponent = () => (
  <TooltipProvider>
    <TooltipRoot>
      <TooltipTrigger>
        <div className="s-text-foreground dark:s-text-foreground-night">
          Hover for inline shortcut
        </div>
      </TooltipTrigger>
      <TooltipContent>
        <div className="s-inline-flex s-items-center s-gap-2">
          <span>Add to library</span>
          <KeyboardShortcut shortcut="Cmd+K" />
        </div>
      </TooltipContent>
    </TooltipRoot>
  </TooltipProvider>
);
