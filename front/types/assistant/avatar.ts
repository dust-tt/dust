export const DUST_AVATAR_URL =
  "https://dust.tt/static/systemavatar/dust_avatar_full.png";

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

export const generateTailwindBackgroundColors = (): string[] => {
  const tailwindColors: string[] = [];
  TAILWIND_COLOR_NAMES.forEach((color) => {
    TAILWIND_COLOR_SHADES.forEach((shade) => {
      tailwindColors.push(`bg-${color}-${shade}`);
    });
  });
  return tailwindColors;
};
