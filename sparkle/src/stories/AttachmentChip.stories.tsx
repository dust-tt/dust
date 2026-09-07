import type { Meta, StoryObj } from "@storybook/react";
import React from "react";
import { fn } from "storybook/test";

import { AttachmentChip } from "@sparkle/components";

import { DriveLogo, NotionLogo } from "@sparkle/logo";
import { File02, File04, Folder, Image01 } from "@sparkle/icons/v2-stroke";

const meta = {
  title: "Product/Conversation/AttachmentChip",
  component: AttachmentChip,
  parameters: {
    layout: "centered",
    docs: {
      description: {
        component: `A compact, inline chip representing a file, document, or folder attached to a conversation message. Shows a truncated \`label\` with either a single \`icon\` or a **doubleIcon** (a main icon overlaid with a connector logo, e.g. a Drive folder), and supports an optional \`href\` link, an \`onRemove\` action, and a semantic \`color\`.

**When to use**
- To reference an attached document, image, or connected resource within a chat message.

**Guidelines**
- Provide a \`doubleIcon\` when the attachment comes from a connector (Notion, Drive) so its source is recognizable; use a single \`icon\` for plain files.
- Keep \`label\` to the file name; long labels truncate automatically.
- For richer source references with descriptions or images, use **Citation** instead.`,
      },
    },
  },
  tags: ["a11y-issues", "autodocs"],
} satisfies Meta<typeof AttachmentChip>;

export default meta;
type Story = StoryObj<typeof meta>;

const ParagraphWrapper = ({ children }: { children: React.ReactNode }) => (
  <div className="rounded-lg bg-primary-50 p-8 text-base">
    <p className="mb-4 inline-flex items-center gap-2">
      <span className="font-semibold text-highlight">@soupi</span> here is an
      attachment {children} for you.
    </p>
  </div>
);

/**
 * A plain attached document: a single file `icon` and the file name as the
 * label.
 *
 * @summary Plain document attachment.
 */
export const Document: Story = {
  args: {
    label: "document.pdf",
    icon: { visual: File02 },
  },
  decorators: [
    (Story) => (
      <ParagraphWrapper>
        <Story />
      </ParagraphWrapper>
    ),
  ],
};

/**
 * An attached image file, using an image icon so the media type is
 * recognizable at a glance.
 *
 * @summary Image attachment.
 */
export const Image: Story = {
  args: {
    label: "image.jpg",
    icon: { visual: Image01 },
  },
  decorators: [
    (Story) => (
      <ParagraphWrapper>
        <Story />
      </ParagraphWrapper>
    ),
  ],
};

/**
 * An attached plain-text file.
 *
 * @summary Text file attachment.
 */
export const Text: Story = {
  args: {
    label: "text.txt",
    icon: { visual: File04 },
  },
  decorators: [
    (Story) => (
      <ParagraphWrapper>
        <Story />
      </ParagraphWrapper>
    ),
  ],
};

/**
 * Long file names truncate automatically so the chip stays inline with the
 * surrounding text.
 *
 * @summary Automatic label truncation.
 */
export const LongLabel: Story = {
  args: {
    label: "very_long_document_name_that_will_be_truncated.pdf",
    icon: { visual: File02 },
  },
  decorators: [
    (Story) => (
      <ParagraphWrapper>
        <Story />
      </ParagraphWrapper>
    ),
  ],
};

/**
 * A **doubleIcon** overlays the main icon with a connector logo (here a Drive
 * folder), so the attachment's source is recognizable.
 *
 * @summary Connector attachment with a double icon.
 */
export const WithDoubleIcon: Story = {
  args: {
    label: "My Drive Folder",
    doubleIcon: { mainIcon: Folder, secondaryIcon: DriveLogo, size: "sm" },
  },
  decorators: [
    (Story) => (
      <ParagraphWrapper>
        <Story />
      </ParagraphWrapper>
    ),
  ],
};

/**
 * An `href` (with `target`) turns the chip into a link, so the reader can
 * open the referenced resource in its source app.
 *
 * @summary Attachment that links to its source.
 */
export const AsLink: Story = {
  args: {
    label: "Notion Document",
    doubleIcon: {
      mainIcon: File02,
      secondaryIcon: NotionLogo,
      size: "sm",
    },
    href: "https://app.notion.com",
    target: "_blank",
  },
  decorators: [
    (Story) => (
      <ParagraphWrapper>
        <Story />
      </ParagraphWrapper>
    ),
  ],
};

/**
 * `onRemove` adds a dismiss affordance for attachments the user can detach
 * before sending.
 *
 * @summary Removable attachment.
 */
export const Removable: Story = {
  args: {
    label: "document.pdf",
    icon: { visual: File02 },
    onRemove: fn(),
  },
  decorators: [
    (Story) => (
      <ParagraphWrapper>
        <Story />
      </ParagraphWrapper>
    ),
  ],
};

/**
 * The semantic `color` prop tints the chip — e.g. `success` for a completed
 * upload.
 *
 * @summary Semantic color tint.
 */
export const WithChipColor: Story = {
  args: {
    label: "Success chip",
    icon: { visual: File02 },
    color: "success",
  },
  decorators: [
    (Story) => (
      <ParagraphWrapper>
        <Story />
      </ParagraphWrapper>
    ),
  ],
};
