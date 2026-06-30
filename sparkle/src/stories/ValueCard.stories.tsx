import type { Meta, StoryObj } from "@storybook/react";
import * as React from "react";

import { Avatar } from "@sparkle/components";

import { ComposableCard, ValueCard } from "../components/ValueCard";
import { ThumbsUp } from "@sparkle/icons/v2-stroke";

const meta: Meta<typeof ValueCard> = {
  title: "Data Display/ValueCard",
  component: ValueCard,
  parameters: {
    layout: "padded",
    docs: {
      description: {
        component: `A compact metric card surfacing a single value with a **title**, optional **subtitle**, and a **content** slot for the figure (number, icon, trend). Supports an **isLoading** state that shows a spinner. For bespoke layouts, compose the parts directly with **ComposableCard** (Header, Title, Subtitle, Content).

**When to use**
- On dashboards and overviews to highlight a key metric or KPI.

**Guidelines**
- Keep **content** to a single primary figure; pair it with a small **Icon** for context rather than crowding the card.
- Use **ComposableCard** when you need a non-standard arrangement of the title, subtitle, and content.`,
      },
    },
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
    className: "w-fit",
    content: (
      <div className="flex items-center gap-2">
        <div className="text-lg font-semibold text-foreground">847</div>
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
      <div className="flex items-center gap-2">
        <ThumbsUp className="text-text-muted-foreground h-4 w-4" />
        <div className="text-lg font-semibold text-foreground">12</div>
      </div>
    ),
    className: "w-fit",
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
        <div className="flex items-center gap-2">
          <ThumbsUp className="text-text-muted-foreground h-4 w-4" />
          <div className="text-lg font-semibold">847</div>
        </div>
      </ComposableCard.Content>
      <ComposableCard.Footer>
        <div className="flex -space-x-2">
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
