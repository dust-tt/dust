import type { Meta } from "@storybook/react";
import React from "react";

import { Hoverable } from "@sparkle/components/Hoverable";

const meta = {
  title: "Primitives/Hoverable",
  component: Hoverable,
} satisfies Meta<typeof Hoverable>;

export default meta;

export const HoverableExample = () => {
  return (
    <div className="items-start s-flex s-flex-col s-gap-10">
      <div>
        <Hoverable
          onClick={() => {
            alert("Clicked!");
          }}
        >
          I am invisible but you can hover me.
        </Hoverable>
      </div>
      <div>
        <Hoverable
          variant="primary"
          onClick={() => {
            alert("Soupinou!");
          }}
        >
          I am primary, you can hover me.
        </Hoverable>
      </div>
    </div>
  );
};
