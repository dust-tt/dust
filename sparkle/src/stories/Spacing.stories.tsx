import type { Meta, StoryObj } from "@storybook/react";
import React from "react";

import {
  TokenChip,
  useComputedStyle,
  withThemedSurface,
} from "./foundations-helpers";

const meta = {
  title: "Foundations/Spacing",
  tags: ["!manifest", "autodocs"],
  decorators: [withThemedSurface],
  parameters: {
    layout: "padded",
    docs: {
      description: {
        component: `The spacing scale: a 4px-based ramp shared by every spacing utility — \`p-*\`, \`m-*\`, \`gap-*\`, \`space-*\`, \`size-*\`, \`w-*\`/\`h-*\`. Rows are named with \`gap-*\` as the canonical example; swap the prefix for the property you need (\`gap-2\` ↔ \`p-2\` ↔ \`m-2\`). Each token is shown as a reference row: a live specimen (two dots separated by the token's gap), a click-to-copy class chip, its computed value, and a description of intended use. Stick to the scale — arbitrary values like \`p-[13px]\` break the rhythm.`,
      },
    },
  },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

type SpacingRow = {
  // Canonical example class documented by the row; the chip copies it.
  name: string;
  // Static width class for the specimen spacer (Tailwind needs literal class
  // names at build time, so it cannot be derived from `name`).
  widthClass: string;
  description?: React.ReactNode;
};

const SPACING_MEASURED = ["width"] as const;

const SpacingTableRow = ({
  row,
  withDescription,
}: {
  row: SpacingRow;
  withDescription: boolean;
}) => {
  const ref = React.useRef<HTMLDivElement>(null);
  const measured = useComputedStyle(ref, SPACING_MEASURED);

  return (
    <tr className="border-b border-border last:border-b-0">
      <td className="w-52 py-3 pr-4 align-middle">
        <div className="flex h-12 items-center">
          <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-foreground" />
          <div
            ref={ref}
            className={`h-9 shrink-0 bg-primary-100 ${row.widthClass}`}
          />
          <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-foreground" />
        </div>
      </td>
      <td className="py-3 pr-4 align-middle">
        <TokenChip value={row.name} />
      </td>
      <td className="whitespace-nowrap py-3 pr-4 align-middle font-mono text-xs text-muted-foreground">
        {measured["width"] || "—"}
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
const SpacingTable = ({ rows }: { rows: SpacingRow[] }) => {
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
          <SpacingTableRow
            key={row.name}
            row={row}
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

export const Scale: Story = {
  render: () => (
    <Section
      title="Spacing Scale"
      description={
        <p className="text-sm text-primary-600">
          The 4px-based ramp. Small steps separate related elements inside a
          component; big steps separate sections of a page.
        </p>
      }
    >
      <SpacingTable
        rows={[
          {
            name: "gap-0.5",
            widthClass: "w-0.5",
            description: "Hairline separation: stacked list items.",
          },
          {
            name: "gap-1",
            widthClass: "w-1",
            description: "Tightly related: icon to its label.",
          },
          { name: "gap-1.5", widthClass: "w-1.5" },
          {
            name: "gap-2",
            widthClass: "w-2",
            description: "The default gap inside components.",
          },
          { name: "gap-2.5", widthClass: "w-2.5" },
          {
            name: "gap-3",
            widthClass: "w-3",
            description: "Between sibling controls (button rows).",
          },
          {
            name: "gap-4",
            widthClass: "w-4",
            description: "Between form fields and card content blocks.",
          },
          { name: "gap-5", widthClass: "w-5" },
          {
            name: "gap-6",
            widthClass: "w-6",
            description: "Between groups inside a panel.",
          },
          {
            name: "gap-8",
            widthClass: "w-8",
            description: "Between sections of a page.",
          },
          { name: "gap-10", widthClass: "w-10" },
          {
            name: "gap-12",
            widthClass: "w-12",
            description: "Major page sections and empty states.",
          },
          { name: "gap-16", widthClass: "w-16" },
          { name: "gap-20", widthClass: "w-20" },
          {
            name: "gap-24",
            widthClass: "w-24",
            description: "Marketing / hero rhythm.",
          },
        ]}
      />
    </Section>
  ),
};

export const NamedSpacing: Story = {
  render: () => (
    <Section
      title="Named Spacing"
      description={
        <p className="text-sm text-primary-600">
          Semantic spacing tokens with a fixed meaning, usable with any spacing
          prefix.
        </p>
      }
    >
      <SpacingTable
        rows={[
          {
            name: "mx-sidebar-side-spacing",
            widthClass: "w-sidebar-side-spacing",
            description:
              "Horizontal inset of sidebar content, so nav items, headers, and footers align.",
          },
        ]}
      />
    </Section>
  ),
};
