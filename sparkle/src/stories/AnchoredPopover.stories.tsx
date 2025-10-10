import type { Meta, StoryObj } from "@storybook/react";
import React, { useRef, useState } from "react";

import { Button } from "@sparkle/components/Button";
import { AnchoredPopover } from "@sparkle/components/Popover";

const meta = {
  title: "Components/AnchoredPopover",
  component: AnchoredPopover,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
} satisfies Meta<typeof AnchoredPopover>;

export default meta;
type Story = StoryObj<typeof meta>;

export const MultipleAnchors: StoryObj<typeof AnchoredPopover> = {
  render: () => {
    const [isOpen, setIsOpen] = useState(false);
    const [activeRef, setActiveRef] =
      useState<React.RefObject<HTMLButtonElement>>();
    const topRef = useRef<HTMLButtonElement>(null);
    const rightRef = useRef<HTMLButtonElement>(null);
    const bottomRef = useRef<HTMLButtonElement>(null);
    const leftRef = useRef<HTMLButtonElement>(null);

    const handleClick = (ref: React.RefObject<HTMLButtonElement>) => {
      setActiveRef(ref);
      setIsOpen(true);
    };

    return (
      <div className="s-flex s-h-[400px] s-w-[600px] s-items-center s-justify-center s-gap-8">
        <div className="s-relative s-flex s-h-48 s-w-48 s-flex-col s-items-center s-justify-center">
          <div className="s-absolute s-left-1/2 s-top-0 s--translate-x-1/2">
            <Button
              ref={topRef}
              label="Top"
              onClick={() => handleClick(topRef)}
              size="sm"
            />
          </div>
          <div className="s-absolute s-right-0 s-top-1/2 s--translate-y-1/2">
            <Button
              ref={rightRef}
              label="Right"
              onClick={() => handleClick(rightRef)}
              size="sm"
            />
          </div>
          <div className="s-absolute s-bottom-0 s-left-1/2 s--translate-x-1/2">
            <Button
              ref={bottomRef}
              label="Bottom"
              onClick={() => handleClick(bottomRef)}
              size="sm"
            />
          </div>
          <div className="s-absolute s-left-0 s-top-1/2 s--translate-y-1/2">
            <Button
              ref={leftRef}
              label="Left"
              onClick={() => handleClick(leftRef)}
              size="sm"
            />
          </div>

          <AnchoredPopover
            open={isOpen}
            anchorRef={activeRef}
            side={
              activeRef === topRef
                ? "top"
                : activeRef === rightRef
                  ? "right"
                  : activeRef === bottomRef
                    ? "bottom"
                    : "left"
            }
            align="center"
            sideOffset={4}
            className="s-w-40 s-p-4"
          >
            <div className="s-text-sm">
              This popover is anchored to the{" "}
              {activeRef === topRef
                ? "top"
                : activeRef === rightRef
                  ? "right"
                  : activeRef === bottomRef
                    ? "bottom"
                    : "left"}{" "}
              button.
            </div>
          </AnchoredPopover>
        </div>
      </div>
    );
  },
};
