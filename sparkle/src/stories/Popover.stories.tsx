import type { Meta } from "@storybook/react";
import React from "react";

import {
  Button,
  EmojiPicker,
  Input,
  Popover,
  PopoverContent,
  PopoverRoot,
  PopoverTrigger,
  ScrollArea,
  Separator,
} from "../index_with_tw_base";

const meta = {
  title: "Overlays/Popover",
  component: Popover,
  parameters: {
    docs: {
      description: {
        component: `Floating content revealed from a trigger. Built on Radix Popover, it offers two APIs: the convenience **Popover** (pass \`trigger\` and \`content\`, with \`side\`, \`sideOffset\`, and \`fullWidth\`) and the composable **PopoverRoot** / **PopoverTrigger** / **PopoverContent** primitives for full control over layout. Content can host arbitrary elements — forms, an **EmojiPicker**, or a scrollable list via **ScrollArea**.

**When to use**
- To show contextual content (a small form, picker, or details) on demand without leaving the page.

**Guidelines**
- Reach for the all-in-one **Popover** for simple cases; drop to **PopoverRoot** + parts when you need custom structure.
- For tall content, wrap it in a **ScrollArea** with a fixed height rather than letting the popover grow unbounded.
- To anchor to an element other than the trigger, use **AnchoredPopover**; for a menu of actions, use **Dropdown**.`,
      },
    },
  },
} satisfies Meta<typeof Popover>;

export default meta;

export function SimplePopoverExample() {
  return (
    <Popover
      trigger={<Button label="Popover" variant="outline" />}
      content={
        <div className="s-grid s-gap-2 s-p-2">
          <p>Lorem</p>
          <p>Ipsum</p>
          <p>Lorem</p>
          <p>Ipsum</p>
        </div>
      }
      side="right"
      sideOffset={100}
    />
  );
}

export function PopoverExample() {
  return (
    <PopoverRoot>
      <PopoverTrigger>
        <Button label="Popover" variant="primary" />
      </PopoverTrigger>
      <PopoverContent className="s-p-4">
        <div className="s-grid s-gap-4">
          <div className="s-space-y-2">
            <h4 className="s-pb-2 s-font-medium s-leading-none">Dimensions</h4>
            <p className="s-text-sm s-text-muted-foreground">
              Set the dimensions for the layer.
            </p>
          </div>
          <div className="s-grid s-gap-4">
            <Input
              name="width"
              value="200px"
              placeholder="Width"
              className="s-col-span-2 s-h-8"
            />
            <Input
              name="max-width"
              value="300px"
              placeholder="Max. width"
              className="s-col-span-2 s-h-8"
            />
            <Input
              name="height"
              value="30px"
              placeholder="Height"
              className="s-col-span-2 s-h-8"
            />
            <Input
              name="max-height"
              value="100px"
              placeholder="Max. height"
              className="s-col-span-2 s-h-8"
            />
          </div>
        </div>
      </PopoverContent>
    </PopoverRoot>
  );
}

export function PopoverGrowingExample() {
  return (
    <Popover
      fullWidth={true}
      trigger={<Button label="Emoji Picker Popover" variant="primary"></Button>}
      content={
        <EmojiPicker
          theme="light"
          previewPosition="none"
          onEmojiSelect={(emoji) => console.log(emoji)}
        />
      }
    />
  );
}

export function ScrollablePopoverExample() {
  const tags = Array.from({ length: 50 }).map(
    (_, i, a) => `v1.2.0-beta.${a.length - i}`
  );
  return (
    <PopoverRoot>
      <PopoverTrigger>
        <Button label="Popover" variant="primary" />
      </PopoverTrigger>
      <PopoverContent className="s-p-4">
        <ScrollArea className="s-h-[200px]">
          {tags.map((tag) => (
            <div key={tag}>
              <div className="s-text-sm">{tag}</div>
              <Separator className="s-my-2" />
            </div>
          ))}
        </ScrollArea>
      </PopoverContent>
    </PopoverRoot>
  );
}
