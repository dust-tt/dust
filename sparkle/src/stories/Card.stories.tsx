import type { Meta, StoryObj } from "@storybook/react";
import * as React from "react";

import { Avatar } from "@sparkle/components";
import { HandThumbUpIcon } from "@sparkle/icons/solid";

import { Card, ComposableCard } from "../components/Card";

const meta: Meta<typeof Card> = {
  title: "Components/Card",
  component: Card,
  parameters: {
    layout: "padded",
  },
  argTypes: {
    size: {
      control: "select",
      options: ["xs", "sm", "md", "lg"],
    },
    className: {
      control: "text",
    },
  },
  args: {
    size: "sm",
  },
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof Card>;

export const Basic: Story = {
  args: {
    title: "Messages",
    subtitle: "Monthly activity",
    content: (
      <div className="s-flex s-items-center s-gap-2">
        <div className="s-text-lg s-font-semibold s-text-element-900">847</div>
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
        <HandThumbUpIcon className="s-h-4 s-w-4 s-text-element-600" />
        <div className="s-text-lg s-font-semibold s-text-element-900">12</div>
      </div>
    ),
  },
};

export const Sizes: Story = {
  render: (args) => (
    <div className="s-flex s-flex-wrap s-gap-4">
      {(["xs", "sm", "md"] as const).map((size) => (
        <Card
          key={size}
          {...args}
          size={size}
          title={`Size: ${size}`}
          content={
            <div className="s-text-lg s-font-semibold s-text-element-900">
              847
            </div>
          }
        />
      ))}
    </div>
  ),
};

export const Composable: Story = {
  render: () => (
    <ComposableCard.Root size="sm">
      <ComposableCard.Header>
        <ComposableCard.Title>Messages</ComposableCard.Title>
        <ComposableCard.Subtitle>Monthly activity</ComposableCard.Subtitle>
      </ComposableCard.Header>
      <ComposableCard.Content>
        <div className="s-flex s-items-center s-gap-2">
          <HandThumbUpIcon className="s-h-4 s-w-4 s-text-element-600" />
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
