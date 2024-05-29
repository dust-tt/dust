import type { Meta } from "@storybook/react";
import React, { ComponentType } from "react";

import {
  BookOpenStrokeIcon,
  BracesStrokeIcon,
  CardButton,
  CommandLineStrokeIcon,
  Icon,
  IconButton,
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

export const SimpleExample = () => (
  <div className="s-flex s-flex-col s-gap-8">
    <div className="s-flex s-gap-2">
      <CardButton>hello</CardButton>
      <CardButton variant="secondary">hello</CardButton>
      <CardButton variant="tertiary">hello</CardButton>
    </div>
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

export const ActionCard: React.FC = () => (
  <div className="s-grid s-grid-cols-3 s-gap-3">
    {cardData.map((card, index) => (
      <CardButton
        key={index}
        variant="secondary"
        onClick={() => {
          alert(`You clicked on ${card.title}`);
        }}
      >
        <div className="s-flex s-w-full s-flex-col s-gap-2 s-text-sm">
          <div className="s-flex s-w-full s-gap-1 s-font-medium s-text-element-900">
            <Icon visual={card.icon} size="sm" className="s-text-element-900" />
            <div className="s-w-full">{card.title}</div>
            <IconButton
              icon={XMarkIcon}
              variant="tertiary"
              size="sm"
              onClick={(e) => {
                alert(`You clicked on close button of ${card.title}`);
                e.stopPropagation();
              }}
            />
          </div>
          <div className="s-w-full s-truncate s-text-base s-text-element-700">
            {card.description}
          </div>
        </div>
      </CardButton>
    ))}
  </div>
);
