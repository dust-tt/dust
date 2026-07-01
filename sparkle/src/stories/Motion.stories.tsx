import type { Meta, StoryObj } from "@storybook/react";
import React, { useCallback, useEffect, useState } from "react";

import { Play } from "../index_with_tw_base";
import { Copyable, useCssVar, withThemedSurface } from "./foundations-helpers";

const meta = {
  title: "Foundations/Motion",
  decorators: [withThemedSurface],
  parameters: {
    layout: "centered",
    docs: {
      description: {
        component: `Motion tokens as Tailwind utilities. Two decisions: **easing** (entering/exiting → ease-out, moving on screen → ease-in-out) and **duration** (bigger element → longer). Prefer the semantic aliases (\`ease-enter\`, \`duration-enter\`, …).`,
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
        easingClass: "ease-out-quad",
        note: "subtle: button press, small fades",
      },
      {
        label: "out-cubic",
        easingClass: "ease-out-cubic",
        note: "the everyday default",
      },
      { label: "out-quart", easingClass: "ease-out-quart" },
      {
        label: "out-quint",
        easingClass: "ease-out-quint",
        note: "pronounced settle: modals, drawers",
      },
      {
        label: "out-expo",
        easingClass: "ease-out-expo",
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
        easingClass: "ease-in-out-quad",
        note: "gentle: small position shifts",
      },
      {
        label: "in-out-cubic",
        easingClass: "ease-in-out-cubic",
        note: "standard on-screen movement",
      },
      {
        label: "in-out-quint",
        easingClass: "ease-in-out-quint",
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
        easingClass: "ease-enter",
        note: "= out-cubic — tooltips, dropdowns, popovers",
      },
      {
        label: "emphasized",
        easingClass: "ease-emphasized",
        note: "= out-quint — modals, drawers",
      },
      {
        label: "move",
        easingClass: "ease-move",
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
      easingClass: "ease-out-cubic",
      circleClass: "bg-green-500",
      note: "responds instantly, settles naturally",
    },
    {
      label: "ease-in",
      easingStyle: "cubic-bezier(0.55, 0.085, 0.68, 0.53)",
      circleClass: "bg-red-500",
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
        durationClass: "duration-100",
        note: "micro-interactions (press, toggle)",
      },
      {
        label: "duration-150",
        durationClass: "duration-150",
        note: "hover & color transitions",
      },
      {
        label: "duration-200",
        durationClass: "duration-200",
        note: "standard UI (tooltips, dropdowns)",
      },
      {
        label: "duration-300",
        durationClass: "duration-300",
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
        durationClass: "duration-enter",
        note: "200ms — standard UI appearing",
      },
      {
        label: "duration-exit",
        durationClass: "duration-exit",
        note: "160ms — same element leaving",
      },
      {
        label: "duration-modal-enter",
        durationClass: "duration-modal-enter",
        note: "300ms — largest surfaces",
      },
      {
        label: "duration-modal-exit",
        durationClass: "duration-modal-exit",
        note: "240ms — largest surfaces leaving",
      },
    ],
  },
];

