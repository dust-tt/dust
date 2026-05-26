import type { Meta, StoryObj } from "@storybook/react";
import React, { useCallback, useEffect, useRef, useState } from "react";

import {
  Atom01V2,
  MessageChatCircleV2,
  NavTabPill,
  NavTabPillList,
  NavTabPillTrigger,
  Settings02V2,
} from "../index_with_tw_base";

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
      {
        label: "css ease",
        class: "s-ease",
        cp: [0.25, 0.1, 0.25, 1] as const,
      },
      {
        label: "css ease-out",
        class: "s-ease-out",
        cp: [0, 0, 0.58, 1] as const,
      },
      {
        label: "out-quad",
        class: "s-ease-out-quad",
        cp: [0.25, 0.46, 0.45, 0.94] as const,
      },
      {
        label: "out-cubic",
        class: "s-ease-out-cubic",
        cp: [0.215, 0.61, 0.355, 1] as const,
      },
      {
        label: "out-quart",
        class: "s-ease-out-quart",
        cp: [0.165, 0.84, 0.44, 1] as const,
      },
      {
        label: "out-quint",
        class: "s-ease-out-quint",
        cp: [0.23, 1, 0.32, 1] as const,
      },
      {
        label: "out-expo",
        class: "s-ease-out-expo",
        cp: [0.19, 1, 0.22, 1] as const,
      },
      {
        label: "out-circ",
        class: "s-ease-out-circ",
        cp: [0.075, 0.82, 0.165, 1] as const,
      },
    ],
  },
  {
    group: "Ease In-Out",
    description:
      "For elements already visible on screen that move to a new position or morph shape (resizing panels, morphing containers, expanding/collapsing in place). Mimics natural acceleration and deceleration.",
    items: [
      {
        label: "in-out-quad",
        class: "s-ease-in-out-quad",
        cp: [0.455, 0.03, 0.515, 0.955] as const,
      },
      {
        label: "in-out-cubic",
        class: "s-ease-in-out-cubic",
        cp: [0.645, 0.045, 0.355, 1] as const,
      },
      {
        label: "in-out-quart",
        class: "s-ease-in-out-quart",
        cp: [0.77, 0, 0.175, 1] as const,
      },
      {
        label: "in-out-quint",
        class: "s-ease-in-out-quint",
        cp: [0.86, 0, 0.07, 1] as const,
      },
      {
        label: "in-out-expo",
        class: "s-ease-in-out-expo",
        cp: [1, 0, 0, 1] as const,
      },
      {
        label: "in-out-circ",
        class: "s-ease-in-out-circ",
        cp: [0.785, 0.135, 0.15, 0.86] as const,
      },
    ],
  },
  {
    group: "Ease In — Avoid in most cases",
    description:
      "Almost never use for UI. The slow start makes interfaces feel sluggish and unresponsive. It accelerates at the end, which is the opposite of what our brain expects — things should settle, not speed up.",
    items: [
      {
        label: "in-quad",
        class: "s-ease-in-quad",
        cp: [0.55, 0.085, 0.68, 0.53] as const,
      },
      {
        label: "in-cubic",
        class: "s-ease-in-cubic",
        cp: [0.55, 0.055, 0.675, 0.19] as const,
      },
      {
        label: "in-quart",
        class: "s-ease-in-quart",
        cp: [0.895, 0.03, 0.685, 0.22] as const,
      },
      {
        label: "in-quint",
        class: "s-ease-in-quint",
        cp: [0.755, 0.05, 0.855, 0.06] as const,
      },
      {
        label: "in-expo",
        class: "s-ease-in-expo",
        cp: [0.95, 0.05, 0.795, 0.035] as const,
      },
      {
        label: "in-circ",
        class: "s-ease-in-circ",
        cp: [0.6, 0.04, 0.98, 0.335] as const,
      },
    ],
  },
];

