import type { Meta } from "@storybook/react";
import React from "react";

import { ActionCard, Hoverable } from "@sparkle/components";
import { Planet } from "@sparkle/icons/v2-stroke";
import { BookOpen01, SearchMd, Terminal } from "@sparkle/icons/v2-stroke";

const meta: Meta<typeof ActionCard> = {
  title: "Product/Agent/ActionCard",
  tags: ["a11y-issues"],
  component: ActionCard,
  parameters: {
    docs: {
      description: {
        component: `A card representing a capability or tool in the agent builder. Shows an \`icon\`, \`label\`, and \`description\`, with an optional \`footer\` link. It has three modes: a selectable mode (\`canAdd\` + \`isSelected\`) for toggling a tool on an agent, a display-only mode (\`canAdd={false}\`), and a diff mode (\`diffStatus\` of \`added\` / \`removed\`) for showing pending changes.

**When to use**
- To list the tools and capabilities an agent has, and let builders add or remove them.
- To preview changes to an agent's toolset with \`diffStatus\`.

**Guidelines**
- Use the selectable mode (\`canAdd\` + \`isSelected\`) only when the card is meant to be toggled; otherwise set \`canAdd={false}\`.
- Don't combine \`diffStatus\` with \`isSelected\` — they are distinct, mutually exclusive modes.
- Put links (e.g. docs) in \`description\` via **Hoverable** or in the \`footer\`. For an in-conversation, accept/reject action proposal, use **ActionCardBlock** instead.`,
      },
    },
  },
};

export default meta;

export const Examples = () => (
  <div className="flex gap-3">
    {/* Not added - default md size */}
    <div className="w-80">
      <ActionCard
        icon={BookOpen01}
        cardContainerClassName="h-36"
        label="Image Generation"
        description="Agent can generate images (GPT Image 1)."
        isSelected
        canAdd
        onClick={() => console.log("Add Image Generation")}
        footer={{
          label: "Click here",
          onClick: () => console.log("Click here"),
        }}
      />
    </div>

    {/* Added - xl size */}
    <div className="w-80">
      <ActionCard
        cardContainerClassName="h-36"
        icon={Terminal}
        label="Reasoning"
        description={
          <>
            Agent can decide to trigger a reasoning model for complex tasks.
            Agent can decide to trigger a reasoning model for complex tasks.
            Agent can decide to trigger a reasoning model for complex tasks.
            Agent can decide to trigger a reasoning model for complex tasks.
            Agent can decide to trigger a reasoning model for complex tasks.
            Agent can decide to trigger a reasoning model for complex tasks.{" "}
            <Hoverable
              href="https://example.com/help"
              target="_blank"
              rel="noopener noreferrer"
              variant="primary"
            >
              the docs
            </Hoverable>
          </>
        }
        isSelected
        canAdd={false}
        footer={{
          label: "Click here",
          onClick: () => console.log("Click here"),
        }}
      />
    </div>
  </div>
);

export const DiffStatus = () => (
  <div className="flex gap-3">
    <div className="w-80">
      <ActionCard
        icon={SearchMd}
        cardContainerClassName="h-36"
        label="Web Search"
        description="Search & browse the web for up-to-date information."
        canAdd={false}
        diffStatus="added"
      />
    </div>
    <div className="w-80">
      <ActionCard
        icon={Planet}
        cardContainerClassName="h-36"
        label="Code Interpreter"
        description="Run code snippets in a sandboxed environment."
        canAdd={false}
        diffStatus="removed"
      />
    </div>
  </div>
);
