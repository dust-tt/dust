import type { Meta, StoryObj } from "@storybook/react";
import React from "react";

import {
  MessageCircle01,
  ContentMessage,
  ContentMessageAction,
  ContentMessageInline,
  Heart,
  InfoCircle,
} from "../index_with_tw_base";

type ContentMessageStoryProps = React.ComponentProps<typeof ContentMessage> & {
  showAction?: boolean;
};

const ICONS = {
  none: null,
  InfoCircle: InfoCircle,
  MessageCircle01: MessageCircle01,
  Heart: Heart,
} as const;

const COLOR_VARIANTS = [
  "primary",
  "warning",
  "success",
  "highlight",
  "info",
  "green",
  "blue",
  "rose",
  "golden",
] as const;

const INLINE_VARIANTS = [
  "primary",
  "warning",
  "success",
  "highlight",
  "info",
] as const;

const meta: Meta<ContentMessageStoryProps> = {
  title: "Feedback & Status/ContentMessage",
  component: ContentMessage,
  parameters: {
    docs: {
      description: {
        component: `An inline, non-blocking message that communicates contextual information, feedback, or status without interrupting the user — an informational note, a warning, or a success confirmation. Available in multiple **variants** and **sizes**, with an optional **icon** and action; **ContentMessageInline** renders a compact single-line form.

**When to use**
- To show persistent, contextual information attached to a region of the page.
- To explain a state ("This agent is read-only") or surface a non-urgent warning.

**Guidelines**
- Color should signal the *consequence for the user*, not the message's topic:
  - \`primary\` — neutral context, no action needed.
  - \`blue\` — useful info, guidance, or discoverability.
  - \`warning\` / \`rose\` — a blocking error or failed action that needs the user to intervene.
  - \`info\` / \`golden\` — a risk or degraded capability; the user can usually continue.
- Despite the name, \`info\` renders the **orange** tokens, not blue — use \`blue\` for informational messages and \`primary\` for a neutral gray one.
- Pair color with a clear title and icon; never rely on color alone.
- For transient feedback after an action, use a **Notification** (toast) instead.
- For a decision that must block the flow, use a **Dialog**.`,
      },
    },
  },
  argTypes: {
    title: {
      control: "text",
      description: "Title of the message",
    },
    children: {
      control: "text",
      description: "Content of the message",
    },
    variant: {
      options: COLOR_VARIANTS,
      control: { type: "select" },
      description: "Visual style variant",
    },
    size: {
      options: ["sm", "md", "lg"],
      control: { type: "select" },
      description: "Size of the message",
    },
    icon: {
      options: Object.keys(ICONS),
      mapping: ICONS,
      control: { type: "select" },
      description: "Icon to display",
    },
    showAction: {
      control: "boolean",
      description: "Show a right-aligned action button",
    },
  },
};

export default meta;
type Story = StoryObj<ContentMessageStoryProps>;

/**
 * The standard block message: a title and body text. Toggle `showAction` to
 * add a right-aligned **ContentMessageAction** button.
 * @summary Titled block message with optional action.
 */
export const Default: Story = {
  render: ({ showAction, ...args }) => (
    <ContentMessage
      {...args}
      action={
        showAction ? (
          <ContentMessageAction variant="primary" label="Action" />
        ) : undefined
      }
    />
  ),
  args: {
    title: "This is a title",
    children: "This is a message. It can be multiple lines long.",
    size: "md",
    showAction: false,
  },
};

/**
 * Pass an `icon` to reinforce the message's meaning next to the title; never
 * rely on color alone to convey severity.
 * @summary Block message with a leading icon.
 */
export const WithIcon: Story = {
  args: {
    title: "This is a title",
    icon: InfoCircle,
    children: "This is a message. It can be multiple lines long.",
    size: "md",
  },
};

/**
 * The body accepts arbitrary children — here a bulleted list, as used to show
 * an agent's chain of thought.
 * @summary Structured list content inside the message body.
 */
