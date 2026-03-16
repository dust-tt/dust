export const DUST_AVATAR_URL =
  "https://dust.tt/static/systemavatar/dust_avatar_full.png";

// If you update these colors or shades, also update the safelist pattern
// in front & sparkle tailwind.config.js to keep avatar backgrounds in the CSS output.
const TAILWIND_COLOR_NAMES = [
  "gray",
  "blue",
  "violet",
  "pink",
  "red",
  "orange",
  "golden",
  "lime",
  "emerald",
];
const TAILWIND_COLOR_SHADES = [
  "100",
  "200",
  "300",
  "400",
  "500",
  "600",
  "700",
  "800",
];

export const TAILWIND_BACKGROUND_COLORS: string[] =
  TAILWIND_COLOR_NAMES.flatMap((color) =>
    TAILWIND_COLOR_SHADES.map((shade) => `bg-${color}-${shade}`)
  );
