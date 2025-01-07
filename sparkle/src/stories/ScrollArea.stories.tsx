import type { Meta } from "@storybook/react";
import React from "react";

import { ScrollBar } from "@sparkle/components/ScrollArea";
import { ScrollArea, Separator } from "@sparkle/index_with_tw_base";

const meta = {
  title: "Primitives/ScrollArea",
  component: ScrollArea,
} satisfies Meta<typeof ScrollArea>;

export default meta;

const tags = Array.from({ length: 50 }).map(
  (_, i, a) => `v1.2.0-beta.${a.length - i}`
);

export function ScrollAreaDemo() {
  return (
    <div className="s-h-[400px]">
      <ScrollArea className="s-h-full s-w-[200px] s-border-b s-border-t s-border-border">
        <div className="s-p-4">
          <h4 className="s-mb-4 s-text-sm s-font-medium s-leading-none">
            Tags
          </h4>
          {tags.map((tag) => (
            <React.Fragment key={tag}>
              <div className="s-text-sm">{tag}</div>
              <Separator className="s-my-2" />
            </React.Fragment>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}

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
export function ScrollAreaHorizontalDemo() {
  return (
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
  );
}
