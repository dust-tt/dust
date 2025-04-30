import type { Meta, StoryObj } from "@storybook/react";
import React from "react";

import { ScrollBar } from "@sparkle/components/ScrollArea";
import { ScrollArea, Separator } from "@sparkle/index_with_tw_base";
import { cn } from "@sparkle/lib/utils";

const meta: Meta<typeof ScrollArea> = {
  title: "Primitives/ScrollArea",
  component: ScrollArea,
};

export default meta;
type Story = StoryObj<typeof ScrollArea>;

const tags = Array.from({ length: 50 }).map(
  (_, i, a) => `v1.2.0-beta.${a.length - i}`
);

export const ScrollAreaDemo: Story = {
  render: () => (
    <div className="s-flex s-flex-row s-gap-6 s-bg-muted s-p-8">
      <div className="s-h-[400px]">
        <ScrollArea className="s-h-full s-w-[200px] s-border-b s-border-t s-border-border s-bg-white">
          <h4 className="s-mb-4 s-text-sm s-font-medium s-leading-none">
            Mini ScrollBar
          </h4>
          {tags.map((tag) => (
            <React.Fragment key={tag}>
              <div className="s-text-sm">{tag}</div>
              <Separator className="s-my-2" />
            </React.Fragment>
          ))}
        </ScrollArea>
      </div>
      <div className="s-h-[400px]">
        <ScrollArea className="s-h-full s-w-[200px] s-border-b s-border-t s-border-border s-bg-white">
          <h4 className="s-mb-4 s-text-sm s-font-medium s-leading-none">
            Classic ScrollBar
          </h4>
          {tags.map((tag) => (
            <React.Fragment key={tag}>
              <div className="s-text-sm">{tag}</div>
              <Separator className="s-my-2" />
            </React.Fragment>
          ))}
          <ScrollBar orientation="vertical" size="classic" />
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
    <ScrollArea className="s-w-96 s-whitespace-nowrap s-rounded-md s-border">
      <div className="s-flex s-w-max s-space-x-4 s-p-4">
        {works.map((artwork) => (
          <figure key={artwork.artist} className="s-shrink-0">
            <div className="s-overflow-hidden s-rounded-md">
              <img
                src={artwork.art}
                alt={`Photo by ${artwork.artist}`}
                className="s-aspect-[3/4] s-h-fit s-w-fit s-object-cover"
                width={300}
                height={400}
              />
            </div>
            <figcaption className="s-pt-2 s-text-xs s-text-muted-foreground">
              Photo by{" "}
              <span className="s-font-semibold s-text-foreground">
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
    const [isScrolled, setIsScrolled] = React.useState(false);
    return (
      <div className="s-flex s-flex-col s-gap-4">
        <div>Scroll state: {isScrolled ? "Scrolled" : "At top"}</div>
        <ScrollArea
          className={cn(
            "s-h-[200px] s-w-[350px] s-rounded-xl s-border s-transition-all s-duration-300",
            isScrolled && "s-border-highlight-200 s-shadow-md"
          )}
          onScrollStateChange={setIsScrolled}
        >
          <div>
            {Array.from({ length: 20 }).map((_, i) => (
              <div key={i} className="s-px-4 s-py-2 s-text-sm">
                Item {i + 1}
              </div>
            ))}
          </div>
        </ScrollArea>
      </div>
    );
  },
};
