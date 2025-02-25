import { Meta } from "@storybook/react";
import React from "react";

import { AnimatedText } from "../index_with_tw_base";

const meta = {
  title: "Effects/AnimatedText",
  component: AnimatedText,
} satisfies Meta<typeof AnimatedText>;

export default meta;

export function AnimatedShinyTextDemo() {
  return (
    <div className="s-flex s-gap-3">
      <div className="s-z-10 s-flex s-min-h-64 s-flex-col s-items-center s-justify-center s-gap-4">
        <div className="s-rounded-2xl s-bg-muted s-p-4 dark:s-bg-muted-night">
          <AnimatedText>Thinking...</AnimatedText>
        </div>

        <div className="s-rounded-2xl s-bg-muted s-p-4 dark:s-bg-muted-night">
          <AnimatedText>Thinking a long time</AnimatedText>
        </div>

        <div className="s-rounded-2xl s-bg-muted s-p-4 dark:s-bg-muted-night">
          <AnimatedText>Thinking a long long long long time</AnimatedText>
        </div>
      </div>
      <div className="s-z-10 s-flex s-min-h-64 s-flex-col s-items-center s-justify-center s-gap-4">
        <div className="s-rounded-2xl s-bg-highlight-50 s-p-4 dark:s-bg-highlight-50-night">
          <AnimatedText variant="highlight">Thinking...</AnimatedText>
        </div>

        <div className="s-rounded-2xl s-bg-highlight-50 s-p-4 dark:s-bg-highlight-50-night">
          <AnimatedText variant="highlight">Thinking a long time</AnimatedText>
        </div>

        <div className="s-rounded-2xl s-bg-highlight-50 s-p-4 dark:s-bg-highlight-50-night">
          <AnimatedText variant="highlight">
            Thinking a long long long long time
          </AnimatedText>
        </div>
      </div>
    </div>
  );
}
