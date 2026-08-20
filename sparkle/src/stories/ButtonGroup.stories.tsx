import type { Meta, StoryObj } from "@storybook/react";
import React from "react";

import {
  BUTTON_VARIANTS,
  type ButtonSizeType,
  type ButtonVariantType,
} from "@sparkle/components/Button";

import {
  RefreshCw02,
  Button,
  ButtonGroup,
  ButtonGroupDropdown,
  ChevronDown,
  Clipboard,
  Plus,
  Robot,
  Separator,
  Trash01,
} from "../index_with_tw_base";

const DefaultButtons = ({
  variant = "outline",
  size = "sm",
}: {
  variant?: ButtonVariantType;
  size?: ButtonSizeType;
}) => (
  <>
    <Button label="First" variant={variant} size={size} />
    <Button label="Second" variant={variant} size={size} />
    <Button label="Third" variant={variant} size={size} />
  </>
);

const meta = {
  title: "Actions/ButtonGroup",
  component: ButtonGroup,
  tags: ["a11y-issues", "autodocs"],
  parameters: {
    docs: {
      description: {
        component: `Groups related **Button**s into a single cohesive control. It lays them out **horizontal** or **vertical** (\`orientation\`), can merge their borders into a segmented control (\`removeGaps\`), and propagates a \`disabled\` state to every child. Use **ButtonGroupDropdown** as a child to attach an overflow menu (e.g. a split-button affordance).

**When to use**
- To present a set of closely related actions as one unit (e.g. a toolbar segment).
- To build a split button by pairing a primary **Button** with a **ButtonGroupDropdown** for secondary options.

**Guidelines**
- Keep all child **Button**s on the same \`variant\` and \`size\` for visual consistency.
- Use \`removeGaps\` for a segmented look; keep gaps when the actions are independent.
- For a single button with an attached chevron menu, prefer **SplitButton** (\`FlexSplitButton\`) instead.`,
      },
    },
  },
  argTypes: {
    orientation: {
      description: "Stack buttons horizontally or vertically",
      control: { type: "select" },
      options: ["horizontal", "vertical"],
    },
    disabled: {
      description: "Disable all buttons in the group",
      control: "boolean",
    },
    removeGaps: {
      description: "Remove gaps and merge button borders",
      control: "boolean",
    },
    children: {
      table: { disable: true },
    },
  },
  args: {
    children: <DefaultButtons />,
    orientation: "horizontal",
    disabled: false,
    removeGaps: true,
  },
} satisfies Meta<typeof ButtonGroup>;

export default meta;

type Story = StoryObj<typeof meta>;

/**
 * Interactive segmented group of three outline buttons — toggle orientation,
 * removeGaps, and disabled from the Controls panel.
 * @summary Interactive playground.
 */
export const Playground: Story = {
  args: {
    orientation: "horizontal",
    disabled: false,
    removeGaps: true,
  },
};

/**
 * Child buttons keep their own icons and labels inside the group; the group
 * only handles layout and border merging.
 * @summary Buttons with leading icons.
 */
export const WithIcons: Story = {
  args: {
    children: (
      <>
        <Button icon={Plus} label="Add" variant="outline" size="sm" />
        <Button icon={Robot} label="Agent" variant="outline" size="sm" />
        <Button label="More" variant="outline" size="sm" />
      </>
    ),
  },
};

/**
 * Buttons using **isCounter** work inside a group — useful for segmented
 * views where each segment carries a count (inbox-style navigation).
 * @summary Segmented buttons with inline counters.
 */
export const WithCounters: Story = {
  args: {
    children: (
      <>
        <Button
          label="Inbox"
          isCounter
          counterValue="5"
          variant="outline"
          size="sm"
        />
        <Button
          label="Sent"
          isCounter
          counterValue="12"
          variant="outline"
          size="sm"
        />
        <Button
          label="Drafts"
          isCounter
          counterValue="3"
          variant="outline"
          size="sm"
        />
      </>
    ),
  },
};

/**
 * `orientation="vertical"` stacks the buttons into a column while keeping
 * the merged-border segmented look.
 * @summary Vertical stacked orientation.
 */
export const Vertical: Story = {
  args: {
    orientation: "vertical",
    children: <DefaultButtons />,
  },
};

/**
 * The group-level **disabled** prop propagates to every child button, so a
 * whole toolbar segment can be switched off at once.
 * @summary Disabled state propagated to children.
 */
export const Disabled: Story = {
  args: {
    disabled: true,
    children: <DefaultButtons />,
  },
};

/**
 * With `removeGaps={false}` each button keeps its own border and spacing —
 * for related but independent actions rather than a segmented control.
 * @summary Spaced buttons without border merging.
 */
export const WithGaps: Story = {
  args: {
    removeGaps: false,
    children: <DefaultButtons />,
  },
};

const ButtonGroupByVariant = ({ variant }: { variant: ButtonVariantType }) => (
  <>
    <Separator />
    <h3 className="text-primary">{variant}</h3>
    <div className="flex items-center gap-4">
      <ButtonGroup>
        <DefaultButtons variant={variant} size="xs" />
      </ButtonGroup>
      <ButtonGroup>
        <DefaultButtons variant={variant} size="sm" />
      </ButtonGroup>
      <ButtonGroup>
        <DefaultButtons variant={variant} size="md" />
      </ButtonGroup>
    </div>
  </>
);

/**
 * Visual reference: every button variant crossed with the three sizes, for
 * design review only.
 * @summary Visual matrix of variants and sizes.
 */
export const Gallery: Story = {
  tags: ["!manifest"],
  render: () => (
    <div className="flex flex-col gap-4">
      {BUTTON_VARIANTS.map((variant) => (
        <ButtonGroupByVariant key={variant} variant={variant} />
      ))}
    </div>
  ),
};

/**
 * Split button: an icon-only primary action paired with a
 * **ButtonGroupDropdown** whose `items` open an overflow menu (an item can
 * carry an icon and a `variant` such as `warning`). The same pattern works
 * with a labeled trigger, other button variants (e.g. primary "Save" /
 * "Save as draft"), or with several regular buttons before the dropdown.
 * @summary Split button with an overflow menu.
 */
export const WithDropdownMenu: Story = {
  render: () => (
    <ButtonGroup>
      <Button
        icon={Clipboard}
        tooltip="Copy to clipboard"
        variant="outline"
        size="xs"
      />
      <ButtonGroupDropdown
        trigger={<Button variant="outline" size="xs" icon={ChevronDown} />}
        items={[
          { label: "Retry", icon: RefreshCw02 },
          { label: "Delete", icon: Trash01, variant: "warning" },
        ]}
      />
    </ButtonGroup>
  ),
};
