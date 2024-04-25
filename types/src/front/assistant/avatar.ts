const TAILWIND_COLOR_NAMES = [
  "pink",
  "rose",
  "red",
  "orange",
  "amber",
  "yellow",
  "lime",
  "green",
  "emerald",
  "teal",
  "cyan",
  "sky",
  "blue",
  "indigo",
  "violet",
  "purple",
  "fuchsia",
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
