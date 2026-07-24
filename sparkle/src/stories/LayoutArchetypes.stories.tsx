import type { Meta, StoryObj } from "@storybook/react";
import React from "react";

import {
  TokenChip,
  useComputedStyle,
  withThemedSurface,
} from "./foundations-helpers";

const meta = {
  title: "Foundations/Layout",
  tags: ["autodocs"],
  decorators: [withThemedSurface],
  parameters: {
    layout: "padded",
    docs: {
      description: {
        component: `How page layout works across the product (see \`design_docs/LAYOUT_SYSTEM.md\`). Every page belongs to exactly one **layout archetype**; the app shell owns width and gutters, pages own vertical rhythm. Pages never set \`max-w-*\` or horizontal padding on their top-level wrapper.`,
      },
    },
  },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

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

type WidthRow = {
  // Canonical class documented by the row; the chip copies it.
  name: string;
  // Static width class for the specimen bar (Tailwind needs literal class
  // names at build time, so it cannot be derived from `name`).
  widthClass: string;
  description: React.ReactNode;
};

const WIDTH_MEASURED = ["width"] as const;

const WidthBarRow = ({ row }: { row: WidthRow }) => {
  const ref = React.useRef<HTMLDivElement>(null);
  const measured = useComputedStyle(ref, WIDTH_MEASURED);

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-3">
        <TokenChip value={row.name} />
        <span className="font-mono text-xs text-muted-foreground">
          {measured["width"] || "—"}
        </span>
        <span className="text-sm text-muted-foreground">{row.description}</span>
      </div>
      <div
        ref={ref}
        className={`h-6 max-w-full rounded bg-primary-100 ${row.widthClass}`}
      />
    </div>
  );
};

export const WidthTokens: Story = {
  render: () => (
    <Section
      title="Width tokens"
      description={
        <p className="text-sm text-primary-600">
          The named content widths. These are the only page-level max-widths in
          the product; raw <code>max-w-4xl</code>/<code>max-w-6xl</code>-style
          caps on pages are being retired.
        </p>
      }
    >
      <div className="flex flex-col gap-6 overflow-x-auto">
        <WidthBarRow
          row={{
            name: "max-w-content",
            widthClass: "w-content",
            description:
              "The centered reading/settings column, applied by the app shell (Centered archetype).",
          }}
        />
        <WidthBarRow
          row={{
            name: "max-w-conversation",
            widthClass: "w-conversation",
            description:
              "The conversation column, applied inside the conversation surface.",
          }}
        />
        <WidthBarRow
          row={{
            name: "max-w-narrow",
            widthClass: "w-narrow",
            description:
              "Standalone card/column surfaces: onboarding, auth, error pages.",
          }}
        />
      </div>
    </Section>
  ),
};

type ArchetypeRow = {
  name: string;
  definition: string;
  width: string;
  scroll: string;
  exemplars: string;
};

const ARCHETYPES: ArchetypeRow[] = [
  {
    name: "Centered",
    definition: "Single-column reading/settings surface",
    width: "max-w-content, centered, shell gutter",
    scroll: "shell",
    exemplars: "Workspace settings, Labs",
  },
  {
    name: "Wide",
    definition: "Lists, tables, card grids",
    width: "full available width, shell gutter",
    scroll: "shell",
    exemplars: "Agent list, Members, Analytics",
  },
  {
    name: "Full",
    definition: "Immersive; the page owns everything including scroll",
    width: "none — explicit opt-out",
    scroll: "page component",
    exemplars: "Conversation, Pod, builder editors",
  },
  {
    name: "Flow",
    definition: "Focused task/wizard framed by top/bottom bars, no sidebar",
    width: "narrow centered column, bar-framed",
    scroll: "scaffold",
    exemplars: "Agent creation, dataset creation",
  },
  {
    name: "Standalone",
    definition: "Outside the app shell entirely",
    width: "max-w-narrow centered card/column",
    scroll: "scaffold",
    exemplars: "Onboarding, OAuth, share pages",
  },
];

export const Archetypes: Story = {
  render: () => (
    <Section
      title="Layout archetypes"
      description={
        <p className="text-sm text-primary-600">
          Every page declares exactly one archetype. In <code>front</code>, the
          first three are values of{" "}
          <code>
            useSetContentWidth(&quot;centered&quot; | &quot;wide&quot; |
            &quot;full&quot;)
          </code>
          ; Flow and Standalone are scaffolds outside the shell.
        </p>
      }
    >
      <table className="w-full border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
            <th className="py-2 pr-4 font-medium">Archetype</th>
            <th className="py-2 pr-4 font-medium">Definition</th>
            <th className="py-2 pr-4 font-medium">Width</th>
            <th className="py-2 pr-4 font-medium">Scroll owner</th>
            <th className="py-2 font-medium">Exemplars</th>
          </tr>
        </thead>
        <tbody>
          {ARCHETYPES.map((a) => (
            <tr key={a.name} className="border-b border-border last:border-b-0">
              <td className="py-3 pr-4 align-top font-semibold">{a.name}</td>
              <td className="py-3 pr-4 align-top text-muted-foreground">
                {a.definition}
              </td>
              <td className="py-3 pr-4 align-top text-muted-foreground">
                {a.width}
              </td>
              <td className="py-3 pr-4 align-top text-muted-foreground">
                {a.scroll}
              </td>
              <td className="py-3 align-top text-muted-foreground">
                {a.exemplars}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Section>
  ),
};

const GAP_RAMP: { name: string; use: string }[] = [
  {
    name: "gap-2",
    use: "Tight: within a control cluster (icon + label rows).",
  },
  { name: "gap-4", use: "Default: between related elements (form fields)." },
  { name: "gap-6", use: "Between blocks inside a section." },
  { name: "gap-8", use: "Between page sections." },
];

export const VerticalRhythm: Story = {
  render: () => (
    <Section
      title="Vertical rhythm"
      description={
        <p className="text-sm text-primary-600">
          Pages own vertical rhythm through the numeric gap ramp. Off-ramp
          values (<code>gap-3</code>, <code>gap-5</code>, ad-hoc margins) are
          review flags at page level. The shell owns everything horizontal:
          pages never set <code>max-w-*</code> or <code>px-*</code> on their
          top-level wrapper, and layout media queries use the single{" "}
          <code>md:</code> breakpoint (reusable components use container queries
          instead).
        </p>
      }
    >
      <div className="flex flex-col gap-3">
        {GAP_RAMP.map((g) => (
          <div key={g.name} className="flex items-center gap-3">
            <TokenChip value={g.name} />
            <span className="text-sm text-muted-foreground">{g.use}</span>
          </div>
        ))}
      </div>
    </Section>
  ),
};
