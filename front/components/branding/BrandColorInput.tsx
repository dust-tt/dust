import type { BrandColorKey } from "@app/types/brandbook";
import { Input } from "@dust-tt/sparkle";
import React, { useCallback, useId } from "react";

const COLOR_LABELS: Record<BrandColorKey, string> = {
  primary: "Primary",
  secondary: "Secondary",
  background: "Background",
  text: "Text",
};

interface BrandColorInputProps {
  colorKey: BrandColorKey;
  value: string;
  onChange: (colorKey: BrandColorKey, hex: string) => void;
}

/**
 * A color swatch (native <input type="color">) paired with a hex text input.
 * Clicking the swatch opens the OS color picker; the text input allows direct
 * hex entry. Both controls stay in sync.
 */
export function BrandColorInput({
  colorKey,
  value,
  onChange,
}: BrandColorInputProps) {
  const pickerId = useId();
  const label = COLOR_LABELS[colorKey];

  const handlePickerChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onChange(colorKey, e.target.value);
    },
    [colorKey, onChange]
  );

  const handleTextChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const raw = e.target.value;
      // Accept partial typing; only propagate when it looks like a full hex color.
      if (/^#[0-9A-Fa-f]{6}$/.test(raw)) {
        onChange(colorKey, raw);
      } else {
        // Still call onChange so the parent can keep its raw state in sync
        // while the user types (parent decides whether to apply it).
        onChange(colorKey, raw);
      }
    },
    [colorKey, onChange]
  );

  return (
    <div className="s-flex s-items-center s-gap-2">
      {/* Native color picker — hidden visually, triggered by clicking the swatch */}
      {/* Swatch: visible colored square that triggers the hidden native color picker */}
      <div className="s-relative s-h-9 s-w-9 s-shrink-0">
        {/* Visible colored swatch */}
        <span
          className="s-block s-h-full s-w-full s-rounded-md s-border s-border-border"
          style={{ backgroundColor: /^#[0-9A-Fa-f]{6}$/.test(value) ? value : "#000000" }}
          aria-hidden="true"
        />
        {/* Native color input overlaid, transparent so swatch shows through */}
        <label htmlFor={pickerId} className="s-sr-only">
          {`Pick ${label} color`}
        </label>
        <input
          id={pickerId}
          type="color"
          value={/^#[0-9A-Fa-f]{6}$/.test(value) ? value : "#000000"}
          onChange={handlePickerChange}
          className="s-absolute s-inset-0 s-h-full s-w-full s-cursor-pointer s-opacity-0"
          aria-label={`${label} color picker`}
        />
      </div>

      <Input
        label={label}
        value={value}
        onChange={handleTextChange}
        placeholder="#000000"
        className="s-font-mono s-text-sm"
        maxLength={7}
        aria-label={`${label} hex value`}
      />
    </div>
  );
}
