import { ScrollArea, ScrollBar } from "@sparkle/components/ScrollArea";
import { cn } from "@sparkle/lib";
import React from "react";

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
      "flex h-8 w-8 items-center justify-center rounded-lg border border-border transition duration-300",
      isSelected
        ? "bg-highlight-50"
        : "bg-muted-background hover:border-highlight-100 hover:bg-highlight-50"
    )}
  >
    <IconComponent className="h-5 w-5 text-foreground" />
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
        `${color} h-5 w-5 cursor-pointer rounded transition duration-200 hover:scale-110`,
        isSelected && "scale-110"
      )}
      onClick={() => onClick(color)}
    />
  );
};

export interface IconPickerProps {
  icons: Record<string, React.ComponentType>;
  onIconSelect: (iconName: string) => void;
  selectedIcon: string;
}

export const IconPicker: React.FC<IconPickerProps> = ({
  icons,
  onIconSelect,
  selectedIcon,
}) => {
  return (
    <ScrollArea className="h-[340px] w-fit overflow-auto">
      <div className="w-auto grid h-fit w-fit grid-cols-8 gap-1.5 p-4">
        {Object.entries(icons).map(([name, IconComponent]) => (
          <IconSwatch
            key={name}
            icon={IconComponent}
            onClick={() => onIconSelect(name)}
            isSelected={selectedIcon === name}
          />
        ))}
      </div>
      <ScrollBar orientation="vertical" size="compact" />
    </ScrollArea>
  );
};

export interface ColorPickerProps {
  colors: string[];
  onColorSelect: (color: string) => void;
  selectedColor: string;
}

export const ColorPicker: React.FC<ColorPickerProps> = ({
  colors,
  onColorSelect,
  selectedColor,
}) => {
  return (
    <div className="w-auto grid h-fit w-fit grid-cols-8 gap-1.5">
      {colors.map((color) => (
        <ColorSwatch
          key={color}
          color={color}
          onClick={() => onColorSelect(color)}
          isSelected={selectedColor === color}
        />
      ))}
    </div>
  );
};
