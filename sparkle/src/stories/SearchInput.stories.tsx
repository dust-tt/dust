import type { Meta, StoryObj } from "@storybook/react";
import React, { useState } from "react";
import { fn } from "storybook/test";

import {
  cn,
  InfoCircle,
  SearchInput,
  SearchInputWithPopover,
} from "../index_with_tw_base";

const meta = {
  title: "Forms & Inputs/SearchInput",
  component: SearchInput,
  parameters: {
    layout: "padded",
    docs: {
      description: {
        component: `A search-specific text field with a built-in search icon and clear affordance, wired through a simplified **value** / **onChange** (string) contract. The companion **SearchInputWithPopover** adds a results dropdown with keyboard navigation, custom **renderItem**, an optional **onSelectAll**, sticky top/bottom content, item counts, and a **noResults** state.

**When to use**
- For freeform search or filter input, optionally surfacing live results in an attached popover.

**Guidelines**
- **onChange** receives the raw string value (not a DOM event), so manage the query in state directly.
- Reach for **SearchInputWithPopover** when results should appear inline; supply **renderItem** and handle selection via **onItemSelect**.
- For generic short text or number entry use **Input**; for multi-line input use **TextArea**.`,
      },
    },
  },
  argTypes: {
    placeholder: {
      description: "Placeholder text for the search input",
      control: "text",
      defaultValue: "Search",
    },
    disabled: {
      description: "Whether the input is disabled",
      control: "boolean",
    },
    value: {
      description: "Current value of the input",
      control: "text",
    },
    name: {
      description: "Name attribute for the input",
      control: "text",
    },
    className: {
      description: "Additional CSS classes",
      control: "text",
    },
    onChange: {
      description: "Callback when input value changes",
      action: "changed",
    },
    onKeyDown: {
      description: "Callback when key is pressed",
      action: "keydown",
    },
  },
} satisfies Meta<React.ComponentProps<typeof SearchInput>>;

export default meta;
type Story = StoryObj<typeof meta>;

const onItemSelect = fn();
const onSelectAll = fn();

/**
 * The plain **SearchInput** with its simplified string contract: `onChange`
 * receives the new value directly, so the story keeps it in local state.
 * @summary Basic controlled search field.
 */
export const Default: Story = {
  args: {
    name: "search",
    placeholder: "Search...",
    value: "",
    disabled: false,
    onChange: fn(),
  },
  render: (args) => {
    const [value, setValue] = React.useState(args.value);

    return (
      <SearchInput
        {...args}
        value={value}
        onChange={(newValue) => {
          setValue(newValue);
          args.onChange?.(newValue);
        }}
      />
    );
  },
};

// Shared row renderer for the popover stories.
function renderResultRow(
  item: string,
  selected: boolean,
  onClick: (item: string) => void
) {
  return (
    <div
      key={item}
      role="option"
      className={cn(
        "cursor-pointer truncate px-2 py-2 hover:bg-primary-100",
        selected && "bg-primary-100"
      )}
      onClick={() => onClick(item)}
    >
      {item}
    </div>
  );
}

const PopoverMinimalDemo = () => {
  const [value, setValue] = useState("");
  const [open, setOpen] = useState(false);
  const items = [
    "Marketing",
    "Engineering",
    "Design",
    "Sales",
    "Customer Success",
  ];
  const filteredItems = items.filter((item) =>
    item.toLowerCase().includes(value.toLowerCase())
  );

  const selectItem = (item: string) => {
    setValue(item);
    setOpen(false);
    onItemSelect(item);
  };

  return (
    <SearchInputWithPopover
      name="search"
      placeholder="Search teams..."
      value={value}
      onChange={setValue}
      open={open}
      onOpenChange={setOpen}
      items={filteredItems}
      onItemSelect={selectItem}
      renderItem={(item, selected) =>
        renderResultRow(item, selected, selectItem)
      }
      noResults="No teams found"
    />
  );
};

