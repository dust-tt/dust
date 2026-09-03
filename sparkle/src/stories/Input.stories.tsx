import type { Meta, StoryObj } from "@storybook/react";
import React from "react";

import { INPUT_SIZES } from "@sparkle/components/Input";

import { Input, SearchMd } from "../index_with_tw_base";

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

/**
 * Interactive single input — tweak any prop from the Controls panel to
 * explore the full API.
 * @summary Controls sandbox for the Input props.
 */
export const Playground: Story = {
  tags: ["!manifest"],
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

/**
 * The three input sizes (sm / md / lg) stacked side by side for design
 * review.
 * @summary Size scale gallery.
 */
export const Sizes: Story = {
  tags: ["!manifest"],
  render: () => (
    <div className="flex w-72 flex-col gap-4">
      {INPUT_SIZES.map((size) => (
        <Input key={size} size={size} placeholder={`Size ${size}`} />
      ))}
    </div>
  ),
};

/**
 * A leading icon clarifies the field's purpose — here a search field. Use
 * `iconRight` for a trailing icon instead, or combine both.
 * @summary Input with a leading icon.
 */
export const WithLeadingIcon: Story = {
  args: {
    placeholder: "Search…",
    icon: SearchMd,
  },
};

/**
 * A `prefix` renders static content inside the field before the value —
 * here a currency symbol. Use `unit` for a label shown after the value.
 * @summary Input with a static prefix.
 */
export const WithPrefix: Story = {
  args: {
    placeholder: "0.00",
    prefix: <span className="text-faint">$</span>,
  },
};

/**
 * `unit` is shorthand for a `suffix` that's just a unit/currency label — it
 * renders in the muted box with faint text automatically, so callers don't
 * need to style that text themselves.
 * @summary Input with a unit suffix.
 */
export const WithUnit: Story = {
  args: {
    placeholder: "1,000",
    unit: "credits/month",
  },
};

/**
 * Failed validation combines `isError` for the red border with an error
 * `message` explaining how to fix the value.
 * @summary Error state with validation message.
 */
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

/**
 * A disabled input keeps its value visible but blocks interaction — use it
 * for fields the user cannot edit in the current context.
 * @summary Disabled input.
 */
export const Disabled: Story = {
  args: {
    placeholder: "Disabled input",
    value: "Cannot edit",
    label: "Disabled Field",
    disabled: true,
  },
};

/**
 * Neutral helper text below the field via `messageStatus="info"` — for
 * constraints, formats, or hints that are not errors.
 * @summary Input with an info helper message.
 */
export const WithInfoMessage: Story = {
  args: {
    placeholder: "Enter your name",
    label: "Full Name",
    message: "Name must be unique",
    messageStatus: "info",
  },
};
