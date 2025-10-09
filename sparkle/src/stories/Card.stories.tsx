import type { Meta, StoryObj } from "@storybook/react";
import React, { ComponentType } from "react";

import { Card, Icon } from "@sparkle/components";
import {
  CARD_SIZES,
  CARD_VARIANTS,
  CardActionButton,
  CardGrid,
} from "@sparkle/components/Card";
import {
  BookOpenIcon,
  BracesIcon,
  CommandLineIcon,
  MagnifyingGlassIcon,
  PlanetIcon,
  ScanIcon,
  TableIcon,
  XMarkIcon,
} from "@sparkle/icons/app";

const meta = {
  title: "Primitives/Card",
  component: Card,
  tags: ["autodocs"],
} satisfies Meta<typeof Card>;

export default meta;
type Story = StoryObj<typeof meta>;

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
    icon: MagnifyingGlassIcon,
    title: "Search",
    description: "Architecture Projects Descriptions",
  },
  {
    icon: TableIcon,
    title: "Table Query",
    description: "Find product references",
  },
  {
    icon: PlanetIcon,
    title: "Web",
    description: "Search & browse the web",
  },
  {
    icon: BracesIcon,
    title: "Code Interpreter",
    description: "Write a description for it",
  },
  {
    icon: CommandLineIcon,
    title: "Dust App",
    description: "Dust App Name",
  },
  {
    icon: BookOpenIcon,
    title: "Include",
    description: "Description of the Data",
  },
  {
    icon: ScanIcon,
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
          action={<CardActionButton size="mini" icon={XMarkIcon} />}
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
