import type { Meta } from "@storybook/react";
import React from "react";
import { fn } from "storybook/test";

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
  tags: ["a11y-issues"],
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

/**
 * The all-in-one **Popover** API: pass `trigger` and `content`, position with
 * `side` and `sideOffset`. The simplest way to show contextual content.
 * @summary Simple popover via the convenience API.
 */
export function Default() {
  return (
    <Popover
      trigger={<Button label="Popover" variant="outline" />}
      content={
        <div className="grid gap-2 p-2">
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

/**
 * The composable **PopoverRoot** / **PopoverTrigger** / **PopoverContent**
 * primitives hosting a small inline form — use this API when the content needs
 * custom structure the convenience `Popover` cannot express.
 * @summary Composed primitives hosting an inline form.
 */
export function ComposedWithForm() {
  return (
    <PopoverRoot>
      <PopoverTrigger>
        <Button label="Popover" variant="primary" />
      </PopoverTrigger>
      <PopoverContent className="p-4">
        <div className="grid gap-4">
          <div className="space-y-2">
            <h4 className="pb-2 font-medium leading-none">Dimensions</h4>
            <p className="text-sm text-muted-foreground">
              Set the dimensions for the layer.
            </p>
          </div>
          <div className="grid gap-4">
            <Input
              name="width"
              value="200px"
              placeholder="Width"
              className="col-span-2 h-8"
            />
            <Input
              name="max-width"
              value="300px"
              placeholder="Max. width"
              className="col-span-2 h-8"
            />
            <Input
              name="height"
              value="30px"
              placeholder="Height"
              className="col-span-2 h-8"
            />
            <Input
              name="max-height"
              value="100px"
              placeholder="Max. height"
              className="col-span-2 h-8"
            />
          </div>
        </div>
      </PopoverContent>
    </PopoverRoot>
  );
}

/**
 * With `fullWidth` the popover drops its default fixed width and grows to fit
 * its content — here an **EmojiPicker**, which sizes itself.
 * @summary fullWidth popover sized by its content.
 */
export function FullWidthContent() {
  return (
    <Popover
      fullWidth={true}
      trigger={<Button label="Emoji Picker Popover" variant="primary"></Button>}
      content={
        <EmojiPicker
          theme="light"
          previewPosition="none"
          onEmojiSelect={fn()}
        />
      }
    />
  );
}

/**
 * Tall content wrapped in a fixed-height **ScrollArea**, so the popover keeps
 * a bounded size and the list scrolls inside it — the recommended pattern for
 * long lists.
 * @summary Long list scrolling inside a fixed-height popover.
 */
export function ScrollableContent() {
  const tags = Array.from({ length: 50 }).map(
    (_, i, a) => `v1.2.0-beta.${a.length - i}`
  );
  return (
    <PopoverRoot>
      <PopoverTrigger>
        <Button label="Popover" variant="primary" />
      </PopoverTrigger>
      <PopoverContent className="p-4">
        <ScrollArea className="h-[200px]">
          {tags.map((tag) => (
            <div key={tag}>
              <div className="text-sm">{tag}</div>
              <Separator className="my-2" />
            </div>
          ))}
        </ScrollArea>
      </PopoverContent>
    </PopoverRoot>
  );
}
