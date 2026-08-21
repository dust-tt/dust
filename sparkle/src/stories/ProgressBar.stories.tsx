import type { Meta, StoryObj } from "@storybook/react";
import React from "react";

import { ProgressBar } from "../components/ProgressBar";

const meta = {
  title: "Data Display/ProgressBar",
  component: ProgressBar,
  parameters: {
    docs: {
      description: {
        component: `A thin horizontal bar that communicates a share or completion percentage — e.g. a cost share breakdown or a progress indicator.

**When to use**
- To show a proportion or completion percentage inline, typically alongside a label or numeric value.

**Guidelines**
- Pass a \`percentage\` between 0 and 100; out-of-range values are clamped.
- Pass an array to \`values\` to render adjacent segments separated by a 2px gap. Each entry pairs its \`value\` with an optional \`className\`; values are normalized to total 100.
- Use \`radius\` to switch between square, extra-small, and fully rounded corners.
- Control the bar's width via \`className\` (e.g. \`w-24\`, \`w-full\`).`,
      },
    },
  },
  args: {
    percentage: 40,
    label: "Upload progress",
  },
  argTypes: {
    percentage: {
      control: { type: "number", min: 0, max: 100 },
    },
  },
} satisfies Meta<typeof ProgressBar>;

export default meta;

type Story = StoryObj<typeof meta>;

/**
 * An in-progress bar at 40% — adjust `percentage` from the Controls panel to
 * see any fill level. Width comes from the `className` (here `w-48`).
 * @summary Bar at an adjustable percentage.
 */
export const Default: Story = {
  render: (args) => <ProgressBar {...args} className="w-48" />,
};

/**
 * Visual gallery: the same bar at 10 / 40 / 75 / 100% to compare fill levels
 * side by side.
 * @summary Visual gallery of fill levels.
 */
export const Percentages: Story = {
  tags: ["!manifest"],
  render: () => (
    <div className="flex w-48 flex-col gap-3">
      {[10, 40, 75, 100].map((percentage) => (
        <ProgressBar key={percentage} percentage={percentage} />
      ))}
    </div>
  ),
};

export const Segmented: Story = {
  render: () => (
    <ProgressBar
      className="h-2 w-48 bg-background"
      values={[
        { value: 7, className: "bg-highlight-500" },
        { value: 4, className: "bg-highlight-100" },
        { value: 9, className: "bg-muted-background" },
      ]}
      radius="xs"
    />
  ),
};
