import type { Meta } from "@storybook/react";
import React, { useEffect, useState } from "react";

import { ScrollBar } from "@sparkle/components/ScrollArea";
import {
  ScrollArea,
  Separator,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@sparkle/index_with_tw_base";

const meta = {
  title: "NewPrimitives/ScrollArea",
  component: ScrollArea,
} satisfies Meta<typeof ScrollArea>;

export default meta;

const tags = Array.from({ length: 50 }).map(
  (_, i, a) => `v1.2.0-beta.${a.length - i}`
);

export function ScrollAreaDemo() {
  const [computedSize, setComputedSize] = useState(0);

  const updateComputedSize = () => {
    const mainDiv = document.getElementById("maindiv");
    const bottomBar = document.getElementById("bottombar");

    if (mainDiv && bottomBar) {
      const offset = bottomBar.offsetHeight; // Get the height of the bottombar
      const newSize = mainDiv.offsetHeight - offset; // Subtract the offset
      setComputedSize(newSize);
    }
  };

  useEffect(() => {
    updateComputedSize();
    window.addEventListener("resize", updateComputedSize);
    return () => {
      window.removeEventListener("resize", updateComputedSize);
    };
  }, []);

  return (
    <div className="s-h-[400px]">
      <div id="maindiv" className="s-flex s-h-full s-w-48 s-flex-col">
        <Tabs
          defaultValue="account"
          id="tabs"
          className="s-flex s-w-full s-flex-col"
          style={{ height: `${computedSize}px` }}
        >
          <TabsList className="s-h-10">
            <TabsTrigger value="account" label="Hello" />
            <TabsTrigger value="password" label="World" />
            <TabsTrigger value="settings" />
          </TabsList>
          <TabsContent id="heyyou" className="s-w-full" value="account">
            <ScrollArea className="s-h-full s-w-full s-border-b s-border-t s-border-border">
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
          </TabsContent>
          <TabsContent value="password">World</TabsContent>
          <TabsContent value="settings">Settings</TabsContent>
        </Tabs>

        <div id="bottombar" className="s-h-12 s-w-full s-bg-action-100" />
      </div>
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
