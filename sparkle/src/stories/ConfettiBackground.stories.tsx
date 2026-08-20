import type { Meta, StoryObj } from "@storybook/react";
import React, { useRef } from "react";

import { ConfettiBackground } from "@sparkle/index";

const meta = {
  title: "Effects & Motion/ConfettiBackground",
  component: ConfettiBackground,
  parameters: {
    docs: {
      description: {
        component: `A full-bleed canvas of falling particles used as a celebratory or atmospheric backdrop. The **variant** prop switches between \`confetti\` (festive, multicolor) and \`snow\` (calm, drifting flakes), and **referentSize** takes a ref to the sizing container so the canvas matches its dimensions.

**When to use**
- To celebrate a milestone or success moment (onboarding complete, plan upgraded).
- For seasonal or decorative ambiance behind a hero or empty state.

**Guidelines**
- Render it inside a positioned, sized container and pass that container's ref to **referentSize**.
- Use sparingly and keep it behind content so it never competes with primary actions.`,
      },
    },
  },
  argTypes: {
    variant: {
      description: "Particle style of the backdrop",
      options: ["confetti", "snow"],
      control: { type: "select" },
    },
    width: { control: false },
    height: { control: false },
    referentSize: { control: false },
  },
  // The component sizes itself from a ref to its container, so the story
  // render owns that container and wires the ref.
  render: function Render(args) {
    const referentRef = useRef<HTMLDivElement>(null);
    return (
      <div className="h-[100vh] w-full" ref={referentRef}>
        <ConfettiBackground {...args} referentSize={referentRef} />
      </div>
    );
  },
} satisfies Meta<typeof ConfettiBackground>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * The festive multicolor variant, for celebrating a success moment such as
 * completed onboarding or a plan upgrade.
 * @summary Multicolor confetti backdrop.
 */
export const Confetti: Story = {
  args: { variant: "confetti" },
};

/**
 * The calm variant with white-blue drifting flakes, for seasonal or
 * decorative ambiance rather than celebration.
 * @summary Drifting snow backdrop.
 */
export const Snow: Story = {
  args: { variant: "snow" },
};
