import type { Meta, StoryObj } from "@storybook/react";
import React from "react";

import { ButtonsSwitch, ButtonsSwitchList } from "../index_with_tw_base";

const meta = {
  title: "Actions/ButtonsSwitch",
  component: ButtonsSwitchList,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component: `A segmented, single-select toggle. **ButtonsSwitchList** is the container that owns the selected value (\`defaultValue\` for uncontrolled, plus \`size\` of \`xs\` / \`sm\` / \`md\`); each option is a **ButtonsSwitch** identified by its \`value\` and rendered with a \`label\`.

**When to use**
- To switch between a small set of mutually exclusive views or modes (e.g. "Time range" vs "Version").

**Guidelines**
- Keep options to a few short, parallel labels; this is not a substitute for a long list.
- Always render **ButtonsSwitch** items inside a **ButtonsSwitchList** so selection state is managed correctly.
- For triggering actions rather than selecting a mode, use **Button** or **ButtonGroup**.`,
      },
    },
  },
} satisfies Meta<typeof ButtonsSwitchList>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <div className="s-w-[360px] s-p-4">
      <ButtonsSwitchList defaultValue="time" className="s-w-fit">
        <ButtonsSwitch value="time" label="Time range" />
        <ButtonsSwitch value="version" label="Version" />
      </ButtonsSwitchList>
    </div>
  ),
};

export const Controlled: Story = {
  render: () => (
    <ButtonsSwitchList defaultValue="time">
      <ButtonsSwitch value="time" label="Time range" />
      <ButtonsSwitch value="version" label="Version" />
      <ButtonsSwitch value="other" label="Other" />
    </ButtonsSwitchList>
  ),
};

export const Sizes: Story = {
  render: () => (
    <div className="s-flex s-flex-col s-gap-4 s-p-4">
      <ButtonsSwitchList defaultValue="time" size="xs" className="s-w-fit">
        <ButtonsSwitch value="time" label="Time range" />
        <ButtonsSwitch value="version" label="Version" />
        <ButtonsSwitch value="other" label="Other" />
      </ButtonsSwitchList>
      <ButtonsSwitchList defaultValue="time" size="sm" className="s-w-fit">
        <ButtonsSwitch value="time" label="Time range" />
        <ButtonsSwitch value="version" label="Version" />
        <ButtonsSwitch value="other" label="Other" />
      </ButtonsSwitchList>
      <ButtonsSwitchList defaultValue="time" size="md" className="s-w-fit">
        <ButtonsSwitch value="time" label="Time range" />
        <ButtonsSwitch value="version" label="Version" />
        <ButtonsSwitch value="other" label="Other" />
      </ButtonsSwitchList>
    </div>
  ),
};
