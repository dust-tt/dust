import type { Meta, StoryObj } from "@storybook/react";
import React, { ComponentType } from "react";

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
  tags: ["autodocs"],
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

export const Primary: Story = {
  args: {
    variant: "primary",
    size: "md",
    children: "Primary Card",
  },
};

export const Secondary: Story = {
  args: {
    variant: "secondary",
    size: "md",
    children: "Secondary Card",
  },
};

export const Tertiary: Story = {
  args: {
    variant: "tertiary",
    size: "md",
    children: "Tertiary Card",
  },
};

export const DisabledCard: Story = {
  args: {
    variant: "primary",
    size: "md",
    disabled: true,
    children: "Disabled Card",
  },
};

export const SelectedCard: Story = {
  args: {
    variant: "secondary",
    size: "md",
    selected: true,
    children: "Selected Card",
  },
};

export const PulsingCard: Story = {
  args: {
    variant: "primary",
    size: "md",
    isPulsing: true,
    children: "This card pulses to draw attention",
  },
};

export const AllVariants: Story = {
  render: () => {
    const variants = CARD_VARIANTS;
    const sizes = CARD_SIZES;

    return (
      <div className="s-flex s-flex-col s-gap-8 s-text-foreground dark:s-text-foreground-night">
        {variants.map((variant) => (
          <div key={variant} className="s-flex s-flex-col s-gap-4">
            <h3 className="s-text-lg s-font-semibold">
              {variant.charAt(0).toUpperCase() + variant.slice(1)} Variant
            </h3>
            <div className="s-flex s-gap-4">
              {sizes.map((size) => (
                <div>
                  <Card
                    key={size}
                    variant={variant}
                    size={size}
                    onClick={() => {
                      console.log(
                        `Button clicked - Size: ${size}, Variant: ${variant}`
                      );
                    }}
                  >
                    Hello World
                  </Card>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  },
};

export const InteractiveStates: Story = {
  render: () => (
    <div className="s-flex s-gap-4">
      <Card
        variant="primary"
        onClick={() => alert("Primary Clicked")}
        className="s-hover:bg-primary-200"
      >
        Hover/Active
      </Card>
      <Card variant="secondary" disabled>
        Disabled
      </Card>
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

export const WithActions: Story = {
  render: () => (
    <CardGrid>
      {cardData.map((card, index) => (
        <Card
          key={index}
          variant="primary"
          size="md"
          onClick={() => {
            alert(`You clicked on ${card.title}`);
          }}
          action={<CardActionButton size="icon" icon={XClose} />}
        >
          <div className="s-flex s-w-full s-flex-col s-gap-1 s-text-sm">
            <div className="s-flex s-w-full s-gap-1 s-font-semibold s-text-foreground">
              <Icon visual={card.icon} size="sm" />
              <div className="s-w-full">{card.title}</div>
            </div>
            <div className="s-w-full s-truncate s-text-sm s-text-muted-foreground">
              {card.description}
            </div>
          </div>
        </Card>
      ))}
    </CardGrid>
  ),
};

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
            <div className="s-flex s-w-full s-flex-col s-gap-1 s-text-sm">
              <div className="s-flex s-w-full s-gap-1 s-font-semibold s-text-foreground">
                <Icon visual={card.icon} size="sm" />
                <div className="s-w-full">{card.title}</div>
              </div>
              <div className="s-w-full s-truncate s-text-sm s-text-muted-foreground">
                {card.description}
              </div>
            </div>
          </Card>
        ))}
      </CardGrid>
    );
  },
};

export const DualSelectable: Story = {
  render: () => {
    const [selectedIndex, setSelectedIndex] = React.useState(0);
    const duoCards = cardData.slice(0, 2);

    return (
      <div className="s-flex s-gap-4">
        {duoCards.map((card, index) => (
          <Card
            key={card.title}
            variant="secondary"
            size="md"
            selected={selectedIndex === index}
            onClick={() => setSelectedIndex(index)}
          >
            <div className="s-flex s-w-full s-flex-col s-gap-1 s-text-sm">
              <div className="s-flex s-w-full s-gap-1 s-font-semibold s-text-foreground">
                <Icon visual={card.icon} size="sm" />
                <div className="s-w-full">{card.title}</div>
              </div>
              <div className="s-w-full s-truncate s-text-sm s-text-muted-foreground">
                {card.description}
              </div>
            </div>
          </Card>
        ))}
      </div>
    );
  },
};
