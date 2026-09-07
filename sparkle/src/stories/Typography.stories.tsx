import type { Meta, StoryObj } from "@storybook/react";
import React from "react";

import { cn } from "@sparkle/lib/utils";

import {
  TokenChip,
  useComputedStyle,
  withThemedSurface,
} from "./foundations-helpers";

const meta = {
  title: "Foundations/Typography",
  tags: ["!manifest", "autodocs"],
  decorators: [withThemedSurface],
  parameters: {
    layout: "padded",
    docs: {
      description: {
        component: `The Sparkle type system, rendered in Geist. Prefer the composite utilities — \`heading-*\`, \`copy-*\`, \`label-*\` (and monospace \`heading-mono-*\`) — over ad-hoc \`text-*\` + \`font-*\` combinations so weight, line-height, and letter-spacing stay consistent. Each token is shown as a reference row: live specimen, a click-to-copy class chip, its computed value (size / line-height · weight, read from the compiled CSS), and a description of intended use. Compose modifiers like \`italic\` or \`font-mono\` on top of the copy styles when needed.`,
      },
    },
  },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const MEASURED = [
  "font-size",
  "line-height",
  "font-weight",
  "font-family",
] as const;

type TypeRow = {
  // Utility class documented by the row; the chip copies this.
  name: string;
  // Classes applied to the specimen (defaults to `name`).
  className?: string;
  sample: string;
  description?: React.ReactNode;
};

// Which computed properties the Value column shows.
type ValueKind = "metrics" | "family";

const TypeTableRow = ({
  row,
  valueKind,
  withDescription,
}: {
  row: TypeRow;
  valueKind: ValueKind;
  withDescription: boolean;
}) => {
  const ref = React.useRef<HTMLParagraphElement>(null);
  const measured = useComputedStyle(ref, MEASURED);
  const value =
    valueKind === "family"
      ? measured["font-family"]
      : measured["font-size"] &&
        `${measured["font-size"]} / ${measured["line-height"]} · ${measured["font-weight"]}`;

  return (
    <tr className="border-b border-border last:border-b-0">
      <td className="w-2/5 py-3 pr-4 align-middle">
        <p
          ref={ref}
          className={cn(
            row.className ?? row.name,
            "overflow-hidden text-ellipsis whitespace-nowrap"
          )}
        >
          {row.sample}
        </p>
      </td>
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
const TypeTable = ({
  rows,
  valueKind = "metrics",
}: {
  rows: TypeRow[];
  valueKind?: ValueKind;
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
          <TypeTableRow
            key={row.name}
            row={row}
            valueKind={valueKind}
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

const copySentence =
  "The quick brown fox jumps over the lazy dog and settles in.";

export const FontFamilies: Story = {
  render: () => (
    <Section
      title="Font Families"
      description={
        <p className="text-sm text-primary-600">
          The two families of the system. Everything defaults to Geist; use mono
          for code, identifiers, and technical values.
        </p>
      }
    >
      <TypeTable
        valueKind="family"
        rows={[
          {
            name: "font-sans",
            className: "font-sans text-xl",
            sample: "Sparkle",
            description: "Geist — the default for all product UI.",
          },
          {
            name: "font-mono",
            className: "font-mono text-xl",
            sample: "Sparkle",
            description: "Geist Mono — code, tokens, and technical values.",
          },
        ]}
      />
    </Section>
  ),
};

// Full literal class names: Tailwind only compiles classes it can see in
// source, so a computed `text-${size}` template would leave any size unused
// elsewhere in the codebase out of the stylesheet (rendering at base size).
const rawSizeClasses = [
  "text-xs",
  "text-sm",
  "text-base",
  "text-lg",
  "text-xl",
  "text-2xl",
  "text-3xl",
  "text-4xl",
  "text-5xl",
  "text-6xl",
  "text-7xl",
  "text-8xl",
  "text-9xl",
] as const;

export const FontSizes: Story = {
  render: () => (
    <Section
      title="Font Sizes"
      description={
        <p className="text-sm text-primary-600">
          The raw size scale with its paired line-heights. Prefer the semantic
          heading / copy / label utilities below; reach for raw sizes only when
          composing something the semantic styles don't cover.
        </p>
      }
    >
      <TypeTable
        rows={rawSizeClasses.map((sizeClass) => ({
          name: sizeClass,
          sample: "Aa",
        }))}
      />
    </Section>
  ),
};

export const FontWeights: Story = {
  render: () => (
    <Section
      title="Font Weights"
      description={
        <p className="text-sm text-primary-600">
          Geist is tuned slightly lighter than the usual scale — medium is 450
          and semibold 550. The semantic utilities already pick the right
          weight; these are for manual composition.
        </p>
      }
    >
      <TypeTable
        rows={[
          {
            name: "font-normal",
            className: "text-xl font-normal",
            sample: "Aa",
            description: "400 — body text (what copy-* uses).",
          },
          {
            name: "font-medium",
            className: "text-xl font-medium",
            sample: "Aa",
            description: "450 — labels and buttons (what label-* uses).",
          },
          {
            name: "font-semibold",
            className: "text-xl font-semibold",
            sample: "Aa",
            description: "550 — headings (what heading-* uses).",
          },
          {
            name: "font-bold",
            className: "text-xl font-bold",
            sample: "Aa",
            description: "700 — strong emphasis; use sparingly.",
          },
        ]}
      />
    </Section>
  ),
};

const headingDescriptions: Record<string, string> = {
  "heading-xs": "Tiny headers: menu group labels, overlines.",
  "heading-sm": "Menu items, compact card titles.",
  "heading-base": "Default component heading: dialog sections, list titles.",
  "heading-lg": "Section titles in pages and panels.",
  "heading-xl": "Dialog and page titles.",
  "heading-2xl": "Large page titles.",
  "heading-3xl": "Hero / marketing headings.",
};

// Literal class names so the Tailwind scanner compiles every one of them
// (a computed `heading-${size}` template only works for sizes that happen to
// be used elsewhere in the codebase).
const headingClasses = [
  "heading-xs",
  "heading-sm",
  "heading-base",
  "heading-lg",
  "heading-xl",
  "heading-2xl",
  "heading-3xl",
  "heading-4xl",
  "heading-5xl",
  "heading-6xl",
  "heading-7xl",
  "heading-8xl",
  "heading-9xl",
] as const;

export const Headings: Story = {
  render: () => (
    <Section
      title="Headings"
      description={
        <p className="text-sm text-primary-600">
          Semibold (550) headings across the scale — size, line-height, and
          letter-spacing are packaged together. Sizes above 3xl are for
          marketing surfaces.
        </p>
      }
    >
      <TypeTable
        rows={headingClasses.map((headingClass) => ({
          name: headingClass,
          sample: "Sparkle",
          description: headingDescriptions[headingClass],
        }))}
      />
    </Section>
  ),
};

const headingMonoClasses = [
  "heading-mono-lg",
  "heading-mono-xl",
  "heading-mono-2xl",
  "heading-mono-3xl",
  "heading-mono-4xl",
  "heading-mono-5xl",
  "heading-mono-6xl",
  "heading-mono-7xl",
  "heading-mono-8xl",
  "heading-mono-9xl",
] as const;

export const HeadingsMono: Story = {
  render: () => (
    <Section
      title="Headings Mono"
      description={
        <p className="text-sm text-primary-600">
          The heading scale in Geist Mono, for technical or editorial accents.
        </p>
      }
    >
      <TypeTable
        rows={headingMonoClasses.map((headingClass) => ({
          name: headingClass,
          sample: "Sparkle",
        }))}
      />
    </Section>
  ),
};

const copyDescriptions: Record<string, string> = {
  "copy-xs": "Captions, hints, and metadata.",
  "copy-sm": "Dense product body text.",
  "copy-base": "Default body text.",
  "copy-lg": "Comfortable long-form reading.",
  "copy-xl": "Intro paragraphs, marketing copy.",
  "copy-2xl": "Large editorial / marketing copy.",
};

const copyClasses = [
  "copy-xs",
  "copy-sm",
  "copy-base",
  "copy-lg",
  "copy-xl",
  "copy-2xl",
] as const;

export const Copy: Story = {
  render: () => (
    <Section
      title="Copy"
      description={
        <p className="text-sm text-primary-600">
          Regular-weight (400) body styles. Compose <code>italic</code> or{" "}
          <code>font-mono</code> on top when a passage needs it.
        </p>
      }
    >
      <TypeTable
        rows={copyClasses.map((copyClass) => ({
          name: copyClass,
          sample: copySentence,
          description: copyDescriptions[copyClass],
        }))}
      />
    </Section>
  ),
};

export const Labels: Story = {
  render: () => (
    <Section
      title="Labels"
      description={
        <p className="text-sm text-primary-600">
          Medium-weight (450) styles for interactive and compact UI text.
        </p>
      }
    >
      <TypeTable
        rows={[
          {
            name: "label-xs",
            sample: "Label",
            description: "Chips, counters, and the smallest buttons.",
          },
          {
            name: "label-sm",
            sample: "Label",
            description: "Buttons and form labels.",
          },
          {
            name: "label-base",
            sample: "Label",
            description: "Larger buttons and prominent labels.",
          },
        ]}
      />
    </Section>
  ),
};
