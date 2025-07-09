import type { Meta, StoryObj } from "@storybook/react";
import * as React from "react";

import { Avatar } from "@sparkle/components";
import { HandThumbUpIcon } from "@sparkle/icons/app";

import { ComposableCard, ValueCard } from "../components/ValueCard";

const meta: Meta<typeof ValueCard> = {
  title: "Modules/ValueCard",
  component: ValueCard,
  parameters: {
    layout: "padded",
  },
  argTypes: {
    className: {
      control: "text",
    },
  },
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof ValueCard>;

export const Basic: Story = {
  args: {
    title: "Messages",
    subtitle: "Monthly activity",
    className: "s-w-fit",
    content: (
      <div className="s-flex s-items-center s-gap-2">
        <div className="s-text-lg s-font-semibold s-text-foreground">847</div>
      </div>
    ),
  },
};

export const Loading: Story = {
  args: {
    ...Basic.args,
    isLoading: true,
  },
};

export const WithIcons: Story = {
  args: {
    title: "Reactions",
    content: (
      <div className="s-flex s-items-center s-gap-2">
        <HandThumbUpIcon className="s-text-text-muted-foreground s-h-4 s-w-4" />
        <div className="s-text-lg s-font-semibold s-text-foreground">12</div>
      </div>
    ),
    className: "s-w-fit",
  },
};

export const Composable: Story = {
  render: () => (
    <ComposableCard.Root>
      <ComposableCard.Header>
        <ComposableCard.Title>Messages</ComposableCard.Title>
        <ComposableCard.Subtitle>Monthly activity</ComposableCard.Subtitle>
      </ComposableCard.Header>
      <ComposableCard.Content>
        <div className="s-flex s-items-center s-gap-2">
          <HandThumbUpIcon className="s-text-text-muted-foreground s-h-4 s-w-4" />
          <div className="s-text-lg s-font-semibold">847</div>
        </div>
      </ComposableCard.Content>
      <ComposableCard.Footer>
        <div className="s-flex -s-space-x-2">
          <Avatar
            size="sm"
            name="John Doe"
            visual="https://dust.tt/static/droidavatar/Droid_Lime_3.jpg"
          />
          <Avatar
            size="sm"
            name="Jane Smith"
            visual="https://dust.tt/static/droidavatar/Droid_Yellow_3.jpg"
          />
          <Avatar
            size="sm"
            name="Bob Johnson"
            visual="https://dust.tt/static/droidavatar/Droid_Red_3.jpg"
          />
        </div>
      </ComposableCard.Footer>
    </ComposableCard.Root>
  ),
};
