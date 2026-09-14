import type { Meta, StoryObj } from "@storybook/react";
import React, { ComponentType } from "react";
import { fn } from "storybook/test";

import { Card, Icon } from "@sparkle/components";
import {
  CARD_SIZES,
  CARD_VARIANTS,
  CardActionButton,
  CardGrid,
} from "@sparkle/components/Card";
import { Planet } from "@sparkle/icons/v2-stroke";
import {
  BookOpen01,
  Scan,
  SearchMd,
  Table,
  Terminal,
  XClose,
} from "@sparkle/icons/v2-stroke";
import { Brackets } from "@sparkle/icons/v2-stroke";

const meta = {
  title: "Data Display/Card",
  component: Card,
  tags: ["a11y-issues", "autodocs"],
  parameters: {
    docs: {
      description: {
        component: `A container that groups related content onto a single, optionally interactive surface. Cards support **primary** / **secondary** / **tertiary** variants, **sizes**, **selected** and **disabled** states, a pulsing attention state, and an **action** slot. Use **CardGrid** to lay several out responsively.

**When to use**
- As selectable options or entry points (tools, data sources, agents).
- To group a small unit of related content into a tappable surface.

**Guidelines**
- When a card represents a single action, make the whole card clickable rather than nesting a button.
- Use **selected** for single- or multi-select grids; pair with **CardGrid** for layout.
- Reserve **isPulsing** for drawing attention to one element at a time.
- Put dismiss/secondary controls in the **action** slot (e.g. a **CardActionButton**).`,
      },
    },
  },
  argTypes: {
    variant: {
      options: CARD_VARIANTS,
      control: { type: "select" },
      description: "Visual style variant of the card",
    },
    size: {
      options: CARD_SIZES,
      control: { type: "select" },
      description: "Size/padding of the card",
    },
    disabled: {
      control: "boolean",
      description:
        "Whether the card is disabled (reduced opacity, no interactions)",
    },
    className: {
      control: "text",
      description: "Additional CSS classes to apply",
    },
    selected: {
      control: "boolean",
      description: "Visually highlight the card as selected",
    },
    children: {
      control: "text",
      description: "Content to display inside the card",
    },
  },
} satisfies Meta<typeof Card>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Interactive single card — tweak any prop from the Controls panel.
 *
 * @summary Interactive playground.
 */
export const Playground: Story = {
  args: {
    variant: "primary",
    size: "md",
    disabled: false,
    selected: false,
    isPulsing: false,
    children: "Card Content",
  },
  render: (args) => <Card {...args} />,
};

/**
 * The default surface for grouped content — a bordered card on the page
 * background.
 *
 * @summary Default primary variant.
 */
export const Primary: Story = {
  args: {
    variant: "primary",
    size: "md",
    children: "Primary Card",
  },
};

/**
 * A softer, filled surface for content that should sit slightly back from
 * primary cards.
 *
 * @summary Filled secondary variant.
 */
export const Secondary: Story = {
  args: {
    variant: "secondary",
    size: "md",
    children: "Secondary Card",
  },
};

/**
 * The most minimal treatment, for dense layouts where a full card surface
 * would be too heavy.
 *
 * @summary Minimal tertiary variant.
 */
export const Tertiary: Story = {
  args: {
    variant: "tertiary",
    size: "md",
    children: "Tertiary Card",
  },
};

/**
 * `disabled` reduces opacity and blocks interactions, for options that are
 * temporarily unavailable.
 *
 * @summary Disabled, non-interactive state.
 */
export const DisabledCard: Story = {
  args: {
    variant: "primary",
    size: "md",
    disabled: true,
    children: "Disabled Card",
  },
};

/**
 * `selected` highlights the card as the current choice; use it in single- or
 * multi-select grids.
 *
 * @summary Selected highlight state.
 */
export const SelectedCard: Story = {
  args: {
    variant: "secondary",
    size: "md",
    selected: true,
    children: "Selected Card",
  },
};

/**
 * `isPulsing` animates the card to draw the eye. Reserve it for one element
 * at a time.
 *
 * @summary Pulsing attention state.
 */
export const PulsingCard: Story = {
  args: {
    variant: "primary",
    size: "md",
    isPulsing: true,
    children: "This card pulses to draw attention",
  },
};

/**
 * An `onClick` makes the whole card the interactive target — prefer this over
 * nesting a button when the card represents a single action.
 *
 * @summary Whole-card click target.
 */
