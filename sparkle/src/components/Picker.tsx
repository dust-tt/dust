import React from "react";

import { cn } from "@sparkle/lib";

import { ScrollArea } from "../components";

interface IconSwatchProps {
  icon: React.ComponentType<{ className?: string }>;
  onClick: () => void;
  isSelected?: boolean;
}

const IconSwatch: React.FC<IconSwatchProps> = ({
  icon: IconComponent,
  onClick,
  isSelected,
}) => (
  <button
    onClick={onClick}
    className={cn(
      "s-flex s-h-8 s-w-8 s-items-center s-justify-center s-rounded-lg s-border s-border-border s-transition s-duration-300",
      isSelected
        ? "dark:s-bg-higlight-900 s-bg-highlight-50"
        : "dark:hover:s-boder-highlight-800 s-bg-muted-background hover:s-border-highlight-100 hover:s-bg-highlight-50 dark:s-bg-muted-background-night dark:hover:s-bg-highlight-900"
    )}
  >
    <IconComponent className="s-h-5 s-w-5 s-text-gray-700 dark:s-text-gray-300" />
  </button>
);

interface ColorSwatchProps {
  onClick: (color: string) => void;
  color: string;
  isSelected?: boolean;
}

const ColorSwatch = ({ color, onClick, isSelected }: ColorSwatchProps) => {
  return (
    <div
      className={cn(
        `s-${color} s-h-5 s-w-5 s-cursor-pointer s-rounded s-transition s-duration-200 hover:s-scale-110`,
        isSelected && "s-scale-110"
      )}
      onClick={() => onClick(color)}
    />
  );
};

type PickerVariant = "color" | "icon";

export interface PickerProps {
  variant?: PickerVariant;
  colors?: string[];
  icons?: Record<string, React.ComponentType>;
  onColorSelect?: (color: string) => void;
  onIconSelect?: (iconName: string) => void;
  selectedColor?: string;
  selectedIcon?: string;
}

export const Picker: React.FC<PickerProps> = ({
  variant = "color",
  colors = [],
  icons = {},
  onColorSelect,
  onIconSelect,
  selectedColor,
  selectedIcon,
}) => {
  if (variant === "icon") {
    return (
      <ScrollArea className="s-h-[300px] s-w-fit s-overflow-auto">
        <div className="s-grid-rows-20 w-auto s-grid s-h-fit s-w-fit s-grid-cols-8 s-gap-1.5">
          {Object.entries(icons).map(([name, IconComponent]) => (
            <IconSwatch
              key={name}
              icon={IconComponent}
              onClick={() => onIconSelect?.(name)}
              isSelected={selectedIcon === name}
            />
          ))}
        </div>
      </ScrollArea>
    );
  }

  return (
    <div className="s-grid-rows-20 w-auto s-grid s-h-fit s-w-fit s-grid-cols-8 s-gap-1.5">
      {colors.map((color) => (
        <ColorSwatch
          key={color}
          color={color}
          onClick={() => onColorSelect?.(color)}
          isSelected={selectedColor === color}
        />
      ))}
    </div>
  );
};
