import type { Meta, StoryObj } from "@storybook/react";
import { fn } from "storybook/test";

import { MessageCard } from "../components/MessageCard";

const meta: Meta<typeof MessageCard> = {
  title: "Product/Conversation/MessageCard",
  component: MessageCard,
  parameters: {
    layout: "centered",
    docs: {
      description: {
        component:
          "A dismissible message card component designed for sidebar usage, featuring an optional image section and a new feature announcement section.",
      },
    },
  },
  argTypes: {
    haveImage: {
      control: { type: "boolean" },
      description: "Whether to show an image in the top section",
    },
    imageSrc: {
      control: { type: "text" },
      description: "URL of the image to display in the top section",
      if: { arg: "haveImage", truthy: true },
    },
    announcementTitle: {
      control: { type: "text" },
      description: "Title for the announcement section",
    },
    announcementMessage: {
      control: { type: "text" },
      description: "The main announcement message",
    },
    dismissible: {
      control: { type: "boolean" },
      description: "Whether the card can be dismissed",
    },
    onDismiss: {
      description: "Callback when dismiss button is clicked",
    },
  },
  args: {
    haveImage: true,
    imageSrc:
      "https://blog.dust.tt/content/images/size/w2000/2025/05/cover.jpg",
    announcementTitle: "New on Dust",
    announcementMessage: "Create interactive content with Dust Shareables",
    dismissible: true,
    onDismiss: fn(),
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * The full card as it ships in the sidebar: cover image on top (enabled via
 * `haveImage` with an `imageSrc`), announcement title and message below, and a
 * dismiss button wired to `onDismiss`. All values come from the meta-level
 * args, so this is the baseline to tweak from the Controls panel.
 * @summary Full announcement card with image and dismiss.
 */
export const Default: Story = {
  args: {},
};

/**
 * The image-less form (`haveImage: false`): just the announcement text and
 * dismiss control. Right for text-only announcements or when no suitable
 * visual exists — the card stays compact in the sidebar.
 * @summary Text-only announcement card.
 */
export const WithoutImage: Story = {
  args: {
    haveImage: false,
    imageSrc: undefined,
  },
};
