import type { Meta, StoryObj } from "@storybook/react";
import React, { useState } from "react";

import {
  BarHalf,
  Button,
  DiscoveryGlint,
  NavigationList,
  NavigationListItem,
  ShapesPlus,
  Stars02,
} from "@sparkle/index_with_tw_base";

const meta = {
  title: "Effects & Motion/DiscoveryGlint",
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
- **isBouncing** and **isSweeping** turn the two halves of the effect on and off independently, for tuning or for a quieter variant.
- The timing knobs are **intervalSeconds**, **pulseDurationMs**, **sweepDurationMs** and **startDelaySeconds**. The sweep starts the moment the pulse ends and the rest of the interval is idle, so raising the interval spaces the effect out instead of slowing it down.
- The corner radius is read off the wrapped element and mirrored, so the ring hugs a 9px button, a 12px one and a pill without being told.
- Pass \`className="flex w-full"\` for block-level targets such as a sidebar row; the wrapper is \`inline-flex\` by default.
- Motion is dropped entirely under \`prefers-reduced-motion\`, leaving the static ring to carry the highlight.`,
      },
    },
  },
  argTypes: {
    children: { control: false },
    className: { control: false },
    isActive: { control: "boolean" },
    isBouncing: { control: "boolean" },
    isSweeping: { control: "boolean" },
    intervalSeconds: {
      control: { type: "number", min: 1, step: 0.5 },
      description: "Seconds between two replays of the whole effect.",
    },
    pulseDurationMs: {
      control: { type: "number", min: 100, step: 50 },
      description: "How long the ring spends on its two bounces.",
    },
    sweepDurationMs: {
      control: { type: "number", min: 100, step: 50 },
      description: "How long a light pass takes to cross the element.",
    },
    startDelaySeconds: {
      control: { type: "number", min: 0, step: 0.1 },
      description: "Quiet time after mount before the first replay.",
    },
  },
} satisfies Meta<typeof DiscoveryGlint>;

export default meta;
type Story = StoryObj<typeof DiscoveryGlint>;

/**
 * The canonical glint on an icon-only button, with every timing knob exposed
 * in the Controls panel at its default value.
 * @summary Glint on an icon-only button with default timing.
 */
export const Default: Story = {
  args: {
    isActive: true,
    isBouncing: true,
    isSweeping: true,
    intervalSeconds: 7,
    pulseDurationMs: 800,
    sweepDurationMs: 840,
    startDelaySeconds: 0.5,
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

/**
 * The glint wraps any target without touching its layout: an icon-only
 * button, a labeled button, a pill, and a full-width sidebar row (which
 * needs `className="flex w-full"` since the wrapper is inline-flex by
 * default). The sweep scales to the wrapped element's own size.
 * @summary Glint wrapping four target shapes.
 */
export const Targets: Story = {
  name: "Across target shapes",
  parameters: { controls: { disable: true } },
  render: () => (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col items-start gap-2">
        <p className="text-sm text-muted-foreground">Icon-only button</p>
        <DiscoveryGlint>
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
        <p className="text-sm text-muted-foreground">Button with a label</p>
        <DiscoveryGlint>
          <Button
            variant="outline"
            size="sm"
            icon={ShapesPlus}
            label="Capabilities"
          />
        </DiscoveryGlint>
      </div>

      <div className="flex flex-col items-start gap-2">
        <p className="text-sm text-muted-foreground">Pill</p>
        <DiscoveryGlint>
          <Button
            variant="outline"
            size="sm"
            icon={Stars02}
            label="Try it"
            isRounded
          />
        </DiscoveryGlint>
      </div>

      <div className="flex flex-col items-start gap-2">
        <p className="text-sm text-muted-foreground">
          Sidebar row — with <code>className="flex w-full"</code>
        </p>
        <div className="w-64 rounded-xl bg-muted-background p-2">
          <NavigationList>
            <NavigationListItem label="Conversations" />
            <DiscoveryGlint className="flex w-full">
              <NavigationListItem label="Skills" icon={Stars02} />
            </DiscoveryGlint>
            <NavigationListItem label="Spaces" />
          </NavigationList>
        </div>
      </div>
    </div>
  ),
};

/**
 * The dismissal wiring the product uses: the component never stops itself,
 * so the parent drops **isActive** on the first press of the wrapped
 * control. Press the glinting button to retire the glint, then Replay to
 * bring it back.
 * @summary Parent-controlled dismissal on first press.
 */
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
          <DiscoveryGlint isActive={isActive}>
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
