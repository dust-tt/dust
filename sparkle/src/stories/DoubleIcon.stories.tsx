import type { Meta, StoryObj } from "@storybook/react";
import React from "react";

import { DoubleIcon } from "@sparkle/components";

import { DriveLogo, NotionLogo, SlackLogo } from "@sparkle/logo";
import { File02, Folder, MessageDotsCircle } from "@sparkle/icons/v2-stroke";

const MAIN_ICONS = {
  Folder: Folder,
  File02: File02,
  MessageDotsCircle: MessageDotsCircle,
} as const;

const SECONDARY_ICONS = {
  DriveLogo: DriveLogo,
  NotionLogo: NotionLogo,
  SlackLogo: SlackLogo,
} as const;

const meta = {
  title: "Data Display/DoubleIcon",
  component: DoubleIcon,
  parameters: {
    docs: {
      description: {
        component: `Overlays a small **secondaryIcon** badge on the corner of a **mainIcon**, supporting a range of **sizes** (\`sm\`, \`md\`, \`lg\`, \`xl\`). Typically used to combine a content-type glyph with a source/provider logo.

**When to use**
- To show a piece of content alongside its origin (e.g. a document with its connector logo).

**Guidelines**
- Keep the **mainIcon** as the subject and the **secondaryIcon** as a small qualifier such as a provider logo.
- For a single glyph use **Icon**; for an entity image use **Avatar**.`,
      },
    },
  },
  args: {
    size: "md",
    mainIcon: Folder,
    secondaryIcon: DriveLogo,
  },
  argTypes: {
    size: {
      description: "Overall size of the composed icon",
      options: ["sm", "md", "lg", "xl"],
      control: { type: "select" },
    },
    mainIcon: {
      description: "The subject glyph",
      options: Object.keys(MAIN_ICONS),
      mapping: MAIN_ICONS,
      control: { type: "select" },
    },
    secondaryIcon: {
      description: "The small qualifier badge (e.g. a provider logo)",
      options: Object.keys(SECONDARY_ICONS),
      mapping: SECONDARY_ICONS,
      control: { type: "select" },
    },
  },
  render: (args) => <DoubleIcon {...args} />,
} satisfies Meta<typeof DoubleIcon>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * A folder qualified by its Google Drive origin — the canonical
 * content-plus-provider pairing. Swap the icons and size from the Controls
 * panel.
 * @summary Content glyph badged with a provider logo.
 */
export const Default: Story = {
  args: {
    size: "md",
    mainIcon: Folder,
    secondaryIcon: DriveLogo,
  },
};

/**
 * Visual reference: three main/secondary pairings rendered at every size
 * (xl / lg / md / sm) to check badge placement and scale. Kept for design
 * review.
 * @summary Size-by-pairing visual reference grid.
 */
export const Sizes: Story = {
  tags: ["!manifest"],
  render: () => (
    <div className="flex flex-col gap-8">
      {(["xl", "lg", "md", "sm"] as const).map((size) => (
        <div key={size} className="flex items-center gap-8">
          <DoubleIcon size={size} mainIcon={Folder} secondaryIcon={DriveLogo} />
          <DoubleIcon
            size={size}
            mainIcon={File02}
            secondaryIcon={NotionLogo}
          />
          <DoubleIcon
            size={size}
            mainIcon={MessageDotsCircle}
            secondaryIcon={SlackLogo}
          />
        </div>
      ))}
    </div>
  ),
};
