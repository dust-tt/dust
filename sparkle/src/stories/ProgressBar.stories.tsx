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
- Control the bar's width via \`className\` (e.g. \`w-24\`, \`w-full\`).`,
      },
    },
  },
  args: {
    percentage: 40,
  },
  argTypes: {
    percentage: {
      control: { type: "number", min: 0, max: 100 },
    },
  },
} satisfies Meta<typeof ProgressBar>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: (args) => <ProgressBar {...args} className="w-48" />,
};

export const Percentages: Story = {
  render: () => (
    <div className="flex w-48 flex-col gap-3">
      {[10, 40, 75, 100].map((percentage) => (
        <ProgressBar key={percentage} percentage={percentage} />
      ))}
    </div>
  ),
};
