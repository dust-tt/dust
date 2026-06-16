import type { Meta } from "@storybook/react";
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
} satisfies Meta<typeof ConfettiBackground>;

export default meta;

export const ConfettiExample = () => {
  const referentRef = useRef<HTMLDivElement>(null);
  return (
    <div className="s-h-[100vh] s-w-full" ref={referentRef}>
      <ConfettiBackground variant="confetti" referentSize={referentRef} />
    </div>
  );
};
export const SnowExample = () => {
  const referentRef = useRef<HTMLDivElement>(null);
  return (
    <div className="s-h-[100vh] s-w-full" ref={referentRef}>
      <ConfettiBackground variant="snow" referentSize={referentRef} />
    </div>
  );
};
