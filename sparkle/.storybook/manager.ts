import { addons } from "storybook/manager-api";
import { create } from "storybook/theming/create";

// Served from `.storybook/assets` via the `/brand` staticDir in main.ts.
const dustTheme = create({
  base: "light",
  brandTitle: "Dust Sparkle",
  brandUrl: "https://dust.tt",
  brandImage: "/brand/dust.svg",
  brandTarget: "_self",
});

addons.setConfig({ theme: dustTheme });
