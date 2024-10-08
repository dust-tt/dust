import type { Meta } from "@storybook/react";
import React from "react";

import {
  Button,
  Input,
  Popover,
  PopoverContent,
  PopoverRoot,
  PopoverTrigger
} from "../index_with_tw_base";

const meta = {
  title: "NewPrimitives/Popover",
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
        <div className="grid gap-2">
          <p>Lorem</p>
          <p>Ipsum</p>
          <p>Lorem</p>
          <p>Ipsum</p>
        </div>
      }
      side="right"
      sideOffset={100}
    />
  )
}

export function PopoverExample() {
  return (
    <PopoverRoot>
      <PopoverTrigger>
        <Button label="Popover" variant="primary" />
      </PopoverTrigger>
      <PopoverContent className="w-80">
        <div className="grid gap-4">
          <div className="space-y-2">
            <h4 className="font-medium leading-none s-pb-2">Dimensions</h4>
            <p className="text-sm text-muted-foreground">
              Set the dimensions for the layer.
            </p>
          </div>
          <div className="grid gap-2">
            <div className="grid grid-cols-3 items-center gap-4">
              <Input
                name="width"
                value="200px"
                placeholder="Width"
                className="col-span-2 h-8"
              />
            </div>
            <div className="grid grid-cols-3 items-center gap-4">
              <Input
                name="max-width"
                value="300px"
                placeholder="Max. width"
                className="col-span-2 h-8"
              />
            </div>
            <div className="grid grid-cols-3 items-center gap-4">
              <Input
                name="height"
                value="30px"
                placeholder="Height"
                className="col-span-2 h-8"
              />
            </div>
            <div className="grid grid-cols-3 items-center gap-4">
              <Input
                name="max-height"
                value="100px"
                placeholder="Max. height"
                className="col-span-2 h-8"
              />
            </div>
          </div>
        </div>
      </PopoverContent>
    </PopoverRoot>
  )
}

