import type { Meta, StoryObj } from "@storybook/react";
import React, { useRef, useState } from "react";

import { Button } from "@sparkle/components/Button";
import { AnchoredPopover } from "@sparkle/components/Popover";

const meta = {
  title: "Overlays/AnchoredPopover",
  component: AnchoredPopover,
  parameters: {
    layout: "centered",
    docs: {
      description: {
        component: `A **Popover** variant positioned against an arbitrary element rather than its own trigger. Pass an \`anchorRef\` (a ref to the element to attach to) along with \`open\`, \`side\`, \`align\`, and \`sideOffset\` to control placement; the anchor can be changed at runtime to move the popover between targets.

**When to use**
- When the popover must point at an element that is not the control that opened it (e.g. floating over a canvas item or a moving target).

**Guidelines**
- You own the \`open\` state and the \`anchorRef\` — wire them up explicitly.
- For the common case where the popover is anchored to its own trigger, use **Popover** / **PopoverRoot** instead.`,
      },
    },
  },
  tags: ["autodocs"],
} satisfies Meta<typeof AnchoredPopover>;

export default meta;

/**
 * The minimal wiring: one anchor element referenced by `anchorRef`, and an
 * `open` state you control yourself.
 *
 * @summary Minimal single-anchor setup.
 */
export const Default: StoryObj<typeof AnchoredPopover> = {
  render: () => {
    const [isOpen, setIsOpen] = useState(false);
    const anchorRef = useRef<HTMLButtonElement>(null);

    return (
      <div className="flex h-64 w-96 items-center justify-center">
        <Button
          ref={anchorRef}
          label="Toggle popover"
          onClick={() => setIsOpen((open) => !open)}
          size="sm"
        />
        <AnchoredPopover
          open={isOpen}
          anchorRef={anchorRef}
          side="bottom"
          align="center"
          sideOffset={4}
          className="w-40 p-4"
        >
          <div className="text-sm">Anchored to the button.</div>
        </AnchoredPopover>
      </div>
    );
  },
};

/**
 * The same popover moved between four anchors at runtime, one per `side`
 * value — click a button to re-anchor and reposition it.
 *
 * @summary Re-anchoring across the four placement sides.
 */
export const PlacementSides: StoryObj<typeof AnchoredPopover> = {
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
      <div className="flex h-[400px] w-[600px] items-center justify-center gap-8">
        <div className="relative flex h-48 w-48 flex-col items-center justify-center">
          <div className="absolute left-1/2 top-0 -translate-x-1/2">
            <Button
              ref={topRef}
              label="Top"
              onClick={() => handleClick(topRef)}
              size="sm"
            />
          </div>
          <div className="absolute right-0 top-1/2 -translate-y-1/2">
            <Button
              ref={rightRef}
              label="Right"
              onClick={() => handleClick(rightRef)}
              size="sm"
            />
          </div>
          <div className="absolute bottom-0 left-1/2 -translate-x-1/2">
            <Button
              ref={bottomRef}
              label="Bottom"
              onClick={() => handleClick(bottomRef)}
              size="sm"
            />
          </div>
          <div className="absolute left-0 top-1/2 -translate-y-1/2">
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
            className="w-40 p-4"
          >
            <div className="text-sm">
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
