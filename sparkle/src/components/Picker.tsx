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
  /** Icons to offer, keyed by name; the name is passed to `onIconSelect`. */
  icons: Record<string, React.ComponentType>;
  /** Called with the icon's name when a swatch is clicked. */
  onIconSelect: (iconName: string) => void;
  /** Name of the currently selected icon. */
  selectedIcon: string;
}

/**
 * A scrollable grid of named icon swatches for choosing an icon, e.g. when
 * customising an entity (agent avatar, folder, label). It renders the grid
 * only; mount it inside a PopoverRoot / PopoverContent triggered by a Button.
 * @summary Grid picker for icons.
 */
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
  /** Palette to offer, as background utility classes (e.g. "bg-blue-500"). */
  colors: string[];
  /** Called with the color's class when a swatch is clicked. */
  onColorSelect: (color: string) => void;
  /** Class of the currently selected color. */
  selectedColor: string;
}

/**
 * A grid of color swatches for choosing an accent colour, e.g. when
 * customising an entity (agent avatar, folder, label). It renders the grid
 * only; mount it inside a PopoverRoot / PopoverContent triggered by a Button.
 * @summary Grid picker for colors.
 */
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
