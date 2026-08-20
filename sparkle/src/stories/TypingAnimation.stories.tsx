import type { Meta, StoryObj } from "@storybook/react";
import { fn } from "storybook/test";

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
  argTypes: {
    text: {
      control: "text",
      description: "The string revealed one character at a time",
    },
    duration: {
      control: { type: "number", min: 10, max: 500, step: 10 },
      description: "Delay in milliseconds between characters",
    },
  },
} satisfies Meta<typeof TypingAnimation>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * A short message revealed character by character, as when an agent appears
 * to type its reply. **duration** sets the per-character delay and
 * **onComplete** fires once the full text is shown.
 * @summary Character-by-character text reveal.
 */
export const StreamingText: Story = {
  args: {
    text: "Searching your knowledge base…",
    duration: 50,
    onComplete: fn(),
  },
};