export const ClickableCard: Story = {
  args: {
    variant: "primary",
    size: "md",
    children: "Clickable Card",
    onClick: fn(),
  },
};

/**
 * Visual reference: every variant crossed with every size. For design review —
 * not a usage example.
 *
 * @summary Visual reference of all variants and sizes.
 */
export const AllVariants: Story = {
  tags: ["!manifest"],
  render: () => (
    <div className="flex flex-col gap-8 text-foreground">
      {CARD_VARIANTS.map((variant) => (
        <div key={variant} className="flex flex-col gap-4">
          <h3 className="text-lg font-semibold">
            {variant.charAt(0).toUpperCase() + variant.slice(1)} Variant
          </h3>
          <div className="flex gap-4">
            {CARD_SIZES.map((size) => (
              <div key={size}>
                <Card variant={variant} size={size} onClick={fn()}>
                  Hello World
                </Card>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  ),
};

interface CardData {
  icon: ComponentType<{ className?: string }>;
  title: string;
  description: string;
}

const cardData: CardData[] = [
  {
    icon: SearchMd,
    title: "Search",
    description: "Architecture Projects Descriptions",
  },
  {
    icon: Table,
    title: "Table Query",
    description: "Find product references",
  },
  {
    icon: Planet,
    title: "Web",
    description: "Search & browse the web",
  },
  {
    icon: Brackets,
    title: "Code Interpreter",
    description: "Write a description for it",
  },
  {
    icon: Terminal,
    title: "Dust App",
    description: "Dust App Name",
  },
  {
    icon: BookOpen01,
    title: "Include",
    description: "Description of the Data",
  },
  {
    icon: Scan,
    title: "Extract Data",
    description: "Description of the Data",
  },
];

/**
 * Cards in a responsive **CardGrid**, each exposing a dismiss control through
 * the `action` slot (a **CardActionButton**).
 *
 * @summary Action slot with a dismiss button, in a grid.
 */
export const WithActions: Story = {
  render: () => (
    <CardGrid>
      {cardData.map((card) => (
        <Card
          key={card.title}
          variant="primary"
          size="md"
          onClick={fn()}
          action={<CardActionButton size="icon" icon={XClose} />}
        >
          <div className="flex w-full flex-col gap-1 text-sm">
            <div className="flex w-full gap-1 font-semibold text-foreground">
              <Icon visual={card.icon} size="sm" />
              <div className="w-full">{card.title}</div>
            </div>
            <div className="w-full truncate text-sm text-muted-foreground">
              {card.description}
            </div>
          </div>
        </Card>
      ))}
    </CardGrid>
  ),
};

/**
 * A single-select grid: clicking a card moves the `selected` state, the usual
 * pattern for picking a tool or data source.
 *
 * @summary Single-select card grid.
 */
export const SelectableGrid: Story = {
  render: () => {
    const [selected, setSelected] = React.useState(0);

    return (
      <CardGrid>
        {cardData.slice(0, 4).map((card, index) => (
          <Card
            key={card.title}
            variant="primary"
            size="md"
            selected={selected === index}
            onClick={() => setSelected(index)}
            action={<CardActionButton size="icon" icon={XClose} />}
          >
            <div className="flex w-full flex-col gap-1 text-sm">
              <div className="flex w-full gap-1 font-semibold text-foreground">
                <Icon visual={card.icon} size="sm" />
                <div className="w-full">{card.title}</div>
              </div>
              <div className="w-full truncate text-sm text-muted-foreground">
                {card.description}
              </div>
            </div>
          </Card>
        ))}
      </CardGrid>
    );
  },
};

/**
 * A binary either/or choice built from two secondary cards sharing one
 * `selected` state.
 *
 * @summary Two-option exclusive choice.
 */
export const DualSelectable: Story = {
  render: () => {
    const [selectedIndex, setSelectedIndex] = React.useState(0);
    const duoCards = cardData.slice(0, 2);

    return (
      <div className="flex gap-4">
        {duoCards.map((card, index) => (
          <Card
            key={card.title}
            variant="secondary"
            size="md"
            selected={selectedIndex === index}
            onClick={() => setSelectedIndex(index)}
          >
            <div className="flex w-full flex-col gap-1 text-sm">
              <div className="flex w-full gap-1 font-semibold text-foreground">
                <Icon visual={card.icon} size="sm" />
                <div className="w-full">{card.title}</div>
              </div>
              <div className="w-full truncate text-sm text-muted-foreground">
                {card.description}
              </div>
            </div>
          </Card>
        ))}
      </div>
    );
  },
};
