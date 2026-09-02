import type { Meta, StoryObj } from "@storybook/react";
import React from "react";

import { DoubleIcon } from "@sparkle/components";

import { DriveLogo, NotionLogo, SlackLogo } from "@sparkle/logo";
import {
  AlertCircle,
  CheckCircle,
  File02,
  Folder,
  InfoCircle,
  MessageDotsCircle,
} from "@sparkle/icons/v2-stroke";

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
        component: `Overlays a small **secondaryIcon** badge on a corner of a **mainIcon**, supporting a range of **sizes** (\`xs\`, \`sm\`, \`md\`, \`lg\`, \`xl\`) and either corner via **position**. Typically used to combine a content-type glyph with a source/provider logo, or to flag a glyph with a status.

**When to use**
- To show a piece of content alongside its origin (e.g. a document with its connector logo).
- To flag an icon with a status: pass **secondaryColor** to fill the badge and knock the glyph out in white.

**Guidelines**
- Keep the **mainIcon** as the subject and the **secondaryIcon** as a small qualifier such as a provider logo or a status glyph.
- Use **secondaryColor** only with the semantic intent it names (\`info\`, \`warning\`, \`success\`, \`highlight\`); leave it unset for provider logos, which carry their own colors.
- \`xs\` badges a 16px glyph — the scale of an icon inside a button; reach for a larger size wherever there is room.
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
      options: ["xs", "sm", "md", "lg", "xl"],
      control: { type: "select" },
    },
    position: {
      description: "Corner the badge sits in",
      options: ["bottom-right", "top-right"],
      control: { type: "inline-radio" },
    },
    secondaryColor: {
      description:
        "Fills the badge with a semantic color and knocks the glyph out in white",
      options: [undefined, "info", "warning", "success", "highlight"],
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
      {(["xl", "lg", "md", "sm", "xs"] as const).map((size) => (
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

/**
 * A status badge: `secondaryColor` fills the corner disc and knocks the glyph
 * out in white, so the flag reads at a glance over a busy main icon. Used for
 * flagging a model as degraded in the model picker, where the whole control is
 * a 16px button icon (`size="xs"`, badged top-right).
 * @summary Glyph flagged with a filled status badge.
 */
export const StatusBadge: Story = {
  args: {
    size: "md",
    mainIcon: MessageDotsCircle,
    secondaryIcon: InfoCircle,
    position: "top-right",
    secondaryColor: "info",
  },
};

/**
 * Visual reference: each semantic `secondaryColor` in both corners, at the
 * `xs` scale used inside buttons and at `lg` for a closer look at the disc.
 * Kept for design review.
 * @summary Status badge colors and corners.
 */
export const StatusBadges: Story = {
  tags: ["!manifest"],
  render: () => (
    <div className="flex flex-col gap-8">
      {(["lg", "xs"] as const).map((size) => (
        <div key={size} className="flex items-center gap-8">
          <DoubleIcon
            size={size}
            mainIcon={Folder}
            secondaryIcon={InfoCircle}
            position="top-right"
            secondaryColor="info"
          />
          <DoubleIcon
            size={size}
            mainIcon={Folder}
            secondaryIcon={AlertCircle}
            position="top-right"
            secondaryColor="warning"
          />
          <DoubleIcon
            size={size}
            mainIcon={Folder}
            secondaryIcon={CheckCircle}
            position="bottom-right"
            secondaryColor="success"
          />
          <DoubleIcon
            size={size}
            mainIcon={Folder}
            secondaryIcon={InfoCircle}
            position="bottom-right"
            secondaryColor="highlight"
          />
        </div>
      ))}
    </div>
  ),
};
