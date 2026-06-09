import type { Meta } from "@storybook/react";
import React from "react";

import { CollapseButton } from "../index_with_tw_base";

const meta = {
  title: "Actions/CollapseButton",
  component: CollapseButton,
  parameters: {
    docs: {
      description: {
        component: `An animated chevron affordance for collapsing or expanding a side panel. It plays a Lottie animation on hover that points in the \`direction\` it controls (\`left\` or \`right\`), and adapts to surface contrast via \`variant\` (\`light\` or \`dark\`).

**When to use**
- As the toggle handle for a collapsible sidebar or rail.

**Guidelines**
- Point \`direction\` toward where the panel will go (\`left\` to collapse a left rail, \`right\` to expand it).
- Pick the \`variant\` that contrasts with the surface it sits on.
- It renders only the icon — wrap it in a tooltip or an accessible control if it needs a label.`,
      },
    },
  },
} satisfies Meta<typeof CollapseButton>;

export default meta;

export const CollapseExample = () => {
  return (
    <div className="s-flex s-flex-col s-gap-4">
      <CollapseButton direction="left" />
      <CollapseButton direction="right" />
    </div>
  );
};
