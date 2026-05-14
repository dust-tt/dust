import type { Meta, StoryObj } from "@storybook/react";
import React, { useCallback, useEffect, useRef, useState } from "react";

const meta = {
  title: "Theme/Easing",
  parameters: {
    layout: "centered",
  },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const EASINGS = [
  {
    group: "Ease Out",
    description:
      "The default choice for most UI animations. Starts fast, giving an immediate feeling of responsiveness, then decelerates naturally. Use for user-initiated interactions: opening dropdowns, modals, toasts, enter/exit animations.",
    items: [
      { label: "out-quad", class: "s-ease-out-quad" },
      { label: "out-cubic", class: "s-ease-out-cubic" },
      { label: "out-quart", class: "s-ease-out-quart" },
      { label: "out-quint", class: "s-ease-out-quint" },
      { label: "out-expo", class: "s-ease-out-expo" },
      { label: "out-circ", class: "s-ease-out-circ" },
    ],
  },
  {
    group: "Ease In-Out",
    description:
      "For elements already visible on screen that move to a new position or morph shape (resizing panels, morphing containers, expanding/collapsing in place). Mimics natural acceleration and deceleration.",
    items: [
      { label: "in-out-quad", class: "s-ease-in-out-quad" },
      { label: "in-out-cubic", class: "s-ease-in-out-cubic" },
      { label: "in-out-quart", class: "s-ease-in-out-quart" },
      { label: "in-out-quint", class: "s-ease-in-out-quint" },
      { label: "in-out-expo", class: "s-ease-in-out-expo" },
      { label: "in-out-circ", class: "s-ease-in-out-circ" },
    ],
  },
  {
    group: "Ease In — Avoid in most cases",
    description:
      "Almost never use for UI. The slow start makes interfaces feel sluggish and unresponsive. It accelerates at the end, which is the opposite of what our brain expects — things should settle, not speed up.",
    items: [
      { label: "in-quad", class: "s-ease-in-quad" },
      { label: "in-cubic", class: "s-ease-in-cubic" },
      { label: "in-quart", class: "s-ease-in-quart" },
      { label: "in-quint", class: "s-ease-in-quint" },
      { label: "in-expo", class: "s-ease-in-expo" },
      { label: "in-circ", class: "s-ease-in-circ" },
    ],
  },
];

function EasingRow({
  label,
  easingClass,
}: {
  label: string;
  easingClass: string;
}) {
  const [animate, setAnimate] = useState(false);
  const [looping, setLooping] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  const play = useCallback(() => {
    setAnimate(false);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setAnimate(true);
      });
    });
  }, []);

  useEffect(() => {
    if (!looping) {
      clearTimeout(timerRef.current);
      return;
    }

    setAnimate(true);
    const tick = (forward: boolean) => {
      timerRef.current = setTimeout(() => {
        setAnimate(!forward);
        tick(!forward);
      }, 1100);
    };
    tick(true);

    return () => clearTimeout(timerRef.current);
  }, [looping]);

  const handlePlay = useCallback(() => {
    setLooping(false);
    play();
  }, [play]);

  const toggleLoop = useCallback(() => {
    setLooping((prev) => !prev);
  }, []);

  return (
    <div className="s-flex s-items-center s-gap-2">
      <button
        onClick={handlePlay}
        className="s-shrink-0 s-rounded s-bg-blue-500 s-px-3 s-py-1 s-text-xs s-font-medium s-text-white hover:s-bg-blue-600"
      >
        Play
      </button>
      <button
        onClick={toggleLoop}
        className={`s-shrink-0 s-rounded s-px-3 s-py-1 s-text-xs s-font-medium s-text-white ${
          looping
            ? "s-bg-red-500 hover:s-bg-red-600"
            : "s-bg-gray-400 hover:s-bg-gray-500"
        }`}
      >
        {looping ? "Stop" : "Loop"}
      </button>
      <span className="s-w-28 s-shrink-0 s-font-mono s-text-xs s-text-muted-foreground">
        {label}
      </span>
      <div className="s-relative s-h-10 s-w-full s-rounded s-bg-gray-100 dark:s-bg-gray-800">
        <div
          className={`s-absolute s-top-1 s-h-8 s-w-8 s-rounded s-bg-blue-500 s-transition-all s-duration-1000 ${easingClass}`}
          style={{ left: animate ? "calc(100% - 2rem)" : "0px" }}
        />
      </div>
    </div>
  );
}

interface EasingGroupProps {
  group: string;
  description?: string;
  items: { label: string; class: string }[];
}

function EasingGroup({ group, description, items }: EasingGroupProps) {
  return (
    <div className="s-flex s-flex-col s-gap-3">
      <div>
        <h3 className="s-text-lg s-font-semibold">{group}</h3>
        {description && (
          <p className="s-mt-1 s-text-sm s-text-muted-foreground">
            {description}
          </p>
        )}
      </div>
      {items.map((item) => (
        <EasingRow
          key={item.label}
          label={item.label}
          easingClass={item.class}
        />
      ))}
    </div>
  );
}

export const AllEasings: Story = {
  render: () => (
    <div className="s-flex s-w-[600px] s-flex-col s-gap-8 s-p-8">
      <h2 className="s-text-xl s-font-semibold">Custom Easings</h2>
      {EASINGS.map((group) => (
        <EasingGroup
          key={group.group}
          group={group.group}
          description={group.description}
          items={group.items}
        />
      ))}
    </div>
  ),
};

export const EaseOut: Story = {
  render: () => (
    <div className="s-flex s-w-[600px] s-flex-col s-gap-4 s-p-8">
      <EasingGroup {...EASINGS[0]} />
    </div>
  ),
};

export const EaseInOut: Story = {
  render: () => (
    <div className="s-flex s-w-[600px] s-flex-col s-gap-4 s-p-8">
      <EasingGroup {...EASINGS[1]} />
    </div>
  ),
};

export const EaseIn: Story = {
  render: () => (
    <div className="s-flex s-w-[600px] s-flex-col s-gap-4 s-p-8">
      <EasingGroup {...EASINGS[2]} />
    </div>
  ),
};
