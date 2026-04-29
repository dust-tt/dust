import { BrandColorInput } from "@app/components/branding/BrandColorInput";
import { BRAND_COLORS_KEYS } from "@app/types/brandbook";
import type { BrandColorKey, BrandColors } from "@app/types/brandbook";
import React, { useCallback } from "react";

interface BrandColorPaletteProps {
  colors: BrandColors;
  onChange: (colors: BrandColors) => void;
}

/**
 * Renders 4 BrandColorInput controls (primary, secondary, background, text)
 * and forwards updates to the parent as a full BrandColors object.
 */
export function BrandColorPalette({ colors, onChange }: BrandColorPaletteProps) {
  const handleColorChange = useCallback(
    (colorKey: BrandColorKey, hex: string) => {
      onChange({ ...colors, [colorKey]: hex });
    },
    [colors, onChange]
  );

  return (
    <div className="s-flex s-flex-col s-gap-3">
      {BRAND_COLORS_KEYS.map((key) => (
        <BrandColorInput
          key={key}
          colorKey={key}
          value={colors[key]}
          onChange={handleColorChange}
        />
      ))}
    </div>
  );
}
