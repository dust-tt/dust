import type { EmojiMartData } from "@emoji-mart/data";
import data from "@emoji-mart/data";
import type { Meta, StoryObj } from "@storybook/react";
import React from "react";

import {} from "@sparkle/components/EmojiPicker";

import { EmojiPicker } from "../index_with_tw_base";

const meta = {
  title: "Primitives/EmojiPicker",
  component: EmojiPicker,
  argTypes: {
    theme: {
      description: "The theme of the emoji picker",
      options: ["dark", "light"],
      control: { type: "select" },
    },
    previewPosition: {
      description: "The position of the emoji preview",
      options: ["none", "top", "right", "bottom", "left"],
      control: { type: "select" },
    },
    data: {
      description: "The emoji data to use",
      control: "object",
    },
    onEmojiSelect: {
      description: "Function to call when an emoji is selected",
      action: "onEmojiSelect",
    },
  },
} satisfies Meta<React.ComponentProps<typeof EmojiPicker>>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ExamplePicker: Story = {
  args: {
    theme: "light",
    previewPosition: "none",
    data: data as EmojiMartData,
    onEmojiSelect: () => {},
  },
};

<EmojiPicker
  theme="light"
  previewPosition="none"
  onEmojiSelect={(emoji) => {
    alert(emoji);
  }}
/>;
