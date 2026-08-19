import type { Meta, StoryObj } from "@storybook/react";
import React from "react";

import { cn } from "@sparkle/lib/utils";

import {
  TokenChip,
  useComputedStyle,
  withThemedSurface,
} from "./foundations-helpers";

const meta = {
  title: "Foundations/Borders",
  tags: ["!manifest", "autodocs"],
  decorators: [withThemedSurface],
  parameters: {
    layout: "padded",
    docs: {
      description: {
        component: `The border scale: corner radii (\`rounded-*\`) and stroke widths (\`border-*\`). Each token is shown as a reference row: live specimen, a click-to-copy class chip, its computed value (read from the compiled CSS), and a description of intended use. Border *colors* are structural color tokens — see the Surface & Structural table in **Foundations/Colors** (\`border\`, \`border-dark\`, \`border-focus\`, \`border-warning\`).`,
      },
    },
  },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

type BorderRow = {
  // Utility class documented by the row; the chip copies it.
  name: string;
  // Classes applied to the specimen (defaults to `name`).
  specimenClassName?: string;
  description?: React.ReactNode;
};

type BorderKind = "radius" | "width";

const RADIUS_MEASURED = ["border-radius"] as const;
const WIDTH_MEASURED = ["border-top-width"] as const;

const BorderTableRow = ({
  row,
  kind,
  withDescription,
}: {
  row: BorderRow;
  kind: BorderKind;
  withDescription: boolean;
}) => {
  const ref = React.useRef<HTMLDivElement>(null);
  const measured = useComputedStyle(
    ref,
    kind === "radius" ? RADIUS_MEASURED : WIDTH_MEASURED
  );
  const value =
    kind === "radius"
      ? measured["border-radius"]
      : measured["border-top-width"];

  const specimen =
    kind === "radius" ? (
      <div
        ref={ref}
        className={cn(
          "h-14 w-14 bg-foreground",
          row.specimenClassName ?? row.name
        )}
      />
    ) : (
      <div className="flex h-14 w-44 items-center">
        <div
          ref={ref}
          className={cn(
            "w-full border-foreground",
            row.specimenClassName ?? row.name
          )}
        />
      </div>
    );

  return (
    <tr className="border-b border-border last:border-b-0">
      <td className="w-52 py-3 pr-4 align-middle">{specimen}</td>
      <td className="py-3 pr-4 align-middle">
        <TokenChip value={row.name} />
      </td>
      <td className="whitespace-nowrap py-3 pr-4 align-middle font-mono text-xs text-muted-foreground">
        {value || "—"}
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
const BorderTable = ({
  rows,
  kind,
}: {
  rows: BorderRow[];
  kind: BorderKind;
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
          <BorderTableRow
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

export const BorderRadius: Story = {
  render: () => (
    <Section
      title="Border Radius"
      description={
        <p className="text-sm text-primary-600">
          The corner scale. Radius grows with the surface: small controls take
          small radii, floating surfaces take larger ones.
        </p>
      }
    >
      <BorderTable
        kind="radius"
        rows={[
          { name: "rounded-none" },
          { name: "rounded-xs" },
          { name: "rounded-sm" },
          {
            name: "rounded-md",
            description: "Small controls: checkboxes, inline chips.",
          },
          {
            name: "rounded-lg",
            description: "Menu and list items, small buttons.",
          },
          {
            name: "rounded-xl",
            description: "Buttons, dropdown and popover containers.",
          },
          {
            name: "rounded-2xl",
            description: "Dialogs, cards, and input surfaces.",
          },
          { name: "rounded-3xl" },
          { name: "rounded-4xl", description: "The largest hero surfaces." },
          {
            name: "rounded-full",
            description: "Avatars, pills, and status dots.",
          },
        ]}
      />
    </Section>
  ),
};

export const BorderWidth: Story = {
  render: () => (
    <Section
      title="Border Width"
      description={
        <p className="text-sm text-primary-600">
          Stroke widths. Nearly everything uses the 1px default; heavier strokes
          are for emphasis like focus rings and selected states.
        </p>
      }
    >
      <BorderTable
        kind="width"
        rows={[
          {
            name: "border-0",
            specimenClassName: "border-t-0",
            description: "Removes a border.",
          },
          {
            name: "border",
            specimenClassName: "border-t",
            description: "The default hairline for containers and dividers.",
          },
          {
            name: "border-2",
            specimenClassName: "border-t-2",
            description: "Emphasis: focus and selected states.",
          },
          { name: "border-4", specimenClassName: "border-t-4" },
          { name: "border-8", specimenClassName: "border-t-8" },
        ]}
      />
    </Section>
  ),
};
