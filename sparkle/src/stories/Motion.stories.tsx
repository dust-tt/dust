import type { Meta, StoryObj } from "@storybook/react";
import React, { useCallback, useEffect, useState } from "react";

import { Play } from "../index_with_tw_base";

const meta = {
  title: "Foundations/Motion",
  parameters: {
    layout: "centered",
    docs: {
      description: {
        component: `Motion tokens as Tailwind utilities. Two decisions: **easing** (entering/exiting → ease-out, moving on screen → ease-in-out) and **duration** (bigger element → longer). Prefer the semantic aliases (\`s-ease-enter\`, \`s-duration-enter\`, …).`,
      },
    },
  },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

interface MotionToken {
  label: string;
  easingClass?: string;
  // Raw CSS value for curves that have no token on purpose (ease-in demo).
  easingStyle?: string;
  durationClass?: string;
  circleClass?: string;
  note?: string;
}

interface MotionGroup {
  group: string;
  description: string;
  items: MotionToken[];
}

const EASING_GROUPS: MotionGroup[] = [
  {
    group: "Ease Out",
    description:
      "For anything entering or exiting the screen. The fast start feels responsive. Sorted weak → strong: bigger elements take stronger curves.",
    items: [
      {
        label: "out-quad",
        easingClass: "s-ease-out-quad",
        note: "subtle: button press, small fades",
      },
      {
        label: "out-cubic",
        easingClass: "s-ease-out-cubic",
        note: "the everyday default",
      },
      { label: "out-quart", easingClass: "s-ease-out-quart" },
      {
        label: "out-quint",
        easingClass: "s-ease-out-quint",
        note: "pronounced settle: modals, drawers",
      },
      {
        label: "out-expo",
        easingClass: "s-ease-out-expo",
        note: "very snappy: large surfaces, sheets",
      },
    ],
  },
  {
    group: "Ease In-Out",
    description:
      "For elements already on screen that move or morph. Never for enter/exit — the slow start delays feedback.",
    items: [
      {
        label: "in-out-quad",
        easingClass: "s-ease-in-out-quad",
        note: "gentle: small position shifts",
      },
      {
        label: "in-out-cubic",
        easingClass: "s-ease-in-out-cubic",
        note: "standard on-screen movement",
      },
      {
        label: "in-out-quint",
        easingClass: "s-ease-in-out-quint",
        note: "dramatic: full-screen morphs",
      },
    ],
  },
  {
    group: "Semantic aliases",
    description:
      "Prefer these in components so you can retune the whole system from one place.",
    items: [
      {
        label: "enter",
        easingClass: "s-ease-enter",
        note: "= out-cubic — tooltips, dropdowns, popovers",
      },
      {
        label: "emphasized",
        easingClass: "s-ease-emphasized",
        note: "= out-quint — modals, drawers",
      },
      {
        label: "move",
        easingClass: "s-ease-move",
        note: "= in-out-quad — tab indicators, reorder",
      },
    ],
  },
];

const EASE_IN_COMPARISON: MotionGroup = {
  group: "Why there is no ease-in",
  description:
    "Ease-in starts slow and accelerates into the stop — the UI feels sluggish, so there are no ease-in tokens. For hovers use the default ease; ease-linear is for progress and marquees only.",
  items: [
    {
      label: "out-cubic",
      easingClass: "s-ease-out-cubic",
      circleClass: "s-bg-green-500",
      note: "responds instantly, settles naturally",
    },
    {
      label: "ease-in",
      easingStyle: "cubic-bezier(0.55, 0.085, 0.68, 0.53)",
      circleClass: "s-bg-red-500",
      note: "sluggish start, abrupt stop — avoid",
    },
  ],
};

const DURATION_GROUPS: MotionGroup[] = [
  {
    group: "Primitives",
    description:
      "300ms is the ceiling for product UI. Anything used 100+ times a day: no animation at all.",
    items: [
      {
        label: "duration-100",
        durationClass: "s-duration-100",
        note: "micro-interactions (press, toggle)",
      },
      {
        label: "duration-150",
        durationClass: "s-duration-150",
        note: "hover & color transitions",
      },
      {
        label: "duration-200",
        durationClass: "s-duration-200",
        note: "standard UI (tooltips, dropdowns)",
      },
      {
        label: "duration-300",
        durationClass: "s-duration-300",
        note: "modals & drawers — the ceiling",
      },
    ],
  },
  {
    group: "Semantic durations",
    description:
      "Exits run ~20% faster than entrances — these names encode the rule for you.",
    items: [
      {
        label: "duration-enter",
        durationClass: "s-duration-enter",
        note: "200ms — standard UI appearing",
      },
      {
        label: "duration-exit",
        durationClass: "s-duration-exit",
        note: "160ms — same element leaving",
      },
      {
        label: "duration-modal-enter",
        durationClass: "s-duration-modal-enter",
        note: "300ms — largest surfaces",
      },
      {
        label: "duration-modal-exit",
        durationClass: "s-duration-modal-exit",
        note: "240ms — largest surfaces leaving",
      },
    ],
  },
];

function MotionRow({
  label,
  easingClass = "s-ease-out-cubic",
  easingStyle,
  durationClass = "s-duration-1000",
  circleClass = "s-bg-foreground dark:s-bg-foreground-night",
  note,
  playSignal,
}: MotionToken & { playSignal?: number }) {
  const [animate, setAnimate] = useState(false);
  // Replay needs the box to snap back to the start without animating,
  // so the transition is disabled for the reset frame.
  const [resetting, setResetting] = useState(false);

  const play = useCallback(() => {
    setResetting(true);
    setAnimate(false);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setResetting(false);
        setAnimate(true);
      });
    });
  }, []);

  useEffect(() => {
    if (playSignal !== undefined && playSignal > 0) {
      play();
    }
  }, [playSignal, play]);

  return (
    <div className="s-flex s-items-center s-gap-2">
      <button
        onClick={play}
        aria-label={`Play ${label}`}
        className="s-flex s-h-7 s-w-7 s-shrink-0 s-items-center s-justify-center s-rounded s-text-muted-foreground hover:s-bg-gray-100 hover:s-text-foreground dark:hover:s-bg-gray-800"
      >
        <Play className="s-h-4 s-w-4" />
      </button>
      <div className="s-w-44 s-shrink-0">
        <div className="s-font-mono s-text-xs s-text-foreground">{label}</div>
        {note && (
          <div className="s-text-xs s-text-muted-foreground">{note}</div>
        )}
      </div>
      <div className="s-relative s-h-10 s-w-full s-rounded-full s-bg-gray-100 dark:s-bg-gray-800">
        <div
          className={`s-absolute s-top-2 s-h-6 s-w-6 s-rounded-full ${circleClass} ${
            resetting
              ? "s-transition-none"
              : `s-transition-all ${easingStyle ? "" : easingClass} ${durationClass}`
          }`}
          style={{
            left: animate ? "calc(100% - 2rem)" : "0.5rem",
            transitionTimingFunction: resetting ? undefined : easingStyle,
          }}
        />
      </div>
    </div>
  );
}

