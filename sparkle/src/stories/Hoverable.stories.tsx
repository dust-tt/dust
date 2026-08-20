import type { Meta, StoryObj } from "@storybook/react";
import { fn } from "storybook/test";

import { Hoverable, HOVERABLE_VARIANTS } from "@sparkle/components/Hoverable";

const meta = {
  title: "Effects & Motion/Hoverable",
  component: Hoverable,
  parameters: {
    layout: "padded",
    docs: {
      description: {
        component: `Wraps inline text or content to give it interactive affordance on hover. The **variant** prop controls the resting appearance (e.g. \`invisible\` until hovered, vs. an always-styled link look), and passing **href** renders it as a link while **onClick** makes it behave as a button.

**When to use**
- For inline, low-emphasis interactions inside running text where a full **Button** would be too heavy.

**Guidelines**
- Provide **href** for navigation or **onClick** for actions, not both for the same element.
- Use the \`invisible\` **variant** to keep prose clean until the user hovers; for standalone actions prefer **Button** or **Link**.`,
      },
    },
  },
  argTypes: {
    variant: {
      options: HOVERABLE_VARIANTS,
      control: { type: "select" },
      description: "Visual style variant",
      defaultValue: "invisible",
    },
    children: {
      control: "text",
      description: "Text content to display",
    },
    href: {
      control: "text",
      description: "Optional URL for link behavior",
    },
    target: {
      options: ["_self", "_blank", "_parent", "_top"],
      control: { type: "select" },
      description: "Target attribute for link",
      defaultValue: "_self",
    },
    onClick: {
      action: "clicked",
      description: "Click handler function",
    },
    className: {
      control: "text",
      description: "Additional CSS classes",
    },
  },
} satisfies Meta<typeof Hoverable>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * The `invisible` variant: plain prose until hovered, then the highlight color
 * and underline reveal the affordance. Use it to keep running text clean while
 * still offering an inline interaction. Tweak **variant** and **children** from
 * the Controls panel.
 * @summary Invisible variant — prose that reveals affordance on hover.
 */
export const Basic: Story = {
  args: {
    children: "I am hoverable text",
    variant: "invisible",
  },
};

/**
 * Passing **href** renders the Hoverable as a real anchor for navigation — here
 * with the `highlight` variant so the link is visible at rest, and
 * **target="_blank"** to open in a new tab.
 * @summary Link behavior via href.
 */
export const AsLink: Story = {
  args: {
    children: "Read the Dust documentation",
    variant: "highlight",
    href: "https://docs.dust.tt",
    target: "_blank",
  },
};

/**
 * Passing **onClick** (and no **href**) makes the Hoverable behave as an inline
 * button — for low-emphasis actions inside text where a full Button would be
 * too heavy. Clicks are logged in the Actions panel.
 * @summary Button behavior via onClick.
 */
export const AsButton: Story = {
  args: {
    children: "Show more",
    variant: "primary",
    onClick: fn(),
  },
};
