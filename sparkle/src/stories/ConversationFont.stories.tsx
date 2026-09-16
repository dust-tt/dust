import type { Meta, StoryObj } from "@storybook/react";
import React from "react";

import { Markdown } from "../index_with_tw_base";

const SAMPLE = `## Quarterly summary

Revenue grew **12%** quarter over quarter, driven by the *Enterprise* tier. The
team shipped 14 releases, closed 231 issues, and kept p95 latency under 400ms.

1. Onboarding time dropped from 9 days to 4.
2. Support volume fell by a third after the docs refresh.
3. Two new regions went live: \`eu-west-3\` and \`ap-southeast-1\`.

> Reading should feel effortless: the measure, leading and font all work
> together, or none of them do.

\`\`\`ts
const measure = "65ch";
\`\`\`
`;

interface ConversationFontSampleProps {
  font: "sans" | "serif" | "dyslexic";
}

/**
 * Mirrors what `ConversationFontProvider` does in front: the option is a
 * `data-conversation-font` attribute on an ancestor, and the agent answer
 * opts in with the `font-conversation` utility. Here the attribute is scoped to the
 * sample instead of <html> so three variants can sit side by side.
 */
function ConversationFontSample({ font }: ConversationFontSampleProps) {
  return (
    <div
      data-conversation-font={font === "sans" ? undefined : font}
      className="flex w-full flex-col gap-3"
    >
      <div className="heading-sm text-muted-foreground">
        {font === "sans"
          ? "Default (Geist)"
          : font === "serif"
            ? "Lora"
            : "OpenDyslexic"}
      </div>
      <div className="max-w-conversation font-conversation">
        <Markdown content={SAMPLE} />
      </div>
    </div>
  );
}

const meta = {
  title: "Product/Conversation/ConversationFont",
  component: ConversationFontSample,
  parameters: {
    docs: {
      description: {
        component: `The three conversation fonts a user can pick in Settings > Customization, rendered on the same Markdown sample. Only the agent's answer uses the \`font-conversation\` utility; user messages, thinking, the input bar and the rest of the app stay in Geist. \`font-size-adjust\` keeps the x-height constant across options so the perceived size does not jump.`,
      },
    },
  },
  tags: ["autodocs"],
  argTypes: {
    font: {
      options: ["sans", "serif", "dyslexic"],
      control: { type: "radio" },
    },
  },
} satisfies Meta<typeof ConversationFontSample>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Sans: Story = { args: { font: "sans" } };
export const Serif: Story = { args: { font: "serif" } };
export const Dyslexic: Story = { args: { font: "dyslexic" } };

export const SideBySide: Story = {
  args: { font: "sans" },
  render: () => (
    <div className="grid gap-10 lg:grid-cols-3">
      <ConversationFontSample font="sans" />
      <ConversationFontSample font="serif" />
      <ConversationFontSample font="dyslexic" />
    </div>
  ),
};
