import type { Meta, StoryObj } from "@storybook/react";
import React from "react";

import {
  Copyable,
  useComputedStyle,
  withThemedSurface,
} from "./foundations-helpers";

const meta = {
  title: "Foundations/Shadows",
  tags: ["autodocs"],
  decorators: [withThemedSurface],
  parameters: {
    layout: "centered",
    docs: {
      description: {
        component: `The elevation scale: box shadows (\`shadow\` through \`shadow-2xl\`) for surfaces and drop shadows (\`drop-shadow-*\`) for irregular shapes. Apply these Tailwind utilities to convey elevation consistently, reserving larger shadows for higher, more transient surfaces like popovers and dialogs. In dark mode the surface tokens \`bg-panel-background\`, \`bg-overlay-background\`, and \`bg-modal-background\` carry built-in elevation shadows that override these utilities — see Surface Elevation below. Click a specimen to copy its class; the caption shows the live computed value. Specimens sit on a \`muted-background\` surface so elevation reads in both light and dark themes.`,
      },
    },
  },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const BOX_MEASURED = ["box-shadow"] as const;
const FILTER_MEASURED = ["filter"] as const;

const ShadowBox = ({
  label,
  shadowClass,
  measure,
  surface = "bg-background",
}: {
  label: string;
  shadowClass: string;
  // Which computed property carries the value for this kind of shadow.
  measure: "box-shadow" | "filter";
  // The fill of the specimen box; surface-token specimens supply their own.
  surface?: string;
}) => {
  const ref = React.useRef<HTMLDivElement>(null);
  const measured = useComputedStyle(
    ref,
    measure === "box-shadow" ? BOX_MEASURED : FILTER_MEASURED
  );
  const value = measured[measure];

  return (
    <Copyable value={shadowClass} className="flex flex-col items-center gap-2">
      <div
        className={`h-24 w-24 rounded-lg ${surface} ${shadowClass}`}
        ref={ref}
      />
      <div className="flex flex-col items-center">
        <span className="font-mono text-sm text-primary-600">
          {shadowClass}
        </span>
        <span className="max-w-40 truncate font-mono text-[10px] text-muted-foreground">
          {value && value !== "none" ? value : "—"}
        </span>
      </div>
    </Copyable>
  );
};

const boxShadows = [
  "shadow",
  "shadow-md",
  "shadow-lg",
  "shadow-xl",
  "shadow-2xl",
] as const;

const dropShadows = [
  "drop-shadow",
  "drop-shadow-sm",
  "drop-shadow-md",
  "drop-shadow-lg",
  "drop-shadow-xl",
  "drop-shadow-2xl",
] as const;

export const BoxShadows: Story = {
  render: () => (
    <div className="rounded-xl bg-muted-background p-8">
      <h2 className="mb-6 text-xl font-semibold">Box Shadows</h2>
      <div className="flex flex-wrap gap-8">
        {boxShadows.map((shadowClass) => (
          <ShadowBox
            key={shadowClass}
            label={shadowClass}
            shadowClass={shadowClass}
            measure="box-shadow"
          />
        ))}
      </div>
    </div>
  ),
};

const elevatedSurfaces = [
  "bg-panel-background",
  "bg-overlay-background",
  "bg-modal-background",
] as const;

export const SurfaceElevation: Story = {
  render: () => (
    <div className="rounded-xl bg-app-background p-8">
      <h2 className="mb-2 text-xl font-semibold">Surface Elevation</h2>
      <p className="mb-6 max-w-lg text-sm text-muted-foreground">
        In dark mode these surface tokens carry built-in shadows (panel &lt;
        overlay &lt; modal) that override shadow-* utilities on the same
        element, and a surface nested inside the same surface casts none. In
        light mode they are flat — pair them with the box shadows above. Toggle
        the theme to compare.
      </p>
      <div className="flex flex-wrap gap-8">
        {elevatedSurfaces.map((surfaceClass) => (
          <ShadowBox
            key={surfaceClass}
            label={surfaceClass}
            shadowClass={surfaceClass}
            surface=""
            measure="box-shadow"
          />
        ))}
      </div>
    </div>
  ),
};

export const DropShadows: Story = {
  render: () => (
    <div className="rounded-xl bg-muted-background p-8">
      <h2 className="mb-6 text-xl font-semibold">Drop Shadows</h2>
      <div className="flex flex-wrap gap-8">
        {dropShadows.map((shadowClass) => (
          <ShadowBox
            key={shadowClass}
            label={shadowClass}
            shadowClass={shadowClass}
            measure="filter"
          />
        ))}
      </div>
    </div>
  ),
};
