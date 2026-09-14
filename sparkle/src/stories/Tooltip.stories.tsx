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

const meta: Meta<typeof Tooltip> = {
  title: "Overlays/Tooltip",
  tags: ["a11y-issues"],
  component: Tooltip,
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
};

export default meta;

/**
 * The simple `Tooltip` component: pass a `trigger` and a short `label`.
 * This covers most product use — reach for the composed API only when you
 * need custom placement or timing.
 *
 * @summary Simple trigger + label tooltip.
 */
export const Default = () => (
  <Tooltip
    trigger={<div className="text-foreground">Hover</div>}
    label="Add to library"
  />
);

/**
 * The `shortcut` prop renders the keyboard shortcut inline after the label —
 * use it to teach shortcuts on icon-only or frequently used actions.
 *
 * @summary Label with an inline keyboard shortcut.
 */
export const WithShortcut = () => (
  <Tooltip
    trigger={<div className="text-foreground">Hover for shortcut</div>}
    label="Add to library"
    shortcut="Cmd+K"
  />
);

/**
 * The composed API (`TooltipProvider` / `TooltipRoot` / `TooltipTrigger` /
 * `TooltipContent`) for full control: custom open delay, placement `side`,
 * and arbitrary content such as a `KeyboardShortcut` element.
 *
 * @summary Composed API for custom placement, timing, and content.
 */
export const ComposedWithCustomPlacement = () => (
  <TooltipProvider delayDuration={800} skipDelayDuration={500}>
    <TooltipRoot>
      <TooltipTrigger>
        <Icon visual={Robot} size="xs" />
      </TooltipTrigger>
      <TooltipContent side="right">
        <div className="inline-flex items-center gap-2">
          <span>Ask the agent</span>
          <KeyboardShortcut shortcut="Cmd+K" />
        </div>
      </TooltipContent>
    </TooltipRoot>
  </TooltipProvider>
);