/**
 * The minimum useful **SearchInputWithPopover** wiring: controlled `value` /
 * `open` state, a filtered `items` list, `renderItem`, `onItemSelect`, and a
 * `noResults` message. Everything else on the component is optional.
 * @summary Minimal results-popover wiring.
 */
export const PopoverWithResults: StoryObj = {
  render: () => <PopoverMinimalDemo />,
};

const PopoverFullyLoadedDemo = () => {
  const [value, setValue] = useState("");
  const [open, setOpen] = useState(false);
  const items = Array.from({ length: 50 }).map(
    (_, i) => `Document ${String(i + 1).padStart(2, "0")}`
  );
  const filteredItems = items.filter((item) =>
    item.toLowerCase().includes(value.toLowerCase())
  );

  const selectItem = (item: string) => {
    setValue(item);
    setOpen(false);
    onItemSelect(item);
  };

  return (
    <SearchInputWithPopover
      name="search"
      placeholder="Type to search..."
      value={value}
      onChange={setValue}
      open={open}
      onOpenChange={setOpen}
      items={filteredItems}
      onItemSelect={selectItem}
      renderItem={(item, selected) =>
        renderResultRow(item, selected, selectItem)
      }
      noResults="No results found"
      stickyTopContent={
        <div className="text-xs text-muted-foreground">
          Tip: use Ctrl+K to focus search.
        </div>
      }
      stickyBottomContent={
        <div className="text-xs text-muted-foreground">
          Press Enter to select the highlighted result.
        </div>
      }
      contentMessage={{
        title: "Showing the 50 most recent documents",
        variant: "green",
        icon: InfoCircle,
        className: "w-full",
        size: "lg",
      }}
      displayItemCount={true}
      totalItems={100}
    />
  );
};

/**
 * Every optional popover feature at once, on a long scrollable list:
 * `stickyTopContent` / `stickyBottomContent` (pinned around the results),
 * `contentMessage` (an inline banner), and `displayItemCount` + `totalItems`
 * (a "shown of total" counter). All of these can be omitted — see
 * PopoverWithResults for the minimal wiring.
 * @summary All optional popover features on a scrollable list.
 */
export const PopoverFullyLoaded: StoryObj = {
  render: () => <PopoverFullyLoadedDemo />,
};

const PopoverSelectAllDemo = () => {
  const [value, setValue] = useState("");
  const [open, setOpen] = useState(false);
  const items = Array.from({ length: 30 }).map(
    (_, i) => `Team ${String(i + 1).padStart(2, "0")}`
  );
  const filteredItems = items.filter((item) =>
    item.toLowerCase().includes(value.toLowerCase())
  );

  const selectItem = (item: string) => {
    setValue(item);
    setOpen(false);
    onItemSelect(item);
  };

  return (
    <div className="flex max-w-md flex-col gap-2">
      <SearchInputWithPopover
        name="search"
        placeholder="Search teams..."
        value={value}
        onChange={setValue}
        open={open}
        onOpenChange={setOpen}
        items={filteredItems}
        onItemSelect={selectItem}
        onSelectAll={() => {
          setValue("All teams");
          setOpen(false);
          onSelectAll();
        }}
        stickyTopContent={
          <div className="text-xs text-muted-foreground">
            {filteredItems.length} teams match your search.
          </div>
        }
        stickyBottomContent={
          <div className="text-xs text-muted-foreground">
            Missing a team? Ask an admin to create it.
          </div>
        }
        displayItemCount
        totalItems={42}
        renderItem={(item, selected) =>
          renderResultRow(item, selected, selectItem)
        }
        noResults="No teams found"
      />
      <div className="text-xs text-muted-foreground">
        Use Select all to capture the full list.
      </div>
    </div>
  );
};

/**
 * Passing **onSelectAll** adds a "Select all" affordance to the popover, for
 * flows where the user can act on every result at once instead of picking one.
 * @summary Popover with a Select all action.
 */
export const PopoverSelectAll: StoryObj = {
  render: () => <PopoverSelectAllDemo />,
};
