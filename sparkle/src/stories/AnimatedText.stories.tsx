import type { Meta, StoryObj } from "@storybook/react";
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
type Story = StoryObj<typeof meta>;

/**
 * The canonical use case: a short "Thinking..." indicator with the default
 * `muted` shimmer, shown while an agent works without measurable progress.
 * @summary Default muted thinking indicator.
 */
export const ThinkingIndicator: Story = {
  args: {
    children: "Thinking...",
  },
  render: (args) => (
    <div className="rounded-2xl bg-muted p-4">
      <AnimatedText {...args} />
    </div>
  ),
};

/**
 * A representative subset of the eleven shimmer variants: the default
 * `muted`, the brand `highlight`, the semantic `success` / `warning` / `info`
 * tints, and the `blue` accent. The remaining variants follow the same
 * pattern with different palettes.
 * @summary Representative color variants.
 */
export const ColorVariants: StoryObj = {
  render: () => (
    <div className="flex flex-col items-start gap-4">
      <div className="rounded-2xl bg-muted p-4">
        <AnimatedText variant="muted">Thinking...</AnimatedText>
      </div>
      <div className="rounded-2xl bg-highlight-50 p-4">
        <AnimatedText variant="highlight">Thinking...</AnimatedText>
      </div>
      <div className="rounded-2xl bg-muted p-4">
        <AnimatedText variant="success">Running checks...</AnimatedText>
      </div>
      <div className="rounded-2xl bg-muted p-4">
        <AnimatedText variant="warning">Retrying...</AnimatedText>
      </div>
      <div className="rounded-2xl bg-muted p-4">
        <AnimatedText variant="info">Fetching sources...</AnimatedText>
      </div>
      <div className="rounded-2xl bg-muted p-4">
        <AnimatedText variant="blue">Browsing the web...</AnimatedText>
      </div>
    </div>
  ),
};