function MotionGroupSection({ group, description, items }: MotionGroup) {
  const [playSignal, setPlaySignal] = useState(0);

  return (
    <div className="s-flex s-flex-col s-gap-3">
      <div>
        <div className="s-flex s-items-center s-gap-3">
          <h3 className="s-text-lg s-font-semibold">{group}</h3>
          <button
            onClick={() => setPlaySignal((n) => n + 1)}
            className="s-rounded s-border s-border-border s-px-3 s-py-1 s-text-xs s-font-medium s-text-muted-foreground hover:s-bg-gray-100 dark:s-border-border-night dark:hover:s-bg-gray-800"
          >
            Play all
          </button>
        </div>
        <p className="s-mt-1 s-text-sm s-text-muted-foreground">
          {description}
        </p>
      </div>
      {items.map((item) => (
        <MotionRow key={item.label} {...item} playSignal={playSignal} />
      ))}
    </div>
  );
}

interface EnterExitDemoProps {
  label: string;
  description: string;
  easingClass: string;
  enterDurationClass: string;
  exitDurationClass: string;
}

function EnterExitDemo({
  label,
  description,
  easingClass,
  enterDurationClass,
  exitDurationClass,
}: EnterExitDemoProps) {
  const [open, setOpen] = useState(true);

  return (
    <div className="s-flex s-flex-col s-gap-3">
      <div>
        <div className="s-flex s-items-center s-gap-3">
          <h3 className="s-text-lg s-font-semibold">{label}</h3>
          <button
            onClick={() => setOpen((prev) => !prev)}
            className="s-rounded s-bg-blue-500 s-px-3 s-py-1 s-text-xs s-font-medium s-text-white hover:s-bg-blue-600"
          >
            {open ? "Dismiss" : "Open"}
          </button>
        </div>
        <p className="s-mt-1 s-text-sm s-text-muted-foreground">
          {description}
        </p>
      </div>
      <div className="s-flex s-h-40 s-items-center s-justify-center s-rounded s-bg-gray-100 dark:s-bg-gray-800">
        <div
          className={`s-flex s-h-28 s-w-64 s-items-center s-justify-center s-rounded-xl s-border s-border-border s-bg-background s-text-sm s-text-muted-foreground s-shadow-md s-transition-all dark:s-border-border-night dark:s-bg-background-night ${easingClass} ${
            open
              ? `s-scale-100 s-opacity-100 ${enterDurationClass}`
              : `s-scale-95 s-opacity-0 ${exitDurationClass}`
          }`}
        >
          {open ? "Visible" : ""}
        </div>
      </div>
    </div>
  );
}

