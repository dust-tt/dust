import type { Meta } from "@storybook/react";
import React, { useRef } from "react";

import { NeonGradientCard } from "@sparkle/components/NeonGradientCard";

const meta = {
  title: "NewComponents/NeonCard",
} satisfies Meta;

export default meta;

export const ConfettiExample = () => {
  const referentRef = useRef<HTMLDivElement>(null);
  return (
    <div
      className="s-flex s-h-[100vh] s-w-full s-items-center s-justify-center"
      ref={referentRef}
    >
      <NeonGradientCardDemo />
    </div>
  );
};

export function NeonGradientCardDemo() {
  return (
    <NeonGradientCard className="s-max-w-sm s-items-center s-justify-center s-text-center">
      Neon Gradient Card
    </NeonGradientCard>
  );
}
