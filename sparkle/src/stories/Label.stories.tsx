import type { Meta, StoryObj } from "@storybook/react";
import React from "react";
import { expect } from "storybook/test";

import { Checkbox, Label } from "../index_with_tw_base";

const meta = {
  title: "Forms & Inputs/Label",
  component: Label,
  parameters: {
    docs: {
      description: {
        component: `A short caption that names a form control or a piece of content. Associate it with a control via **htmlFor** so that clicking the label focuses the control — which is also better for accessibility. Use **isMuted** for secondary or optional captions.

**When to use**
- To label inputs, checkboxes, radio items, and other form controls.

**Guidelines**
- Always set **htmlFor** to the id of the control the label describes.
- Keep labels short and noun-based ("Workspace name", not a full sentence).
- Use **isMuted** to de-emphasise optional or helper labels.`,
      },
    },
  },
} satisfies Meta<typeof Label>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * The base label style on its own. In real usage always pair it with a control
 * via htmlFor — see AssociatedWithControl for the full wiring.
 * @summary Base label text.
 */
export const Default: Story = {
  args: { children: "Email address" },
  tags: ["ai-generated", "needs-work"],
};

/**
 * The muted treatment for secondary or optional captions, de-emphasised next
 * to primary labels.
 * @summary Muted label via isMuted.
 */
export const Muted: Story = {
  args: { children: "Optional", isMuted: true },
  tags: ["ai-generated", "needs-work"],
};

/**
 * A label correctly wired to a control: htmlFor matches the Checkbox id, so
 * clicking the label toggles the checkbox. The play function asserts that
 * htmlFor surfaces as the DOM `for` attribute.
 * @summary Label associated with a checkbox via htmlFor.
 */
export const AssociatedWithControl: Story = {
  args: { children: "Accept terms and conditions", htmlFor: "terms" },
  tags: ["ai-generated", "needs-work"],
  render: (args) => (
    <div className="flex items-center space-x-2">
      <Checkbox id="terms" />
      <Label {...args} />
    </div>
  ),
  play: async ({ canvas }) => {
    await expect(
      canvas.getByText("Accept terms and conditions")
    ).toHaveAttribute("for", "terms");
  },
};
