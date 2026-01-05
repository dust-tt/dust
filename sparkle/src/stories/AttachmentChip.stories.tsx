import type { Meta, StoryObj } from "@storybook/react";
import React from "react";

import { AttachmentChip } from "@sparkle/components";
import { DocumentIcon, DocumentTextIcon, FolderIcon } from "@sparkle/icons/app";
import { DriveLogo, NotionLogo } from "@sparkle/logo";

const meta = {
  title: "Components/AttachmentChip",
  component: AttachmentChip,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
} satisfies Meta<typeof AttachmentChip>;

export default meta;
type Story = StoryObj<typeof meta>;

const ParagraphWrapper = ({ children }: { children: React.ReactNode }) => (
  <div className="s-rounded-lg s-bg-primary-50 s-p-8 s-text-base">
    <p className="s-mb-4 s-inline-flex s-items-center s-gap-2">
      <span className="s-font-semibold s-text-highlight">@soupi</span> here is
      an attachment {children} for you.
    </p>
  </div>
);

export const Document: Story = {
  args: {
    label: "document.pdf",
    icon: { visual: NotionLogo },
  },
  decorators: [
    (Story) => (
      <ParagraphWrapper>
        <Story />
      </ParagraphWrapper>
    ),
  ],
};

export const Image: Story = {
  args: {
    label: "image.jpg",
    icon: { visual: NotionLogo },
  },
  decorators: [
    (Story) => (
      <ParagraphWrapper>
        <Story />
      </ParagraphWrapper>
    ),
  ],
};

export const Text: Story = {
  args: {
    label: "text.txt",
    icon: { visual: DocumentTextIcon },
  },
  decorators: [
    (Story) => (
      <ParagraphWrapper>
        <Story />
      </ParagraphWrapper>
    ),
  ],
};

export const LongLabel: Story = {
  args: {
    label: "very_long_document_name_that_will_be_truncated.pdf",
    icon: { visual: DocumentIcon },
  },
  decorators: [
    (Story) => (
      <ParagraphWrapper>
        <Story />
      </ParagraphWrapper>
    ),
  ],
};

export const WithDoubleIcon: Story = {
  args: {
    label: "My Drive Folder",
    doubleIcon: { mainIcon: FolderIcon, secondaryIcon: DriveLogo, size: "sm" },
  },
  decorators: [
    (Story) => (
      <ParagraphWrapper>
        <Story />
      </ParagraphWrapper>
    ),
  ],
};

export const WithDoubleIconAndLink: Story = {
  args: {
    label: "Notion Document",
    doubleIcon: {
      mainIcon: DocumentIcon,
      secondaryIcon: NotionLogo,
      size: "sm",
    },
    href: "https://notion.so",
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

export const WithChipColor: Story = {
  args: {
    label: "Success chip",
    icon: { visual: DocumentIcon },
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
