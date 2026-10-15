import type { Meta, StoryObj } from "@storybook/react";
import React from "react";

import { AnnouncementPill } from "@sparkle/components";
import { Stars02 } from "@sparkle/icons/v2-stroke";
import { FigmaLogo } from "@sparkle/logo/platforms";

const meta = {
  title: "Feedback & Status/AnnouncementPill",
  component: AnnouncementPill,
  parameters: {
    docs: {
      description: {
        component: `A small pill that announces a feature or integration: an optional **icon** or platform logo followed by a one-line **label**. It renders as a link when \`href\` is set, and as static text otherwise.

**When to use**
- To surface a newly available capability in place, such as an integration on the home page.

**Guidelines**
- Keep the label to a few words; the pill never wraps.
- Pass a platform logo as \`icon\` when announcing an integration, a stroke icon otherwise.
- For a message that needs a colored variant, use **ContentMessage** instead.`,
      },
    },
  },
  argTypes: {
    label: { control: "text", description: "One-line text of the pill" },
    href: { control: "text", description: "Turns the pill into a link" },
    icon: { control: false, description: "Icon or logo before the label" },
  },
} satisfies Meta<typeof AnnouncementPill>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * An integration announcement that links to its setup page: platform logo
 * plus label.
 * @summary Logo and label as a link.
 */
export const Linked: Story = {
  args: {
    icon: FigmaLogo,
    label: "Figma MCP is now available",
    href: "https://dust.tt",
  },
};

/**
 * A static announcement with no link: it reads as text and shows no hover
 * state.
 * @summary Label only, not interactive.
 */
export const Static: Story = {
  args: {
    icon: FigmaLogo,
    label: "Figma MCP is now available",
  },
};

/**
 * A stroke icon instead of a platform logo, for announcements that are not
 * about an integration.
 * @summary Icon and label.
 */
export const WithIcon: Story = {
  args: {
    icon: Stars02,
    label: "Skills can now be shared with your team",
    href: "https://dust.tt",
  },
};
