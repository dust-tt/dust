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

/**
 * Uncontrolled usage: the list owns the selection via `defaultValue`.
 * The most common form — reach for it when nothing else needs to react
 * to the selected value.
 *
 * @summary Uncontrolled switch with a default selection.
 */
export const Default: Story = {
  render: () => (
    <div className="w-[360px] p-4">
      <ButtonsSwitchList defaultValue="time" className="w-fit">
        <ButtonsSwitch value="time" label="Time range" />
        <ButtonsSwitch value="version" label="Version" />
      </ButtonsSwitchList>
    </div>
  ),
};

const ControlledExample = () => {
  const [mode, setMode] = React.useState("time");
  return (
    <ButtonsSwitchList value={mode} onValueChange={setMode}>
      <ButtonsSwitch value="time" label="Time range" />
      <ButtonsSwitch value="version" label="Version" />
      <ButtonsSwitch value="other" label="Other" />
    </ButtonsSwitchList>
  );
};

/**
 * Controlled usage: pass `value` and `onValueChange` and keep the selected
 * value in your own state. Use when the selection drives other UI (filters,
 * view switches) or must be set programmatically.
 *
 * @summary Controlled switch driven by external state.
 */
export const Controlled: Story = {
  render: () => <ControlledExample />,
};

/**
 * The three sizes side by side: `xs` for dense toolbars, `sm` as the
 * default, `md` where the switch is a primary control.
 *
 * @summary The xs / sm / md size scale.
 */
export const Sizes: Story = {
  render: () => (
    <div className="flex flex-col gap-4 p-4">
      <ButtonsSwitchList defaultValue="time" size="xs" className="w-fit">
        <ButtonsSwitch value="time" label="Time range" />
        <ButtonsSwitch value="version" label="Version" />
        <ButtonsSwitch value="other" label="Other" />
      </ButtonsSwitchList>
      <ButtonsSwitchList defaultValue="time" size="sm" className="w-fit">
        <ButtonsSwitch value="time" label="Time range" />
        <ButtonsSwitch value="version" label="Version" />
        <ButtonsSwitch value="other" label="Other" />
      </ButtonsSwitchList>
      <ButtonsSwitchList defaultValue="time" size="md" className="w-fit">
        <ButtonsSwitch value="time" label="Time range" />
        <ButtonsSwitch value="version" label="Version" />
        <ButtonsSwitch value="other" label="Other" />
      </ButtonsSwitchList>
    </div>
  ),
};
