import type { Meta, StoryObj } from "@storybook/react";
import React from "react";

import { ProgressRing } from "../components/ProgressRing";

const meta = {
  title: "Data Display/ProgressRing",
  component: ProgressRing,
  parameters: {
    docs: {
      description: {
        component: `A small circular determinate progress indicator — e.g. a per-seat or per-item usage ring shown inline in a table cell.

**When to use**
- To show a proportion or completion percentage in a compact, inline form where a full-width bar would not fit.

**Guidelines**
- Pass a \`percentage\` between 0 and 100; out-of-range values are clamped.
- The fill follows \`currentColor\`, so color it with a text color utility via \`className\` (e.g. \`text-warning-500\`).
- Use \`size\` and \`strokeWidth\` to adjust the ring's dimensions.`,
      },
    },
  },
  args: {
    percentage: 40,
    label: "Seat usage",
  },
  argTypes: {
    percentage: {
      control: { type: "number", min: 0, max: 100 },
    },
  },
} satisfies Meta<typeof ProgressRing>;

export default meta;

type Story = StoryObj<typeof meta>;

/**
 * A ring at 40% — adjust `percentage` from the Controls panel to see any
 * fill level.
 * @summary Ring at an adjustable percentage.
 */
export const Default: Story = {
  render: (args) => <ProgressRing {...args} />,
};

/**
 * Visual gallery: the same ring at 10 / 40 / 75 / 100% to compare fill
 * levels side by side.
 * @summary Visual gallery of fill levels.
 */
export const Percentages: Story = {
  tags: ["!manifest"],
  render: () => (
    <div className="flex items-center gap-3">
      {[10, 40, 75, 100].map((percentage) => (
        <ProgressRing key={percentage} percentage={percentage} />
      ))}
    </div>
  ),
};

/**
 * Color follows `currentColor`, so it can be set per-instance via
 * `className` to reflect state (e.g. normal, off-pace, over limit).
 * @summary Colored via `className`.
 */
export const Colors: Story = {
  tags: ["!manifest"],
  render: () => (
    <div className="flex items-center gap-3">
      <ProgressRing percentage={40} className="text-muted-foreground" />
      <ProgressRing percentage={75} className="text-warning-500" />
      <ProgressRing percentage={100} className="text-red-500" />
    </div>
  ),
};
