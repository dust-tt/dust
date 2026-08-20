import type { Meta, StoryObj } from "@storybook/react";
import { fn } from "storybook/test";

import { TextArea } from "../index_with_tw_base";

const meta = {
  title: "Forms & Inputs/TextArea",
  tags: ["a11y-issues"],
  component: TextArea,
  parameters: {
    docs: {
      description: {
        component: `A multi-line text field for longer freeform input such as a prompt, instructions, or a comment. Supports an auto-growing minimum height via **minRows**, validation through **error** and **showErrorLabel**, a **disabled** state, and a read-only **isDisplay** rendering for showing static text.

**When to use**
- To collect or display text spanning multiple lines.

**Guidelines**
- Surface validation by passing an **error** message and enabling **showErrorLabel**.
- Use **isDisplay** (with **disabled**) to present non-editable content in the same visual style.
- For a single line of text such as a name or email use **Input**; for search use **SearchInput**.`,
      },
    },
  },
  args: {
    onChange: fn(),
  },
} satisfies Meta<typeof TextArea>;

export default meta;
type Story = StoryObj<typeof meta>;

const SAMPLE_INSTRUCTIONS =
  "I want you to act as a professional coder for html emails. We are currently using Sendgrid as our main way to handle emails. Make concise answers, always output the code in a Code Block.";

/**
 * An empty, editable text area collecting freeform input. `minRows` sets the
 * initial height; the field can be resized by the user.
 * @summary Editable multi-line text field.
 */
export const Default: Story = {
  args: {
    placeholder: "Describe what the agent should do…",
    minRows: 3,
  },
};

/**
 * Failed validation: pass an `error` message and enable `showErrorLabel` to
 * render it below the field alongside the warning border treatment.
 * @summary Validation error with visible message.
 */
export const WithError: Story = {
  args: {
    placeholder: "Describe what the agent should do…",
    defaultValue: "Some invalid content",
    error: "Instructions are too short.",
    showErrorLabel: true,
    minRows: 3,
  },
};

/**
 * A disabled text area: content is visible but cannot be edited, and the text
 * is muted.
 * @summary Disabled, non-editable state.
 */
export const Disabled: Story = {
  args: {
    placeholder: "Describe what the agent should do…",
    defaultValue: SAMPLE_INSTRUCTIONS,
    disabled: true,
    minRows: 3,
  },
};

/**
 * Read-only display mode: combine `isDisplay` with `disabled` to present
 * static text (e.g. an agent's saved instructions) in the same visual style
 * as the editable field, with a default cursor instead of a not-allowed one.
 * @summary Read-only display of static text.
 */
export const Display: Story = {
  args: {
    defaultValue: SAMPLE_INSTRUCTIONS,
    disabled: true,
    isDisplay: true,
    minRows: 3,
  },
};
