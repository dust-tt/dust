import type { Meta } from "@storybook/react";
import React from "react";

import {
  Button, EmojiPicker,
  Input,
  Popover,
  PopoverContent,
  PopoverRoot,
  PopoverTrigger,
} from "../index_with_tw_base";

const meta = {
  title: "Primitives/Popover",
  component: Popover,
} satisfies Meta<typeof Popover>;

export default meta;

export function SimplePopoverExample () {
  return (
    <Popover
      trigger={
        <Button label="Popover" variant="secondary"/>
      }
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
            <h4 className="s-font-medium s-leading-none s-pb-2">Dimensions</h4>
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
      trigger={
        <Button label="Emoji Picker Popover" variant="primary"></Button>
      }
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
