import type { Meta, StoryObj } from "@storybook/react";
import React from "react";

import { ScrollArea, ScrollBar } from "@sparkle/components/ScrollArea";
import { Separator } from "@sparkle/components/Separator";

const meta = {
  title: "Layout/ScrollArea",
  component: ScrollArea,
  parameters: {
    layout: "centered",
    docs: {
      description: {
        component: `A styled, cross-browser scroll container that replaces the native scrollbar with a custom **ScrollBar**. Render a **ScrollBar** child with an **orientation** (\`vertical\` / \`horizontal\`); the bar supports compact and classic styles.

**When to use**
- To give bounded, scrollable regions (lists, panels, popovers) a consistent scrollbar across browsers.

**Guidelines**
- Constrain the **ScrollArea** with an explicit height or width so it actually scrolls.
- Include a **ScrollBar** per scrolling axis; many layout wrappers like **Container** already embed a ScrollArea, so avoid nesting another.`,
      },
    },
  },
  tags: ["a11y-issues", "autodocs"],
} satisfies Meta<typeof ScrollArea>;

export default meta;
type Story = StoryObj<typeof meta>;

const versionTags = Array.from({ length: 50 }).map(
  (_, i, a) => `v1.2.0-beta.${a.length - i}`
);

function VersionList() {
  return (
    <>
      {versionTags.map((tag) => (
        <React.Fragment key={tag}>
          <div className="text-sm">{tag}</div>
          <Separator className="my-2" />
        </React.Fragment>
      ))}
    </>
  );
}

interface AgentFixture {
  name: string;
  avatar: string;
}

const agents: AgentFixture[] = [
  {
    name: "@support",
    avatar: "https://dust.tt/static/droidavatar/Droid_Teal_2.jpg",
  },
  {
    name: "@sales",
    avatar: "https://dust.tt/static/droidavatar/Droid_Lime_3.jpg",
  },
  {
    name: "@legal",
    avatar: "https://dust.tt/static/droidavatar/Droid_Yellow_2.jpg",
  },
  {
    name: "@hr",
    avatar: "https://dust.tt/static/droidavatar/Droid_Green_2.jpg",
  },
];

/**
 * A vertically scrolling list constrained by an explicit height, with a
 * vertical **ScrollBar** child providing the custom scrollbar.
 * @summary Vertical scroll container with custom scrollbar.
 */
export const Default: Story = {
  render: () => (
    <div className="h-[400px]">
      <ScrollArea className="h-full w-[200px] rounded-xl border border-border bg-background p-4">
        <h4 className="mb-4 text-sm font-medium leading-none">Versions</h4>
        <VersionList />
        <ScrollBar orientation="vertical" />
      </ScrollArea>
    </div>
  ),
};

/**
 * Visual reference for design review: the three **ScrollBar** sizes (default
 * mini, classic, minimal) side by side. Not a usage example.
 * @summary Gallery of scrollbar sizes.
 */
export const ScrollbarSizes: Story = {
  tags: ["!manifest"],
  render: () => (
    <div className="flex flex-row gap-6 bg-muted p-8">
      {(
        [
          { size: undefined, title: "Mini ScrollBar" },
          { size: "classic", title: "Classic ScrollBar" },
          { size: "minimal", title: "Minimal ScrollBar" },
        ] as const
      ).map(({ size, title }) => (
        <div key={title} className="h-[400px]">
          <ScrollArea className="h-full w-[200px] border-b border-t border-border bg-background p-4">
            <h4 className="mb-4 text-sm font-medium leading-none">{title}</h4>
            <VersionList />
            <ScrollBar orientation="vertical" size={size} />
          </ScrollArea>
        </div>
      ))}
    </div>
  ),
};

/**
 * A horizontally scrolling row of cards: constrain the width, let the content
 * lay out at its natural size (`w-max`), and add a horizontal **ScrollBar**.
 * @summary Horizontal scroll with a horizontal scrollbar.
 */
export const HorizontalScroll: Story = {
  render: () => (
    <ScrollArea className="w-96 whitespace-nowrap rounded-md border">
      <div className="flex w-max space-x-4 p-4">
        {agents.map((agent) => (
          <figure key={agent.name} className="shrink-0">
            <div className="overflow-hidden rounded-md">
              <img
                src={agent.avatar}
                alt={`Avatar of ${agent.name}`}
                className="aspect-square object-cover"
                width={200}
                height={200}
              />
            </div>
            <figcaption className="pt-2 text-xs text-muted-foreground">
              Agent{" "}
              <span className="font-semibold text-foreground">
                {agent.name}
              </span>
            </figcaption>
          </figure>
        ))}
      </div>
      <ScrollBar orientation="horizontal" />
    </ScrollArea>
  ),
};

/**
 * Pass `hideScrollBar` (and omit the **ScrollBar** child) for a region that
 * scrolls without any visible scrollbar — e.g. a chip row scrolled by drag or
 * by adjacent controls.
 * @summary Scrollable region with no visible scrollbar.
 */
export const HiddenScrollbar: Story = {
  render: () => (
    <div className="h-[400px]">
      <ScrollArea
        className="h-full w-[200px] rounded-xl border border-border bg-background p-4"
        hideScrollBar
      >
        <h4 className="mb-4 text-sm font-medium leading-none">Versions</h4>
        <VersionList />
      </ScrollArea>
    </div>
  ),
};
