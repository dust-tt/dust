import type { Meta } from "@storybook/react";
import React from "react";

import { TypingAnimation } from "@sparkle/components";

const meta = {
  title: "Effects & Motion/TypingAnimation",
  component: TypingAnimation,
  parameters: {
    docs: {
      description: {
        component: `Reveals a string one character at a time to mimic live typing. Pass the content via the **text** prop and the component handles the per-character animation.

**When to use**
- For playful intros, hero text, or to suggest an agent is "typing" a short message.

**Guidelines**
- Keep **text** concise so the reveal does not feel slow; for streaming model output that genuinely arrives token-by-token, render the real tokens rather than this decorative effect.`,
      },
    },
  },
} satisfies Meta<typeof TypingAnimation>;

export default meta;

export const Demo = () => {
  return (
    <div>
      <div className="s-flex s-items-center s-space-x-2 s-text-xl">
        <TypingAnimation text="Hello world" />
      </div>
    </div>
  );
};
