import type { Meta, StoryObj } from "@storybook/react";
import React, { useState } from "react";

import { cn, RainbowEffect } from "../index_with_tw_base";

const meta = {
  title: "Effects & Motion/RainbowEffect",
  component: RainbowEffect,
  parameters: {
    docs: {
      description: {
        component: `Wraps a child element in an animated, multicolor glow that bleeds out from behind it — typically used to highlight a focused input or active surface. The **size** prop controls how far the glow spreads (e.g. \`medium\` at rest, \`large\` when active), and **containerClassName** / **className** size the wrapper and inner layer.

**When to use**
- To draw attention to a primary input or call-to-action when it becomes focused or active.

**Guidelines**
- Drive **size** from state (e.g. enlarge on focus) so the glow responds to interaction.
- Use on one focal element at a time; multiple competing glows dilute the emphasis.`,
      },
    },
  },
} satisfies Meta<typeof RainbowEffect>;

export default meta;

// Story scaffolding: a focusable surface that drives the RainbowEffect `size`
// from its focus state. In product code, drive `size` from whatever state
// should trigger emphasis (input focus, active step, etc.).
const FocusGlowDemo = () => {
  const [isFocused, setIsFocused] = useState(false);

  return (
    <div className="flex w-[600px]">
      <RainbowEffect
        containerClassName="w-full"
        className="w-full"
        size={isFocused ? "large" : "medium"}
      >
        <div
          tabIndex={0}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          className={cn(
            "relative flex h-[120px] w-full flex-row p-5",
            "rounded-3xl border border-transparent bg-primary-50 transition-all",
            isFocused && "border-border ring-2 ring-highlight-300 ring-offset-2"
          )}
        >
          Click or tab here to focus
        </div>
      </RainbowEffect>
    </div>
  );
};

/**
 * The glow grows from `medium` to `large` when the wrapped surface gains
 * focus, the component's primary use case. The focusable div and its focus
 * state are story scaffolding — only the `size` switch is the RainbowEffect
 * API at work.
 * @summary Glow enlarges when the wrapped element is focused.
 */
export const FocusGlow: StoryObj = {
  render: () => <FocusGlowDemo />,
};
