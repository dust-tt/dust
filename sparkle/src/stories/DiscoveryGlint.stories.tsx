import type { Meta, StoryObj } from "@storybook/react";
import React, { useState } from "react";

import {
  BarHalf,
  Button,
  DiscoveryGlint,
  NavigationList,
  NavigationListItem,
  ShapesPlus,
  Stars01,
} from "@sparkle/index_with_tw_base";

const meta = {
  title: "Effects/DiscoveryGlint",
  component: DiscoveryGlint,
  tags: ["autodocs"],
  parameters: {
    layout: "padded",
    docs: {
      description: {
        component: `Draws attention to a control the user has not discovered yet: a blue ring that pulses twice every 7s, two diagonal light streaks sweeping across right after each pulse, and one extra sweep on hover.

Wraps any element without touching it. The ring and the streaks are absolutely positioned overlays with \`pointer-events: none\`, so layout, box and hit area are unchanged — toggling **isActive** shifts nothing. The sweep is expressed in percentages of the wrapped element's own size, so it crosses a 24px icon button and a full-width sidebar row equally well.

**When to use**
- For a short, time-boxed campaign pointing at one newly shipped control.
- Never on more than one element at a time on the same screen: two competing glints cancel each other out.

**Guidelines**
- Own the campaign yourself. This component only takes **isActive**; how many times a user sees it, when it stops and what dismisses it are product decisions that belong in the app.
- Match **radius** to the wrapped element, otherwise the ring will not hug it.
- Pass \`className="flex w-full"\` for block-level targets such as a sidebar row; the wrapper is \`inline-flex\` by default.
- Motion is dropped entirely under \`prefers-reduced-motion\`, leaving the static ring to carry the highlight.`,
      },
    },
  },
  argTypes: {
    children: { control: false },
    className: { control: false },
    isActive: { control: "boolean" },
    radius: {
      control: { type: "select" },
      options: ["md", "lg", "xl", "full"],
    },
  },
} satisfies Meta<typeof DiscoveryGlint>;

export default meta;
type Story = StoryObj<typeof DiscoveryGlint>;

export const Default: Story = {
  args: {
    isActive: true,
    radius: "lg",
    children: (
      <Button
        variant="ghost-secondary"
        size="xs"
        icon={BarHalf}
        tooltip="Model picker: Standard"
        className="px-2"
      />
    ),
  },
};

export const Targets: Story = {
  name: "Across target shapes",
  parameters: { controls: { disable: true } },
  render: () => (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col items-start gap-2">
        <p className="text-sm text-muted-foreground">
          Icon-only button — <code>radius="lg"</code>
        </p>
        <DiscoveryGlint radius="lg">
          <Button
            variant="ghost-secondary"
            size="xs"
            icon={BarHalf}
            tooltip="Model picker: Standard"
            className="px-2"
          />
        </DiscoveryGlint>
      </div>

      <div className="flex flex-col items-start gap-2">
        <p className="text-sm text-muted-foreground">
          Button with a label — <code>radius="lg"</code>
        </p>
        <DiscoveryGlint radius="lg">
          <Button
            variant="outline"
            size="sm"
            icon={ShapesPlus}
            label="Capabilities"
          />
        </DiscoveryGlint>
      </div>

      <div className="flex flex-col items-start gap-2">
        <p className="text-sm text-muted-foreground">
          Pill — <code>radius="full"</code>
        </p>
        <DiscoveryGlint radius="full">
          <Button
            variant="outline"
            size="sm"
            icon={Stars01}
            label="Try it"
            isRounded
          />
        </DiscoveryGlint>
      </div>

      <div className="flex flex-col items-start gap-2">
        <p className="text-sm text-muted-foreground">
          Sidebar row — <code>radius="xl"</code> with{" "}
          <code>className="flex w-full"</code>
        </p>
        <div className="w-64 rounded-xl bg-muted-background p-2">
          <NavigationList>
            <NavigationListItem label="Conversations" />
            <DiscoveryGlint radius="xl" className="flex w-full">
              <NavigationListItem label="Skills" icon={Stars01} />
            </DiscoveryGlint>
            <NavigationListItem label="Spaces" />
          </NavigationList>
        </div>
      </div>
    </div>
  ),
};

export const Dismissal: Story = {
  name: "Dismissed on press",
  parameters: { controls: { disable: true } },
  render: function DismissalStory() {
    const [isActive, setIsActive] = useState(true);

    return (
      <div className="flex flex-col items-start gap-4">
        <p className="max-w-lg text-sm text-muted-foreground">
          The component never decides for itself when to stop. Here the parent
          drops <code>isActive</code> on the first press, which is the shape the
          product uses: pressing the control retires the glint, and the app
          decides whether it comes back on the next visit.
        </p>
        <span onPointerDown={() => setIsActive(false)}>
          <DiscoveryGlint isActive={isActive} radius="lg">
            <Button
              variant="ghost-secondary"
              size="xs"
              icon={BarHalf}
              tooltip="Model picker: Standard"
              className="px-2"
            />
          </DiscoveryGlint>
        </span>
        <Button
          variant="outline"
          size="xs"
          label="Replay"
          disabled={isActive}
          onClick={() => setIsActive(true)}
        />
      </div>
    );
  },
};