export const Easing: Story = {
  render: () => (
    <div className="s-flex s-w-[640px] s-flex-col s-gap-8 s-p-8">
      <div>
        <h2 className="s-text-xl s-font-semibold">Easing</h2>
        <p className="s-mt-1 s-text-sm s-text-muted-foreground">
          Entering or exiting the screen → ease-out. Moving while on screen →
          ease-in-out.
        </p>
      </div>
      {EASING_GROUPS.map((group) => (
        <MotionGroupSection key={group.group} {...group} />
      ))}
      <MotionGroupSection {...EASE_IN_COMPARISON} />
    </div>
  ),
};

export const Durations: Story = {
  render: () => (
    <div className="s-flex s-w-[640px] s-flex-col s-gap-8 s-p-8">
      <div>
        <h2 className="s-text-xl s-font-semibold">Durations</h2>
        <p className="s-mt-1 s-text-sm s-text-muted-foreground">
          Bigger elements need more time. Use “Play all” to compare (all rows
          use ease-out-cubic).
        </p>
      </div>
      {DURATION_GROUPS.map((group) => (
        <MotionGroupSection key={group.group} {...group} />
      ))}
    </div>
  ),
};

export const EnterExitPairing: Story = {
  render: () => (
    <div className="s-flex s-w-[640px] s-flex-col s-gap-8 s-p-8">
      <div>
        <h2 className="s-text-xl s-font-semibold">Pairing the tokens</h2>
        <p className="s-mt-1 s-text-sm s-text-muted-foreground">
          Pick the pair that matches the element’s size. The exit is quicker
          than the entrance.
        </p>
      </div>
      <EnterExitDemo
        label="Standard UI"
        description="Tooltips, dropdowns, popovers: s-ease-enter with s-duration-enter (200ms) in, s-duration-exit (160ms) out."
        easingClass="s-ease-enter"
        enterDurationClass="s-duration-enter"
        exitDurationClass="s-duration-exit"
      />
      <EnterExitDemo
        label="Modals & drawers"
        description="Larger surfaces, longer + stronger: s-ease-emphasized with s-duration-modal-enter (300ms) in, s-duration-modal-exit (240ms) out."
        easingClass="s-ease-emphasized"
        enterDurationClass="s-duration-modal-enter"
        exitDurationClass="s-duration-modal-exit"
      />
    </div>
  ),
};
