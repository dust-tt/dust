import { addons } from "storybook/manager-api";
import { create } from "storybook/theming/create";
import {
  defaultConfig,
  type TagBadgeParameters,
} from "storybook-addon-tag-badges/manager-helpers";

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

addons.setConfig({
  theme: dustTheme,
  tagBadges: [
    // Components whose stories have known axe-core violations (see the
    // Accessibility panel). Remove the tag from a story file once fixed.
    {
      tags: "a11y-issues",
      badge: {
        text: "A11y",
        style: { backgroundColor: "#FEE2E2", color: "#B91C1C" },
        tooltip: "Has known accessibility violations",
      },
      display: {
        sidebar: [{ type: "component", skipInherited: false }],
        toolbar: false,
        mdx: true,
      },
    },
    {
      tags: "needs-work",
      badge: {
        text: "WIP",
        style: { backgroundColor: "#FEF3C7", color: "#92400E" },
        tooltip: "Stories are AI-generated and not yet reviewed",
      },
      display: {
        sidebar: [{ type: "component", skipInherited: false }],
        toolbar: false,
        mdx: true,
      },
    },
    ...defaultConfig,
  ] satisfies TagBadgeParameters,
});
