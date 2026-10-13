import { cn } from "@sparkle/lib/utils";
import React from "react";

import { FLAG_COUNTRY_NAMES, type FlagCode, FLAGS } from "@sparkle/icons/flags";

export const FLAG_SIZES = ["xs", "sm", "md", "lg", "xl"] as const;
export type FlagSize = (typeof FLAG_SIZES)[number];

const FLAG_SIZE_CLASSES: Record<FlagSize, string> = {
  xs: "h-4 w-4",
  sm: "h-5 w-5",
  md: "h-6 w-6",
  lg: "h-8 w-8",
  xl: "h-12 w-12",
};

export interface FlagIconProps {
  /** Country or region code, as listed in `FLAG_COUNTRY_NAMES`. */
  code: FlagCode;
  size?: FlagSize;
  /**
   * Accessible name. Defaults to the country name; pass an empty string when
   * the flag is decorative and the name is already visible next to it.
   */
  label?: string;
  className?: string;
}

/**
 * Renders a country or region flag from its code, as a disc. Unlike stroke
 * icons, flags are coloured artwork and ignore the text colour. Use it in
 * country or language selectors, locale badges, and anywhere a region needs a
 * visual anchor next to its name; for a flag inside a selectable row pair it
 * with the country name from `FLAG_COUNTRY_NAMES`.
 *
 * @summary Country flag resolved from a code.
 */
export function FlagIcon({
  code,
  size = "sm",
  label,
  className,
}: FlagIconProps) {
  const Flag = FLAGS[code];
  if (!Flag) {
    return null;
  }

  const accessibleName = label ?? FLAG_COUNTRY_NAMES[code];
  const a11yProps =
    accessibleName === ""
      ? { "aria-hidden": true }
      : { role: "img", "aria-label": accessibleName };

  return (
    <Flag
      className={cn("shrink-0", FLAG_SIZE_CLASSES[size], className)}
      {...a11yProps}
    />
  );
}
