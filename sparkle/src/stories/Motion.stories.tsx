import type { Meta, StoryObj } from "@storybook/react";
import React, { useState } from "react";

import { TokenChip, useCssVar, withThemedSurface } from "./foundations-helpers";

const meta = {
  title: "Foundations/Motion",
  tags: ["a11y-issues", "autodocs"],
  decorators: [withThemedSurface],
  parameters: {
    layout: "padded",
    docs: {
      description: {
        component: `Motion tokens as Tailwind utilities. Two decisions: **easing** (entering/exiting → ease-out, moving on screen → ease-in-out) and **duration** (bigger element → longer). Prefer the semantic aliases (\`ease-enter\`, \`duration-enter\`, …). For JavaScript animation libraries, import \`MOTION_EASINGS\` and \`MOTION_DURATIONS\` from \`@dust-tt/sparkle\`. Each token is shown as a reference row: a continuously looping specimen (a ball tracing the curve, a square spinning at the duration), a click-to-copy class chip, its resolved value, and a description of intended use.`,
      },
    },
  },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const SLIDE_KEYFRAMES = "sb-motion-slide";
const SPIN_KEYFRAMES = "sb-motion-spin";

// Keyframes for the looping specimens. The slide moves during the first 65%
// and holds the rest, so each loop reads as one gesture with a beat between.
const MotionKeyframes = () => (
  <style>{`
    @keyframes ${SLIDE_KEYFRAMES} {
      0% { transform: translateX(0); }
      65% { transform: translateX(8.25rem); }
      100% { transform: translateX(8.25rem); }
    }
    @keyframes ${SPIN_KEYFRAMES} {
      to { transform: rotate(360deg); }
    }
    @media (prefers-reduced-motion: reduce) {
      .sb-motion-specimen {
        /* The specimens animate via inline style; only !important wins here. */
        animation: none !important;
      }
    }
  `}</style>
);

type MotionRow = {
  // Utility class documented by the row; the chip copies it.
  name: string;
  // Raw CSS easing for curves that have no token on purpose (ease-in demo).
  rawEasing?: string;
  description?: React.ReactNode;
};

type MotionKind = "easing" | "duration";

// The duration utilities: numeric ones (duration-200) resolve to a literal,
// semantic ones (duration-enter) to their --transition-duration-* variable.
const durationSuffix = (name: string) =>
  name.startsWith("duration-") ? name.slice("duration-".length) : "";

const MotionTableRow = ({
  row,
  kind,
  withDescription,
}: {
  row: MotionRow;
  kind: MotionKind;
  withDescription: boolean;
}) => {
  const suffix = durationSuffix(row.name);
  const isNumericDuration = /^\d+$/.test(suffix);

  const cssVarName =
    kind === "easing"
      ? row.rawEasing
        ? ""
        : `--${row.name}`
      : isNumericDuration
        ? ""
        : `--transition-duration-${suffix}`;
  const varValue = useCssVar(cssVarName);
  const resolvedValue =
    row.rawEasing ?? (isNumericDuration ? `${suffix}ms` : varValue);

  const specimen =
    kind === "easing" ? (
      <div className="relative h-8 w-44 rounded-full bg-primary-100">
        <div
          className="sb-motion-specimen absolute left-1.5 top-1.5 h-5 w-5 rounded-full bg-foreground"
          style={{
            animation: `${SLIDE_KEYFRAMES} 1400ms infinite`,
            animationTimingFunction: row.rawEasing ?? `var(--${row.name})`,
          }}
        />
      </div>
    ) : (
      <div className="flex h-8 w-44 items-center">
        <div
          className="sb-motion-specimen h-6 w-6 rounded bg-foreground"
          style={{
            animation: `${SPIN_KEYFRAMES} linear infinite`,
            animationDuration: isNumericDuration
              ? `${suffix}ms`
              : `var(--transition-duration-${suffix})`,
          }}
        />
      </div>
    );

  return (
    <tr className="border-b border-border last:border-b-0">
      <td className="w-52 py-3 pr-4 align-middle">{specimen}</td>
      <td className="py-3 pr-4 align-middle">
        {row.rawEasing ? (
          // No token on purpose — show a plain label instead of a copy chip.
          <span className="font-mono text-xs text-muted-foreground">
            {row.name}
          </span>
        ) : (
          <TokenChip value={row.name} />
        )}
      </td>
      <td className="whitespace-nowrap py-3 pr-4 align-middle font-mono text-xs text-muted-foreground">
        {resolvedValue || "—"}
      </td>
      {withDescription && (
        <td className="py-3 align-middle text-sm text-muted-foreground">
          {row.description ?? "—"}
        </td>
      )}
    </tr>
  );
};

// Mirrors the Colors TokenTable: specimen · copyable chip · live value ·
// optional description, so every Foundations page reads the same way.
const MotionTable = ({
  rows,
  kind,
}: {
  rows: MotionRow[];
  kind: MotionKind;
}) => {
  const withDescription = rows.some((row) => row.description != null);
  return (
    <table className="w-full border-collapse text-left">
      <thead>
        <tr className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
          <th className="py-2 pr-4 font-medium">Preview</th>
          <th className="py-2 pr-4 font-medium">Name</th>
          <th className="py-2 pr-4 font-medium">Value</th>
          {withDescription && <th className="py-2 font-medium">Description</th>}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <MotionTableRow
            key={row.name}
            row={row}
            kind={kind}
            withDescription={withDescription}
          />
        ))}
      </tbody>
    </table>
  );
};

