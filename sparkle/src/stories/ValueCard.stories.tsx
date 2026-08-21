import type { Meta, StoryObj } from "@storybook/react";
import * as React from "react";

import { ThumbsUp } from "@sparkle/icons/v2-stroke";

// ComposableCard is not exported from the package index, so the deep import
// is required to demo it.
import { ComposableCard } from "../components/ValueCard";
import { Avatar, ValueCard } from "../index_with_tw_base";

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

/**
 * Standard metric card: a title, a subtitle for context, and the figure in
 * the content slot.
 * @summary Title, subtitle, and a single metric.
 */
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

/**
 * While the metric is being fetched, **isLoading** replaces the content with
 * a spinner so the card keeps its footprint.
 * @summary Loading state with spinner.
 */
export const Loading: Story = {
  args: {
    ...Basic.args,
    isLoading: true,
  },
};

/**
 * Pair the figure with a small icon in the content slot to give the metric
 * context at a glance.
 * @summary Icon paired with the metric.
 */
export const WithIcons: Story = {
  args: {
    title: "Reactions",
    content: (
      <div className="flex items-center gap-2">
        <ThumbsUp className="h-4 w-4 text-muted-foreground" />
        <div className="text-lg font-semibold text-foreground">12</div>
      </div>
    ),
    className: "w-fit",
  },
};

/**
 * The separate **ComposableCard** API (Root, Header, Title, Subtitle,
 * Content, Footer) builds bespoke layouts the packaged ValueCard does not
 * support — here a footer row of contributor Avatars.
 * @summary Bespoke layout via the ComposableCard API.
 */
export const Composable: Story = {
  render: () => (
    <ComposableCard.Root>
      <ComposableCard.Header>
        <ComposableCard.Title>Messages</ComposableCard.Title>
        <ComposableCard.Subtitle>Monthly activity</ComposableCard.Subtitle>
      </ComposableCard.Header>
      <ComposableCard.Content>
        <div className="flex items-center gap-2">
          <ThumbsUp className="h-4 w-4 text-muted-foreground" />
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
