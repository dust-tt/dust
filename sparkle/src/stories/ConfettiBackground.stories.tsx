import type { Meta } from "@storybook/react";
import React, { useRef } from "react";

import { ConfettiBackground } from "@sparkle/index";

const meta = {
  title: "Components/ConfettiBackground",
  component: ConfettiBackground,
} satisfies Meta<typeof ConfettiBackground>;

export default meta;

export const ConfettiExample = () => {
  const referentRef = useRef<HTMLDivElement>(null);
  return (
    <div className="s-h-[100vh] s-w-full" ref={referentRef}>
      <ConfettiBackground variant="confetti" referentSize={referentRef} />
    </div>
  );
};
export const SnowExample = () => {
  const referentRef = useRef<HTMLDivElement>(null);
  return (
    <div className="s-h-[100vh] s-w-full" ref={referentRef}>
      <ConfettiBackground variant="snow" referentSize={referentRef} />
    </div>
  );
};
