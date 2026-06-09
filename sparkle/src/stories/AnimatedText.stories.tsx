import { Meta } from "@storybook/react";
import React from "react";

import { AnimatedText } from "../index_with_tw_base";

const meta = {
  title: "Effects & Motion/AnimatedText",
  component: AnimatedText,
  parameters: {
    docs: {
      description: {
        component: `Text with a shimmering gradient that sweeps across the characters, signalling that something is in progress (e.g. a "Thinking..." indicator). Pick a **variant** to tint the shimmer to a semantic or brand color — \`primary\`, \`muted\`, \`highlight\`, \`success\`, \`warning\`, \`info\`, \`green\`, \`blue\`, \`rose\`, \`golden\`, or \`white\`.

**When to use**
- For ephemeral "agent is working" states where there is no measurable progress.

**Guidelines**
- Keep the text short so the sweep stays legible; longer strings simply animate over a wider span.
- For a generic, non-text loading indicator use the **Spinner** instead.`,
      },
    },
  },
} satisfies Meta<typeof AnimatedText>;

export default meta;

export function AnimatedShinyTextDemo() {
  return (
    <div className="s-flex s-gap-3">
      <div className="s-z-10 s-flex s-min-h-64 s-flex-col s-items-center s-justify-center s-gap-4">
        <div className="s-rounded-2xl s-bg-muted s-p-4 dark:s-bg-muted-night">
          <AnimatedText>Thinking...</AnimatedText>
        </div>

        <div className="s-rounded-2xl s-bg-muted s-p-4 dark:s-bg-muted-night">
          <AnimatedText>Thinking a long time</AnimatedText>
        </div>

        <div className="s-rounded-2xl s-bg-muted s-p-4 dark:s-bg-muted-night">
          <AnimatedText>Thinking a long long long long time</AnimatedText>
        </div>
      </div>
      <div className="s-z-10 s-flex s-min-h-64 s-flex-col s-items-center s-justify-center s-gap-4">
        <div className="s-rounded-2xl s-bg-highlight-50 s-p-4 dark:s-bg-highlight-50-night">
          <AnimatedText variant="highlight">Thinking...</AnimatedText>
        </div>

        <div className="s-rounded-2xl s-bg-highlight-50 s-p-4 dark:s-bg-highlight-50-night">
          <AnimatedText variant="highlight">Thinking a long time</AnimatedText>
        </div>

        <div className="s-rounded-2xl s-bg-highlight-50 s-p-4 dark:s-bg-highlight-50-night">
          <AnimatedText variant="highlight">
            Thinking a long long long long time
          </AnimatedText>
        </div>
      </div>
    </div>
  );
}