const Section = ({
  title,
  description,
  children,
}: {
  title: string;
  description: React.ReactNode;
  children: React.ReactNode;
}) => (
  <div className="flex flex-col gap-8">
    <div className="flex flex-col gap-2">
      <h2 className="text-xl font-semibold">{title}</h2>
      {description}
    </div>
    {children}
  </div>
);

export const Easing: Story = {
  render: () => (
    <div className="flex flex-col gap-12">
      <MotionKeyframes />
      <Section
        title="Ease Out"
        description={
          <p className="text-sm text-primary-600">
            For anything entering or exiting the screen — the fast start feels
            responsive. Sorted weak → strong: bigger elements take stronger
            curves.
          </p>
        }
      >
        <MotionTable
          kind="easing"
          rows={[
            {
              name: "ease-out-quad",
              description: "Subtle: button press, small fades.",
            },
            {
              name: "ease-out-cubic",
              description: "The everyday default.",
            },
            { name: "ease-out-quart" },
            {
              name: "ease-out-quint",
              description: "Pronounced settle: modals, drawers.",
            },
            {
              name: "ease-out-expo",
              description: "Very snappy: large surfaces, sheets.",
            },
          ]}
        />
      </Section>
      <Section
        title="Ease In-Out"
        description={
          <p className="text-sm text-primary-600">
            For elements already on screen that move or morph. Never for
            enter/exit — the slow start delays feedback.
          </p>
        }
      >
        <MotionTable
          kind="easing"
          rows={[
            {
              name: "ease-in-out-quad",
              description: "Gentle: small position shifts.",
            },
            {
              name: "ease-in-out-cubic",
              description: "Standard on-screen movement.",
            },
            {
              name: "ease-in-out-quint",
              description: "Dramatic: full-screen morphs.",
            },
          ]}
        />
      </Section>
      <Section
        title="Semantic aliases"
        description={
          <p className="text-sm text-primary-600">
            Prefer these in components so the whole system can be retuned from
            one place.
          </p>
        }
      >
        <MotionTable
          kind="easing"
          rows={[
            {
              name: "ease-enter",
              description: "= out-cubic — tooltips, dropdowns, popovers.",
            },
            {
              name: "ease-emphasized",
              description: "= out-quint — modals, drawers.",
            },
            {
              name: "ease-move",
              description: "= in-out-quad — tab indicators, reorder.",
            },
          ]}
        />
      </Section>
      <Section
        title="Why there is no ease-in"
        description={
          <p className="text-sm text-primary-600">
            Ease-in starts slow and accelerates into the stop — the UI feels
            sluggish, so there are no ease-in tokens. For hovers use the default
            ease; ease-linear is for progress and marquees only.
          </p>
        }
      >
        <MotionTable
          kind="easing"
          rows={[
            {
              name: "ease-out-cubic",
              description: "Responds instantly, settles naturally.",
            },
            {
              name: "ease-in",
              rawEasing: "cubic-bezier(0.55, 0.085, 0.68, 0.53)",
              description: "Sluggish start, abrupt stop — avoid.",
            },
          ]}
        />
      </Section>
    </div>
  ),
};

export const Durations: Story = {
  render: () => (
    <div className="flex flex-col gap-12">
      <MotionKeyframes />
      <Section
        title="Durations"
        description={
          <p className="text-sm text-primary-600">
            Bigger elements need more time; each square completes one turn per
            token duration. 300ms is the ceiling for product UI — anything used
            100+ times a day gets no animation at all.
          </p>
        }
      >
        <MotionTable
          kind="duration"
          rows={[
            {
              name: "duration-100",
              description: "Micro-interactions (press, toggle).",
            },
            {
              name: "duration-150",
              description: "Hover & color transitions.",
            },
            {
              name: "duration-200",
              description: "Standard UI (tooltips, dropdowns).",
            },
            {
              name: "duration-300",
              description: "Modals & drawers — the ceiling.",
            },
          ]}
        />
      </Section>
      <Section
        title="Semantic durations"
        description={
          <p className="text-sm text-primary-600">
            Exits run ~20% faster than entrances — these names encode the rule
            for you.
          </p>
        }
      >
        <MotionTable
          kind="duration"
          rows={[
            {
              name: "duration-enter",
              description: "Standard UI appearing.",
            },
            {
              name: "duration-exit",
              description: "The same element leaving.",
            },
            {
              name: "duration-modal-enter",
              description: "The largest surfaces appearing.",
            },
            {
              name: "duration-modal-exit",
              description: "The largest surfaces leaving.",
            },
          ]}
        />
      </Section>
    </div>
  ),
};

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

export const EnterExitPairing: Story = {
  render: () => (
    <div className="flex max-w-2xl flex-col gap-8">
      <div>
        <h2 className="text-xl font-semibold">Pairing the tokens</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Pick the pair that matches the element's size. The exit is quicker
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
