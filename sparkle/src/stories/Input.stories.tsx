import type { Meta, StoryObj } from "@storybook/react";
import React from "react";

import { INPUT_SIZES } from "@sparkle/components/Input";

import { Image03, Input, SearchMd } from "../index_with_tw_base";

const MESSAGE_STATUSES = ["info", "default", "error"] as const;

const meta = {
  title: "Forms & Inputs/Input",
  component: Input,
  tags: ["a11y-issues", "autodocs"],
  parameters: {
    docs: {
      description: {
        component: `A single-line text field for short, freeform input such as a name, email, or search term. Inputs support an optional **label**, a helper or error **message** with status colouring, and the standard HTML input **type**s.

**When to use**
- To collect a short piece of text or a number from the user.
- Inside forms, search bars, and settings panels.

**Guidelines**
- Always provide a **label** so the field is understandable and accessible; placeholders are examples, not labels.
- Surface validation with **isError** and a **message** set to \`messageStatus="error"\`.
- Use **messageStatus="info"** for neutral helper text (constraints, formats, hints).
- For multi-line input use **TextArea**; for search-specific affordances use **SearchInput**.`,
      },
    },
  },
  argTypes: {
    size: {
      options: INPUT_SIZES,
      control: { type: "select" },
      description: "The size of the input (sm / md / lg)",
    },
    placeholder: {
      control: "text",
      description: "Placeholder text for the input",
    },
    value: {
      control: "text",
      description: "Current value of the input",
    },
    label: {
      control: "text",
      description: "Optional label above the input",
    },
    message: {
      control: "text",
      description: "Helper or error message below the input",
    },
    messageStatus: {
      options: MESSAGE_STATUSES,
      control: { type: "select" },
      description: "Status/color of the message",
    },
    disabled: {
      control: "boolean",
      description: "Whether the input is disabled",
    },
    isError: {
      control: "boolean",
      description: "Whether the input is in an error state",
    },
    type: {
      control: "select",
      options: ["text", "email", "password", "number", "tel", "url"],
      description: "HTML input type",
    },
  },
} satisfies Meta<typeof Input>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  args: {
    size: "md",
    placeholder: "Enter text...",
    value: "",
    label: "Input Label",
    message: "This is a helper message",
    messageStatus: "info",
    disabled: false,
    isError: false,
    type: "text",
  },
};

export const Sizes: Story = {
  render: () => (
    <div className="flex w-72 flex-col gap-4">
      {INPUT_SIZES.map((size) => (
        <Input key={size} size={size} placeholder={`Size ${size}`} />
      ))}
    </div>
  ),
};

export const WithIcons: Story = {
  render: () => (
    <div className="flex w-72 flex-col gap-4">
      <Input placeholder="Search…" icon={SearchMd} />
      <Input placeholder="With trailing icon" iconRight={Image03} />
      <Input placeholder="Both" icon={SearchMd} iconRight={Image03} />
    </div>
  ),
};

export const WithPrefixSuffix: Story = {
  render: () => (
    <div className="flex w-72 flex-col gap-4">
      <Input
        placeholder="0.00"
        prefix={<span className="text-faint">$</span>}
      />
      <Input
        placeholder="12,890"
        suffix={<span className="text-faint">cr</span>}
      />
    </div>
  ),
};

export const WithError: Story = {
  args: {
    placeholder: "Enter text...",
    value: "Invalid value",
    label: "Email",
    message: "Please enter a valid email address",
    messageStatus: "error",
    isError: true,
  },
};

export const Disabled: Story = {
  args: {
    placeholder: "Disabled input",
    value: "Cannot edit",
    label: "Disabled Field",
    disabled: true,
  },
};

export const WithInfoMessage: Story = {
  args: {
    placeholder: "Enter your name",
    label: "Full Name",
    message: "Name must be unique",
    messageStatus: "info",
  },
};

export const AllVariants: Story = {
  render: () => (
    <div className="flex flex-col gap-20">
      <div className="grid grid-cols-3 gap-4">
        <Input
          placeholder="placeholder"
          name="input"
          message="Name must be unique"
          messageStatus="info"
        />
        <Input
          placeholder="placeholder"
          name="input"
          value="value"
          message="errored because it's a very long message"
          messageStatus="error"
        />
        <Input
          placeholder="placeholder"
          name="input"
          value="value"
          message="Default message"
        />
        <Input
          placeholder="placeholder"
          name="input"
          value="value"
          message="errored because it's a very long message"
          messageStatus="error"
        />
        <Input
          placeholder="placeholder"
          name="input"
          value="disabled"
          disabled
          messageStatus="error"
        />
      </div>
      <div className="grid grid-cols-3 gap-4">
        <Input placeholder="placeholder" name="input" />
        <Input
          placeholder="placeholder"
          name="input"
          value="value"
          message="errored because it's a very long message"
          messageStatus="error"
        />
        <Input
          placeholder="placeholder"
          name="input"
          value="value"
          message="Default message"
        />
        <Input
          placeholder="placeholder"
          name="input"
          value="value"
          message="errored because it's a very long message"
          messageStatus="error"
        />
        <Input
          placeholder="placeholder"
          name="input"
          value="test"
          messageStatus="error"
        />
      </div>
      <div className="grid grid-cols-3 gap-4">
        <Input
          placeholder="placeholder"
          name="input"
          label="Firstname"
          isError
        />
        <Input
          placeholder="placeholder"
          name="input"
          label="Lastname"
          message="Input your lastname"
          messageStatus="info"
          isError
        />
      </div>
    </div>
  ),
};
