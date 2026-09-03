import type { Meta, StoryObj } from "@storybook/react";
import React, { useState } from "react";
import { fn } from "storybook/test";

import {
  CoinsStacked02,
  FilterChips,
  Folder,
  ListSelect,
} from "../index_with_tw_base";

const meta = {
  title: "Forms & Inputs/FilterChips",
  component: FilterChips,
  parameters: {
    docs: {
      description: {
        component: `A horizontal row of single-select filter chips for narrowing a list or collection to one category at a time. Takes a list of **filters**, fires **onFilterClick** on selection, and can preselect one via **defaultFilter**.

**Variants**
- **primary** (default) — the chip fills solid when selected. The stronger of the two; use it when the chips are the main control on the surface.
- **secondary** — the chip stays ghost and takes a flat 6% overlay when selected, the same \`transparency-selected\` token **OptionCard** uses. Use it where a solid chip would read as the surface's primary action, such as a bar sitting above content.

**Slots**
- Chips can carry a **startSlot** and an **endSlot**, passed through the object form of **filters**.
- A slot is either an **icon** (a component or an element) or a **string**, which renders in smaller muted type — for a readout such as a \`3/5\` progress count.
- Slot text drops to 60% of the label colour on the selected **primary** chip, where the surface is dark.

**Selection**
- Uncontrolled by default: pass **defaultFilter** for the initial chip and the row tracks the rest itself.
- Pass **selectedFilter** to control it instead — for when the lit chip is a projection of state you already own, such as which side panel is open. The row then renders what you give it and cannot drift out of sync.
- Clicking the lit chip clears the selection and reports \`null\`, so a row of categories with no "All" among them can still get back to the unfiltered list.
- Pass **allowDeselect={false}** for rows that carry their own neutral chip, where "All" *is* the empty state.

**When to use**
- To let users switch between mutually exclusive views or categories (e.g. \`"Featured"\`, \`"Research"\`).

**Guidelines**
- Selection is single-choice: only one chip is active at a time, so use it for filtering rather than multi-tagging.
- Keep slot text to a couple of characters — a count or a ratio. Longer text belongs in the label.
- For a standalone status or metadata label that is not interactive, use **Chip** instead.`,
      },
    },
  },
  args: {
    onFilterClick: fn(),
  },
} satisfies Meta<typeof FilterChips>;

export default meta;
type Story = StoryObj<typeof meta>;

const CATEGORIES = [
  "Featured",
  "Writing",
  "Productivity",
  "Research",
  "Knowledge",
];

/** Panel entry points: an icon before the label, a progress readout after it. */
const PANELS = [
  { value: "credits", label: "Credits", startSlot: CoinsStacked02 },
  { value: "files", label: "Files", startSlot: Folder, endSlot: "4" },
  { value: "plan", label: "Plan", startSlot: ListSelect, endSlot: "3/5" },
];

/**
 * A category filter row with an initial selection: **defaultFilter** highlights
 * one chip on mount, and clicking another chip moves the selection and fires
 * **onFilterClick** with the chip's name.
 * @summary Single-select filter row with a preselected chip.
 */
export const Default: Story = {
  args: {
    filters: CATEGORIES,
    defaultFilter: "Featured",
  },
};

/**
 * Without **defaultFilter**, no chip is highlighted until the user picks one —
 * appropriate when the list starts unfiltered and every chip narrows it.
 * @summary Filter row with no initial selection.
 */
export const NoDefaultSelection: Story = {
  args: {
    filters: CATEGORIES,
  },
};

/**
 * **secondary** keeps the chip ghost and marks selection with a flat 6% overlay
 * rather than a solid fill, for a row sitting above content where a solid chip
 * would compete with the page's primary action.
 * @summary Filter row with the low-emphasis selected state.
 */
export const Secondary: Story = {
  args: {
    variant: "secondary",
    filters: CATEGORIES,
    defaultFilter: "Featured",
  },
};

/**
 * **startSlot** and **endSlot** take an icon or a string. Here each chip leads
 * with an icon and trails a count, so one row of chips doubles as the entry
 * points to a set of side panels.
 * @summary Chips with an icon and a text readout.
 */
export const WithSlots: Story = {
  args: {
    variant: "secondary",
    filters: PANELS,
    defaultFilter: "plan",
  },
};

/**
 * Clicking the lit chip clears it, because none of these chips represents the
 * unfiltered list. A row that leads with its own **All** chip should pass
 * **allowDeselect={false}** instead, so the selection cannot be emptied into a
 * state **All** already expresses.
 * @summary Deselection, and the row that opts out of it.
 */
export const Deselection: Story = {
  args: {
    filters: CATEGORIES,
    defaultFilter: "Featured",
  },
  render: (args) => (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <span className="label-xs text-muted-foreground">
          allowDeselect (default) — click the lit chip to clear it
        </span>
        <FilterChips {...args} />
      </div>
      <div className="flex flex-col gap-2">
        <span className="label-xs text-muted-foreground">
          allowDeselect={"{false}"} — &quot;All&quot; is the empty state
        </span>
        <FilterChips
          {...args}
          allowDeselect={false}
          filters={["All", ...CATEGORIES]}
          defaultFilter="All"
        />
      </div>
    </div>
  ),
};

/**
 * Passing **selectedFilter** hands the row over to the caller, for when the lit
 * chip is really a view of state the caller already holds — here which side
 * panel is open. Re-clicking reports `null`, which closes the panel.
 * @summary Controlled row driven by the caller's own state.
 */
export const Controlled: Story = {
  args: {
    variant: "secondary",
    filters: PANELS,
  },
  render: (args) => {
    const [openPanel, setOpenPanel] = useState<string | null>("plan");

    return (
      <div className="flex flex-col gap-4">
        <FilterChips
          {...args}
          selectedFilter={openPanel}
          onFilterClick={(filterName) => {
            setOpenPanel(filterName);
            args.onFilterClick(filterName);
          }}
        />
        <div className="copy-sm text-muted-foreground">
          {openPanel ? `${openPanel} panel open` : "no panel open"}
        </div>
      </div>
    );
  },
};
