import type { Meta, StoryObj } from "@storybook/react";
import React, { useState } from "react";

import { cn, SearchInput, SearchInputWithPopover } from "../index_with_tw_base";

const meta = {
  title: "Components/SearchInput",
  component: SearchInput,
  parameters: {
    layout: "padded",
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

export const ExampleSearchInput: Story = {
  args: {
    name: "search",
    placeholder: "Search...",
    value: "",
    disabled: false,
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

export function SearchInputWithPopoverScrollableExample() {
  const [value, setValue] = useState("");
  const [open, setOpen] = useState(false);
  const items = Array.from({ length: 50 }).map((_, i) => `Item ${i + 1}`);

  const filteredItems = items.filter((item) =>
    item.toLowerCase().includes(value.toLowerCase())
  );

  return (
    <SearchInputWithPopover
      name="search"
      placeholder="Type to search..."
      value={value}
      onChange={setValue}
      open={open}
      onOpenChange={setOpen}
      items={filteredItems}
      onItemSelect={(item) => console.log(item)}
      renderItem={(item, selected) => (
        <div
          key={item}
          role="option"
          className={cn(
            "s-cursor-pointer s-py-2 hover:s-bg-primary-100 dark:hover:s-bg-primary-100-night",
            selected && "s-bg-primary-100"
          )}
          onClick={() => {
            setValue(item);
            setOpen(false);
          }}
        >
          {item}
        </div>
      )}
      noResults="No results found"
    />
  );
}
