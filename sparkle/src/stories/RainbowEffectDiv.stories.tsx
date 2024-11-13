import { Meta } from "@storybook/react";
import React from "react";

import { RainbowEffectDiv } from "../index_with_tw_base";

const meta = {
  title: "Primitives/RainbowEffect",
  component: RainbowEffectDiv,
} satisfies Meta<typeof RainbowEffectDiv>;

export default meta;

const DivExample = () => (
  <RainbowEffectDiv backgroundColor="white" borderColor="black">
    <div className="s-flex s-flex-col s-gap-3 s-rounded-2xl s-border s-border-border-dark s-bg-white/90 s-p-4 s-backdrop-blur-2xl">
      <div>Text in a div too</div>
      <div className="flex">
        <div>but</div>
        <div>many</div>
        <div>children</div>
      </div>
    </div>
  </RainbowEffectDiv>
);

export const RainbowEffectExamples = () => (
  <div className="s-flex s-flex-col s-gap-4">
    <DivExample />
  </div>
);
