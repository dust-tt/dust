import React from "react";

interface ColorSwatchProps {
  onClick: (color: string) => void;
  color: string;
}

const ColorSwatch = ({ color, onClick }: ColorSwatchProps) => {
  return (
    <div
      className={`s-${color} s-h-5 s-w-5 s-cursor-pointer s-rounded hover:s-scale-110`}
      onClick={() => onClick(color)}
    />
  );
};

interface ColorPickerProps<T extends string> {
  onColorSelect: (color: T) => void;
  colors: T[];
}

export function ColorPicker<T extends string>({
  colors,
  onColorSelect,
}: ColorPickerProps<T>) {
  return (
    <div className="s-grid-rows-20 w-auto s-grid s-grid-cols-8 s-gap-1.5 s-rounded s-p-2">
      {colors.map((color) => {
        return (
          <ColorSwatch
            key={color}
            color={color}
            onClick={() => onColorSelect(color)}
          />
        );
      })}
    </div>
  );
}
