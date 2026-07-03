import { addons } from "storybook/manager-api";
import { create } from "storybook/theming/create";

// Served from `.storybook/assets` via the `/brand` staticDir in main.ts.
const dustTheme = create({
  base: "light",
  brandTitle: "Dust Sparkle",
  brandUrl: "https://dust.tt",
  brandImage: "/brand/dust.svg",
  brandTarget: "_self",
  // Geist is loaded in the manager via manager-head.html (the manager does
  // not load the preview's fonts.css).
  fontBase: "Geist, sans-serif",
  fontCode: "'Geist Mono', monospace",
});

addons.setConfig({ theme: dustTheme });