function EasingGraph({
  controlPoints,
  size = 48,
}: {
  controlPoints: readonly [number, number, number, number];
  size?: number;
}) {
  const [x1, y1, x2, y2] = controlPoints;
  const pad = 4;
  const s = size - pad * 2;

  const toX = (v: number) => pad + v * s;
  const toY = (v: number) => pad + (1 - v) * s;

  const d = `M ${toX(0)} ${toY(0)} C ${toX(x1)} ${toY(y1)}, ${toX(x2)} ${toY(y2)}, ${toX(1)} ${toY(1)}`;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className="s-flex-shrink-0"
    >
      <rect
        x={pad}
        y={pad}
        width={s}
        height={s}
        fill="none"
        stroke="currentColor"
        strokeWidth={0.5}
        opacity={0.15}
      />
      <line
        x1={toX(0)}
        y1={toY(0)}
        x2={toX(1)}
        y2={toY(1)}
        stroke="currentColor"
        strokeWidth={0.5}
        opacity={0.15}
        strokeDasharray="2 2"
      />
      <path d={d} fill="none" stroke="currentColor" strokeWidth={1.5} />
    </svg>
  );
}

function EasingRow({
  label,
  easingClass,
  controlPoints,
}: {
  label: string;
  easingClass: string;
  controlPoints: readonly [number, number, number, number];
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
      <EasingGraph controlPoints={controlPoints} />
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
  items: {
    label: string;
    class: string;
    cp: readonly [number, number, number, number];
  }[];
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
          controlPoints={item.cp}
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

function NavTabPillEasingsPlayground() {
  const easeOutItems = EASINGS[0].items;

  const [activeValues, setActiveValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(easeOutItems.map((e) => [e.label, "overview"]))
  );

  const playAll = () => {
    const current = activeValues[easeOutItems[0].label];
    const next = current === "overview" ? "analytics" : "overview";
    setActiveValues(
      Object.fromEntries(easeOutItems.map((e) => [e.label, next]))
    );
  };

  return (
    <div className="s-flex s-w-[600px] s-flex-col s-gap-6 s-p-8">
      <div>
        <h2 className="s-text-xl s-font-semibold">
          NavTabPill — Ease Out Comparison
        </h2>
        <p className="s-mt-1 s-text-sm s-text-muted-foreground">
          Compare how each ease-out curve feels on the NavTabPill expand
          animation.
        </p>
      </div>
      <button
        onClick={playAll}
        className="s-self-start s-rounded s-bg-blue-500 s-px-3 s-py-1.5 s-text-sm s-font-medium s-text-white hover:s-bg-blue-600"
      >
        Play all
      </button>
      {easeOutItems.map((easing) => (
        <div key={easing.label} className="s-flex s-items-center s-gap-4">
          <EasingGraph controlPoints={easing.cp} size={48} />
          <div>
            <div className="s-mb-1 s-font-mono s-text-xs s-text-muted-foreground">
              {easing.label}
            </div>
            <NavTabPill
              value={activeValues[easing.label]}
              onValueChange={(v) =>
                setActiveValues((prev) => ({ ...prev, [easing.label]: v }))
              }
            >
              <NavTabPillList>
                <NavTabPillTrigger
                  value="overview"
                  icon={MessageChatCircleV2}
                  easingClassName={{
                    trigger: easing.class,
                    grid: easing.class,
                  }}
                >
                  Work
                </NavTabPillTrigger>
                <NavTabPillTrigger
                  value="analytics"
                  icon={Atom01V2}
                  easingClassName={{
                    trigger: easing.class,
                    grid: easing.class,
                  }}
                >
                  Spaces
                </NavTabPillTrigger>
                <NavTabPillTrigger
                  value="settings"
                  icon={Settings02V2}
                  easingClassName={{
                    trigger: easing.class,
                    grid: easing.class,
                  }}
                >
                  Admin
                </NavTabPillTrigger>
              </NavTabPillList>
            </NavTabPill>
          </div>
        </div>
      ))}
    </div>
  );
}

export const NavTabPillEasings: Story = {
  render: () => <NavTabPillEasingsPlayground />,
};

function NavTabPillDualEasingPlayground() {
  const easeOutItems = EASINGS[0].items;
  const easeInOutItems = EASINGS[1].items;

  const [easingA, setEasingA] = useState(easeOutItems[0]);
  const [easingB, setEasingB] = useState(easeInOutItems[0]);
  const [activeA, setActiveA] = useState("overview");
  const [activeB, setActiveB] = useState("overview");

  const playBoth = () => {
    const next = activeA === "overview" ? "analytics" : "overview";
    setActiveA(next);
    setActiveB(next);
  };

  const allItems = [...easeOutItems, ...easeInOutItems];

  return (
    <div className="s-flex s-w-[700px] s-flex-col s-gap-6 s-p-8">
      <div>
        <h2 className="s-text-xl s-font-semibold">
          NavTabPill — Dual Easing Comparison
        </h2>
        <p className="s-mt-1 s-text-sm s-text-muted-foreground">
          Pick two easings (ease-out or ease-in-out) and play them side by side.
        </p>
      </div>

      <div className="s-flex s-gap-4">
        <div className="s-flex s-flex-col s-gap-1">
          <label className="s-text-xs s-font-medium s-text-muted-foreground">
            Easing A
          </label>
          <select
            className="s-rounded s-border s-px-2 s-py-1 s-text-sm"
            value={easingA.label}
            onChange={(e) => {
              const found = allItems.find((i) => i.label === e.target.value);
              if (found) {
                setEasingA(found);
              }
            }}
          >
            <optgroup label="Ease Out">
              {easeOutItems.map((item) => (
                <option key={item.label} value={item.label}>
                  {item.label}
                </option>
              ))}
            </optgroup>
            <optgroup label="Ease In-Out">
              {easeInOutItems.map((item) => (
                <option key={item.label} value={item.label}>
                  {item.label}
                </option>
              ))}
            </optgroup>
          </select>
        </div>
        <div className="s-flex s-flex-col s-gap-1">
          <label className="s-text-xs s-font-medium s-text-muted-foreground">
            Easing B
          </label>
          <select
            className="s-rounded s-border s-px-2 s-py-1 s-text-sm"
            value={easingB.label}
            onChange={(e) => {
              const found = allItems.find((i) => i.label === e.target.value);
              if (found) {
                setEasingB(found);
              }
            }}
          >
            <optgroup label="Ease Out">
              {easeOutItems.map((item) => (
                <option key={item.label} value={item.label}>
                  {item.label}
                </option>
              ))}
            </optgroup>
            <optgroup label="Ease In-Out">
              {easeInOutItems.map((item) => (
                <option key={item.label} value={item.label}>
                  {item.label}
                </option>
              ))}
            </optgroup>
          </select>
        </div>
      </div>

      <button
        onClick={playBoth}
        className="s-self-start s-rounded s-bg-blue-500 s-px-3 s-py-1.5 s-text-sm s-font-medium s-text-white hover:s-bg-blue-600"
      >
        Play both
      </button>

      <div className="s-flex s-flex-col s-gap-4">
        {[
          {
            label: easingA.label,
            easing: easingA,
            active: activeA,
            setActive: setActiveA,
          },
          {
            label: easingB.label,
            easing: easingB,
            active: activeB,
            setActive: setActiveB,
          },
        ].map(({ label, easing, active, setActive }) => (
          <div key={label} className="s-flex s-items-center s-gap-4">
            <EasingGraph controlPoints={easing.cp} size={48} />
            <div>
              <div className="s-mb-1 s-font-mono s-text-xs s-text-muted-foreground">
                {label}
              </div>
              <NavTabPill value={active} onValueChange={setActive}>
                <NavTabPillList>
                  <NavTabPillTrigger
                    value="overview"
                    icon={MessageChatCircleV2}
                    easingClassName={{
                      trigger: easing.class,
                      grid: easing.class,
                    }}
                  >
                    Work
                  </NavTabPillTrigger>
                  <NavTabPillTrigger
                    value="analytics"
                    icon={Atom01V2}
                    easingClassName={{
                      trigger: easing.class,
                      grid: easing.class,
                    }}
                  >
                    Spaces
                  </NavTabPillTrigger>
                  <NavTabPillTrigger
                    value="settings"
                    icon={Settings02V2}
                    easingClassName={{
                      trigger: easing.class,
                      grid: easing.class,
                    }}
                  >
                    Admin
                  </NavTabPillTrigger>
                </NavTabPillList>
              </NavTabPill>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export const NavTabPillDualEasings: Story = {
  render: () => <NavTabPillDualEasingPlayground />,
};
