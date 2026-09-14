import type { Meta, StoryObj } from "@storybook/react";
import React from "react";
import { fn } from "storybook/test";

import { ActionCard, Hoverable } from "@sparkle/components";
import type { ActionCardProps } from "@sparkle/components/ActionCard";
import {
  BookOpen01,
  Planet,
  SearchMd,
  Terminal,
} from "@sparkle/icons/v2-stroke";

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
  render: (args) => (
    <div className="w-80">
      <ActionCard {...args} />
    </div>
  ),
};

export default meta;

/**
 * The selectable mode used in the tool picker: `canAdd` makes the card
 * toggleable and `isSelected` marks it as already on the agent; `onClick`
 * handles the toggle and the `footer` link offers a secondary action.
 * @summary Selectable tool card, currently selected.
 */
export const SelectableTool: StoryObj = {
  args: {
    icon: BookOpen01,
    cardContainerClassName: "h-36",
    label: "Image Generation",
    description: "Agent can generate images (GPT Image 1).",
    isSelected: true,
    canAdd: true,
    onClick: fn(),
    footer: {
      label: "View documentation",
      onClick: fn(),
    },
  } satisfies ActionCardProps,
};

/**
 * The display-only mode (`canAdd={false}`) for tools already configured on
 * the agent. Long descriptions clamp, and inline links go through
 * **Hoverable** rather than raw anchors.
 * @summary Display-only card with an inline docs link.
 */
export const DisplayOnly: StoryObj = {
  args: {
    icon: Terminal,
    cardContainerClassName: "h-36",
    label: "Reasoning",
    description: (
      <>
        Agent can decide to trigger a reasoning model for complex tasks such as
        multi-step analysis, planning, or math. Learn more in{" "}
        <Hoverable
          href="https://docs.dust.tt"
          target="_blank"
          rel="noopener noreferrer"
          variant="primary"
        >
          the docs
        </Hoverable>
        .
      </>
    ),
    canAdd: false,
    footer: {
      label: "View documentation",
      onClick: fn(),
    },
  } satisfies ActionCardProps,
};

/**
 * The diff mode with `diffStatus="added"`, previewing a tool that a pending
 * change would add to the agent's toolset.
 * @summary Pending change: tool being added.
 */
export const AddedDiff: StoryObj = {
  args: {
    icon: SearchMd,
    cardContainerClassName: "h-36",
    label: "Web Search",
    description: "Search & browse the web for up-to-date information.",
    canAdd: false,
    diffStatus: "added",
  } satisfies ActionCardProps,
};

/**
 * The diff mode with `diffStatus="removed"`, previewing a tool that a
 * pending change would remove from the agent's toolset.
 * @summary Pending change: tool being removed.
 */
export const RemovedDiff: StoryObj = {
  args: {
    icon: Planet,
    cardContainerClassName: "h-36",
    label: "Code Interpreter",
    description: "Run code snippets in a sandboxed environment.",
    canAdd: false,
    diffStatus: "removed",
  } satisfies ActionCardProps,
};
