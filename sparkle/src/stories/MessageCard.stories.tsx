import type { Meta, StoryObj } from "@storybook/react";

import { MessageCard } from "../components/MessageCard";

const meta: Meta<typeof MessageCard> = {
  title: "Components/MessageCard",
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
    onDismiss: () => {
      alert("Dismiss clicked!");
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {},
};

export const WithoutImage: Story = {
  args: {
    haveImage: false,
    imageSrc: undefined,
  },
};
