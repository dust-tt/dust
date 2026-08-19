import type { Meta, StoryObj } from "@storybook/react";
import React from "react";

import { cn } from "@sparkle/lib/utils";

import {
  TokenChip,
  useComputedStyle,
  withThemedSurface,
} from "./foundations-helpers";

const meta = {
  title: "Foundations/Shadows",
  tags: ["!manifest", "autodocs"],
  decorators: [withThemedSurface],
  parameters: {
    layout: "padded",
    docs: {
      description: {
        component: `The elevation scale: box shadows (\`shadow\` through \`shadow-2xl\`) for surfaces and drop shadows (\`drop-shadow-*\`) for irregular shapes. Apply these Tailwind utilities to convey elevation consistently, reserving larger shadows for higher, more transient surfaces like popovers and dialogs. The surface tokens \`bg-panel-background\`, \`bg-overlay-background\`, and \`bg-modal-background\` carry built-in elevation shadows in both themes that override these utilities on the same element — see Surface Elevation below. Each token is shown as a reference row: live specimen on a \`muted-background\` plate, a click-to-copy class chip, its computed value (read from the compiled CSS), and a description of intended use.`,
      },
    },
  },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

type ShadowRow = {
  // Utility class documented by the row; the chip copies this.
  name: string;
  // Classes applied to the specimen box (defaults to `bg-background ${name}`).
  boxClassName?: string;
  description?: React.ReactNode;
};

// Which computed property carries the value for this kind of shadow.
type MeasureKind = "box-shadow" | "filter";

const BOX_MEASURED = ["box-shadow"] as const;
const FILTER_MEASURED = ["filter"] as const;

const ShadowTableRow = ({
  row,
  measure,
  withDescription,
}: {
  row: ShadowRow;
  measure: MeasureKind;
  withDescription: boolean;
}) => {
  const ref = React.useRef<HTMLDivElement>(null);
  const measured = useComputedStyle(
    ref,
    measure === "box-shadow" ? BOX_MEASURED : FILTER_MEASURED
  );
  const value = measured[measure];

  return (
    <tr className="border-b border-border last:border-b-0">
      <td className="w-48 py-3 pr-4 align-middle">
        {/* A muted plate under each specimen so elevation reads in both
            themes, like the swatch column in the Colors tables. */}
        <div className="rounded-lg bg-muted-background p-4">
          <div
            ref={ref}
            className={cn(
              "h-14 w-full rounded-lg",
              row.boxClassName ?? `bg-background ${row.name}`
            )}
          />
        </div>
      </td>
      <td className="py-3 pr-4 align-middle">
        <TokenChip value={row.name} />
      </td>
      <td className="max-w-md py-3 pr-4 align-middle font-mono text-xs text-muted-foreground">
        {value && value !== "none" ? value : "—"}
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
const ShadowTable = ({
  rows,
  measure = "box-shadow",
}: {
  rows: ShadowRow[];
  measure?: MeasureKind;
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
          <ShadowTableRow
            key={row.name}
            row={row}
            measure={measure}
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

export const BoxShadows: Story = {
  render: () => (
    <Section
      title="Box Shadows"
      description={
        <p className="text-sm text-primary-600">
          The elevation ladder for rectangular surfaces. Bigger shadows mean
          higher, more transient surfaces.
        </p>
      }
    >
      <ShadowTable
        rows={[
          { name: "shadow", description: "Subtle lift: cards at rest." },
          { name: "shadow-md", description: "Raised cards and hover states." },
          {
            name: "shadow-lg",
            description: "Dropdowns, popovers, and tooltips.",
          },
          { name: "shadow-xl", description: "Dialogs and sheets." },
          {
            name: "shadow-2xl",
            description: "The highest, most transient surfaces.",
          },
        ]}
      />
    </Section>
  ),
};

export const SurfaceElevation: Story = {
  render: () => (
    <Section
      title="Surface Elevation"
      description={
        <p className="text-sm text-primary-600">
          These surface tokens carry built-in shadows in both themes (panel &lt;
          overlay &lt; modal) that override shadow-* utilities on the same
          element. In dark mode, a surface nested inside the same surface casts
          none. Toggle the theme to compare light and dark elevation.
        </p>
      }
    >
      <ShadowTable
        rows={[
          {
            name: "bg-panel-background",
            boxClassName: "bg-panel-background",
            description: "Panels and cards — the lowest elevation step.",
          },
          {
            name: "bg-overlay-background",
            boxClassName: "bg-overlay-background",
            description: "Dropdowns, popovers, and tooltips.",
          },
          {
            name: "bg-modal-background",
            boxClassName: "bg-modal-background",
            description: "Dialogs and sheets — the highest elevation.",
          },
        ]}
      />
    </Section>
  ),
};

export const DropShadows: Story = {
  render: () => (
    <Section
      title="Drop Shadows"
      description={
        <p className="text-sm text-primary-600">
          Filter-based shadows that follow an element's rendered silhouette —
          use for irregular shapes (icons, images with transparency) where a box
          shadow would draw a rectangle.
        </p>
      }
    >
      <ShadowTable
        measure="filter"
        rows={[
          { name: "drop-shadow" },
          { name: "drop-shadow-sm" },
          { name: "drop-shadow-md" },
          { name: "drop-shadow-lg" },
          { name: "drop-shadow-xl" },
          { name: "drop-shadow-2xl" },
        ]}
      />
    </Section>
  ),
};
