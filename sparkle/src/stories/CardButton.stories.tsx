import type { Meta } from "@storybook/react";
import React, { ComponentType } from "react";

import { Button, CardButton } from "@sparkle/components";

import {
  BookOpenStrokeIcon,
  BracesStrokeIcon,
  CommandLineStrokeIcon,
  Icon,
  MagnifyingGlassStrokeIcon,
  PlanetStrokeIcon,
  ScanStrokeIcon,
  TableStrokeIcon,
  XMarkIcon,
} from "../index_with_tw_base";

const meta = {
  title: "Primitives/CardButton",
  component: CardButton,
} satisfies Meta<typeof CardButton>;

export default meta;

export const Demo = () => {
  const variants: Array<"primary" | "secondary" | "tertiary"> = [
    "primary",
    "secondary",
    "tertiary",
  ];
  const sizes: Array<"sm" | "md" | "lg"> = ["sm", "md", "lg"];

  return (
    <div className="s-flex s-flex-col s-gap-8">
      {variants.map((variant) => (
        <div key={variant} className="s-flex s-flex-col s-gap-4">
          <h3 className="s-text-lg s-font-semibold">
            {variant.charAt(0).toUpperCase() + variant.slice(1)} Variant
          </h3>
          <div className="s-flex s-gap-4">
            {sizes.map((size) => (
              <div>
                <CardButton
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
                </CardButton>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};

export const InteractiveStates = () => (
  <div className="s-flex s-gap-4">
    <CardButton
      variant="primary"
      onClick={() => alert("Primary Clicked")}
      className="s-hover:bg-primary-200"
    >
      Hover/Active
    </CardButton>
    <CardButton variant="secondary" disabled>
      Disabled
    </CardButton>
  </div>
);

interface CardData {
  icon: ComponentType<{ className?: string }>;
  title: string;
  description: string;
}

const cardData: CardData[] = [
  {
    icon: MagnifyingGlassStrokeIcon,
    title: "Search",
    description: "Architecture Projects Descriptions",
  },
  {
    icon: TableStrokeIcon,
    title: "Table Query",
    description: "Find product references",
  },
  {
    icon: PlanetStrokeIcon,
    title: "Web",
    description: "Search & browse the web",
  },
  {
    icon: BracesStrokeIcon,
    title: "Code Interpreter",
    description: "Write a description for it",
  },
  {
    icon: CommandLineStrokeIcon,
    title: "Dust App",
    description: "Dust App Name",
  },
  {
    icon: BookOpenStrokeIcon,
    title: "Include",
    description: "Description of the Data",
  },
  {
    icon: ScanStrokeIcon,
    title: "Extract Data",
    description: "Description of the Data",
  },
];

export const ActionCardDemo: React.FC = () => (
  <div className="s-grid s-grid-cols-3 s-gap-3">
    {cardData.map((card, index) => (
      <CardButton
        key={index}
        variant="primary"
        onClick={() => {
          alert(`You clicked on ${card.title}`);
        }}
      >
        <div className="s-flex s-w-full s-flex-col s-text-sm">
          <div className="s-flex s-w-full s-gap-1 s-font-medium s-text-element-900">
            <Icon visual={card.icon} size="sm" className="s-text-element-900" />
            <div className="s-w-full">{card.title}</div>
            <Button
              icon={XMarkIcon}
              className="-s-mr-2 -s-mt-2"
              variant="ghost"
              size="sm"
              onClick={(e) => {
                alert(`You clicked on close button of ${card.title}`);
                e.stopPropagation();
              }}
            />
          </div>
          <div className="s-w-full s-truncate s-text-sm s-text-muted-foreground">
            {card.description}
          </div>
        </div>
      </CardButton>
    ))}
  </div>
);
