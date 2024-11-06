import React, { Children } from "react";

import { RainbowEffectDiv, Separator } from "../index_with_tw_base";
import { Meta } from "@storybook/react";

const meta = {
  title: "Primitives/RainbowEffect",
  component: RainbowEffectDiv,
} satisfies Meta<typeof RainbowEffectDiv>;

export default meta;

const DivExample = () => (
  <div className="s-flex s-flex-col s-gap-6">
    <RainbowEffectDiv
      backgroundColor="white"
      borderColor="black"
      className="s-h-16 s-p-2"
    >
      Text in a div
    </RainbowEffectDiv>
    <Separator />
    <RainbowEffectDiv
      backgroundColor="white"
      borderColor="black"
      className="s-p-2"
    >
      <div>Text in a div too</div>
      <div className="flex">
        <div>but</div>
        <div>many</div>
        <div>children</div>
      </div>
    </RainbowEffectDiv>
  </div>
);

export const RainbowEffectExamples = () => (
  <div className="s-flex s-flex-col s-gap-4">
    <DivExample />
  </div>
);
