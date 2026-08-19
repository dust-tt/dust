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

const tags = Array.from({ length: 50 }).map(
  (_, i, a) => `v1.2.0-beta.${a.length - i}`
);

export const ScrollAreaExample: Story = {
  render: () => (
    <div className="flex flex-row gap-6 bg-muted p-8">
      <div className="h-[400px]">
        <ScrollArea className="h-full w-[200px] border-b border-t border-border bg-white">
          <h4 className="mb-4 text-sm font-medium leading-none">
            Mini ScrollBar
          </h4>
          {tags.map((tag) => (
            <React.Fragment key={tag}>
              <div className="text-sm">{tag}</div>
              <Separator className="my-2" />
            </React.Fragment>
          ))}
          <ScrollBar orientation="vertical" />
        </ScrollArea>
      </div>
      <div className="h-[400px]">
        <ScrollArea className="h-full w-[200px] border-b border-t border-border bg-white">
          <h4 className="mb-4 text-sm font-medium leading-none">
            Classic ScrollBar
          </h4>
          {tags.map((tag) => (
            <React.Fragment key={tag}>
              <div className="text-sm">{tag}</div>
              <Separator className="my-2" />
            </React.Fragment>
          ))}
          <ScrollBar orientation="vertical" size="classic" />
        </ScrollArea>
      </div>
      <div className="h-[400px]">
        <ScrollArea className="h-full w-[200px] border-b border-t border-border bg-white">
          <h4 className="mb-4 text-sm font-medium leading-none">
            Minimal ScrollBar
          </h4>
          {tags.map((tag) => (
            <React.Fragment key={tag}>
              <div className="text-sm">{tag}</div>
              <Separator className="my-2" />
            </React.Fragment>
          ))}
          <ScrollBar orientation="vertical" size="minimal" />
        </ScrollArea>
      </div>
    </div>
  ),
};

export interface Artwork {
  artist: string;
  art: string;
}

const works: Artwork[] = [
  {
    artist: "Ornella Binni",
    art: "https://images.unsplash.com/photo-1465869185982-5a1a7522cbcb?auto=format&fit=crop&w=300&q=80",
  },
  {
    artist: "Tom Byrom",
    art: "https://images.unsplash.com/photo-1548516173-3cabfa4607e9?auto=format&fit=crop&w=300&q=80",
  },
  {
    artist: "Vladimir Malyavko",
    art: "https://images.unsplash.com/photo-1494337480532-3725c85fd2ab?auto=format&fit=crop&w=300&q=80",
  },
];
export const ScrollAreaHorizontalDemo: Story = {
  render: () => (
    <ScrollArea className="w-96 whitespace-nowrap rounded-md border">
      <div className="flex w-max space-x-4 p-4">
        {works.map((artwork) => (
          <figure key={artwork.artist} className="shrink-0">
            <div className="overflow-hidden rounded-md">
              <img
                src={artwork.art}
                alt={`Photo by ${artwork.artist}`}
                className="aspect-[3/4] h-fit w-fit object-cover"
                width={300}
                height={400}
              />
            </div>
            <figcaption className="pt-2 text-xs text-muted-foreground">
              Photo by{" "}
              <span className="font-semibold text-foreground">
                {artwork.artist}
              </span>
            </figcaption>
          </figure>
        ))}
      </div>
      <ScrollBar orientation="horizontal" />
    </ScrollArea>
  ),
};

export const ScrollWithActiveState: Story = {
  render: () => {
    return (
      <div className="flex flex-col gap-4">
        <ScrollArea className="h-[200px] w-[350px] rounded-xl border bg-white">
          <div>
            {Array.from({ length: 20 }).map((_, i) => (
              <div key={i} className="px-4 py-2 text-sm">
                Item {i + 1}
              </div>
            ))}
          </div>
          <ScrollBar orientation="vertical" />
        </ScrollArea>
      </div>
    );
  },
};

export const ScrollAreaHideScrollbar: Story = {
  render: () => (
    <div className="flex flex-row gap-6 bg-muted p-8">
      <div className="h-[400px]">
        <ScrollArea
          className="h-full w-[200px] border-b border-t border-border bg-white"
          hideScrollBar
        >
          <h4 className="mb-4 text-sm font-medium leading-none">
            Mini ScrollBar
          </h4>
          {tags.map((tag) => (
            <React.Fragment key={tag}>
              <div className="text-sm">{tag}</div>
              <Separator className="my-2" />
            </React.Fragment>
          ))}
        </ScrollArea>
      </div>
      <div className="h-[400px]">
        <ScrollArea
          className="h-full w-[200px] border-b border-t border-border bg-white"
          hideScrollBar
        >
          <h4 className="mb-4 text-sm font-medium leading-none">
            Classic ScrollBar
          </h4>
          {tags.map((tag) => (
            <React.Fragment key={tag}>
              <div className="text-sm">{tag}</div>
              <Separator className="my-2" />
            </React.Fragment>
          ))}
        </ScrollArea>
      </div>
    </div>
  ),
};