function MotionRow({
  label,
  easingClass,
  easingStyle,
  durationClass,
  circleClass = "bg-foreground",
  note,
  playSignal,
}: MotionToken & { playSignal?: number }) {
  const effectiveEasing = easingStyle ? "" : (easingClass ?? "ease-out-cubic");
  const effectiveDuration = durationClass ?? "duration-1000";

  // A row demoes either an easing or a duration. The other axis is a default.
  const isDurationSubject =
    durationClass !== undefined && easingClass === undefined && !easingStyle;
  const copyValue = isDurationSubject ? durationClass : (easingClass ?? "");

  // Resolve the token's live value: cubic-bezier for easings, ms for durations.
  const easingValue = useCssVar(easingClass ? `--${easingClass}` : "");
  const durationSuffix = durationClass?.startsWith("duration-")
    ? durationClass.slice("duration-".length)
    : "";
  const durationIsNumeric = /^\d+$/.test(durationSuffix);
  const durationVarValue = useCssVar(
    durationIsNumeric ? "" : `--transition-duration-${durationSuffix}`
  );
  const resolvedValue = easingStyle
    ? easingStyle
    : isDurationSubject
      ? durationIsNumeric
        ? `${durationSuffix}ms`
        : durationVarValue
      : easingValue;

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
    <div className="flex items-center gap-2">
      <button
        onClick={play}
        aria-label={`Play ${label}`}
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-primary-100 hover:text-foreground"
      >
        <Play className="h-4 w-4" />
      </button>
      <div className="w-44 shrink-0">
        {copyValue ? (
          <Copyable value={copyValue}>
            <div className="font-mono text-xs text-foreground">{label}</div>
            {resolvedValue && (
              <div className="break-all font-mono text-[10px] text-muted-foreground">
                {resolvedValue}
              </div>
            )}
          </Copyable>
        ) : (
          <>
            <div className="font-mono text-xs text-foreground">{label}</div>
            {resolvedValue && (
              <div className="break-all font-mono text-[10px] text-muted-foreground">
                {resolvedValue}
              </div>
            )}
          </>
        )}
        {note && <div className="text-xs text-muted-foreground">{note}</div>}
      </div>
      <div className="relative h-10 w-full rounded-full bg-primary-100">
        <div
          className={`absolute top-2 h-6 w-6 rounded-full ${circleClass} ${
            resetting
              ? "transition-none"
              : `transition-all ${effectiveEasing} ${effectiveDuration}`
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
    <div className="flex flex-col gap-3">
      <div>
        <div className="flex items-center gap-3">
          <h3 className="text-lg font-semibold">{group}</h3>
          <button
            onClick={() => setPlaySignal((n) => n + 1)}
            className="rounded border border-border px-3 py-1 text-xs font-medium text-muted-foreground hover:bg-primary-100"
          >
            Play all
          </button>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
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
    <div className="flex flex-col gap-3">
      <div>
        <div className="flex items-center gap-3">
          <h3 className="text-lg font-semibold">{label}</h3>
          <button
            onClick={() => setOpen((prev) => !prev)}
            className="rounded bg-blue-500 px-3 py-1 text-xs font-medium text-white hover:bg-blue-600"
          >
            {open ? "Dismiss" : "Open"}
          </button>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
      <div className="flex h-40 items-center justify-center rounded bg-primary-100">
        <div
          className={`flex h-28 w-64 items-center justify-center rounded-xl border border-border bg-background text-sm text-muted-foreground shadow-md transition-all ${easingClass} ${
            open
              ? `scale-100 opacity-100 ${enterDurationClass}`
              : `scale-95 opacity-0 ${exitDurationClass}`
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
    <div className="flex w-[640px] flex-col gap-8 p-8">
      <div>
        <h2 className="text-xl font-semibold">Easing</h2>
        <p className="mt-1 text-sm text-muted-foreground">
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
    <div className="flex w-[640px] flex-col gap-8 p-8">
      <div>
        <h2 className="text-xl font-semibold">Durations</h2>
        <p className="mt-1 text-sm text-muted-foreground">
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
    <div className="flex w-[640px] flex-col gap-8 p-8">
      <div>
        <h2 className="text-xl font-semibold">Pairing the tokens</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Pick the pair that matches the element’s size. The exit is quicker
          than the entrance.
        </p>
      </div>
      <EnterExitDemo
        label="Standard UI"
        description="Tooltips, dropdowns, popovers: ease-enter with duration-enter (200ms) in, duration-exit (160ms) out."
        easingClass="ease-enter"
        enterDurationClass="duration-enter"
        exitDurationClass="duration-exit"
      />
      <EnterExitDemo
        label="Modals & drawers"
        description="Larger surfaces, longer + stronger: ease-emphasized with duration-modal-enter (300ms) in, duration-modal-exit (240ms) out."
        easingClass="ease-emphasized"
        enterDurationClass="duration-modal-enter"
        exitDurationClass="duration-modal-exit"
      />
    </div>
  ),
};