export const WithList: Story = {
  args: {
    title: "Agent Thoughts",
    variant: "primary",
    size: "md",
    children: (
      <ul className="list-disc py-2 pl-8 first:pt-0 last:pb-0">
        <li className="break-words py-1 first:pt-0 last:pb-0">
          <div className="whitespace-pre-wrap break-words py-1 font-normal first:pt-0 last:pb-0">
            Should search internal data as this appears to be a code-related
            question specific to the company&apos;s codebase
          </div>
        </li>
        <li className="break-words py-1 first:pt-0 last:pb-0">
          <div className="whitespace-pre-wrap break-words py-1 font-normal first:pt-0 last:pb-0">
            Search results show that Page.SectionHeader expects a string title,
            but code is using JSX expression with concatenation
          </div>
        </li>
      </ul>
    ),
  },
};

/**
 * Longer content can be laid out as several paragraphs with inline emphasis;
 * the message grows with its body.
 * @summary Multi-paragraph body content.
 */
export const MultiParagraph: Story = {
  args: {
    title: "This is a title",
    children: (
      <div className="flex flex-col gap-y-3">
        <div>This is a message. It can be multiple lines long.</div>
        <div>
          Another paragraph in the content message with a long line and some{" "}
          <strong>strong text</strong>.
        </div>
      </div>
    ),
    size: "md",
  },
};

/**
 * Visual reference for design review: every color variant side by side. See
 * the component guidelines for which variant to pick — color should signal
 * the consequence for the user.
 * @summary Gallery of all color variants for design review.
 */
export const ColorVariants: Story = {
  tags: ["!manifest"],
  render: () => (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {COLOR_VARIANTS.map((variant) => (
        <ContentMessage
          key={variant}
          title={`${variant.charAt(0).toUpperCase() + variant.slice(1)} Variant`}
          variant={variant}
          size="md"
        >
          This is a {variant} variant message. It shows how the component looks
          with this color scheme.
        </ContentMessage>
      ))}
    </div>
  ),
};

/**
 * **ContentMessageInline** is the compact single-line form of ContentMessage,
 * for short contextual notes attached to a control or region.
 * @summary Compact single-line message (ContentMessageInline).
 */
export const InlineBasic: Story = {
  render: () => (
    <ContentMessageInline icon={InfoCircle} variant="info">
      This is an inline message. It can be used to display a short message.
    </ContentMessageInline>
  ),
};

/**
 * A **ContentMessageInline** with a trailing **ContentMessageAction** button,
 * passed as a child after the message text.
 * @summary Inline message with one action button.
 */
export const InlineWithAction: Story = {
  render: () => (
    <ContentMessageInline icon={InfoCircle} variant="info">
      This is an inline message. It can be used to display a short message.
      <ContentMessageAction variant="primary" label="Button" />
    </ContentMessageInline>
  ),
};

/**
 * A **ContentMessageInline** can carry several **ContentMessageAction**
 * buttons — for example a primary and a highlighted one.
 * @summary Inline message with two action buttons.
 */
export const InlineWithTwoActions: Story = {
  render: () => (
    <ContentMessageInline icon={InfoCircle} variant="info">
      This is an inline message. It can be used to display a short message.
      <ContentMessageAction variant="primary" label="Button" />
      <ContentMessageAction variant="highlight" label="Button" />
    </ContentMessageInline>
  ),
};

/**
 * A **ContentMessageInline** with a `title` prefix — with body text and an
 * action, or title-only for a terse status flag.
 * @summary Inline message with a title prefix.
 */
export const InlineWithTitle: Story = {
  render: () => (
    <div className="flex flex-col gap-4">
      <ContentMessageInline title="Status" icon={InfoCircle} variant="info">
        This is an inline message.
        <ContentMessageAction variant="primary" label="Button" />
      </ContentMessageInline>
      <ContentMessageInline title="Alert" icon={InfoCircle} variant="warning" />
    </div>
  ),
};

/**
 * Visual reference for design review: the main **ContentMessageInline** color
 * variants stacked, each with an action button.
 * @summary Gallery of inline variants for design review.
 */
export const InlineVariants: Story = {
  tags: ["!manifest"],
  render: () => (
    <div className="flex flex-col gap-4">
      {INLINE_VARIANTS.map((variant) => (
        <ContentMessageInline key={variant} icon={InfoCircle} variant={variant}>
          {variant.charAt(0).toUpperCase() + variant.slice(1)} inline message
          <ContentMessageAction variant="primary" label="Action" />
        </ContentMessageInline>
      ))}
    </div>
  ),
};
