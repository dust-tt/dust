import "../src/styles/fonts.css";
import "../src/styles/tailwind.css";
import "./preview.css";

import { withThemeByClassName } from "@storybook/addon-themes";
import type { Preview } from "@storybook/react";
import { create } from "storybook/theming/create";

const preview: Preview = {
  parameters: {
    // Surface axe violations as warnings in the test widget without failing
    // runs. Components with known violations carry the "a11y-issues" tag
    // (badge configured in manager.ts). `npm run a11y:sync` re-runs the suite
    // in strict mode (VITE_A11Y_STRICT=1 → violations fail) to refresh tags.
    a11y: { test: import.meta.env.VITE_A11Y_STRICT ? "error" : "todo" },
    docs: {
      // Render docs pages in the system fonts (Geist is loaded by fonts.css).
      theme: create({
        base: "light",
        fontBase: "Geist, sans-serif",
        fontCode: "'Geist Mono', monospace",
      }),
    },
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/,
      },
    },
    options: {
      storySort: {
        order: [
          "Getting Started",
          "Foundations",
          ["Colors", "Typography", "Shadows", "Motion"],
          "Assets",
          [
            "Logo",
            "Platform Logos",
            "Icons",
            ["Used in Product", "All Icons"],
            "Avatars",
            "*",
          ],
          "Actions",
          "Forms & Inputs",
          "Data Display",
          "Feedback & Status",
          "Navigation",
          "Overlays",
          "Layout",
          "Lists",
          "Product",
          ["Conversation", "Agent"],
          "Effects & Motion",
          "Lab",
          "Example",
          "*",
        ],
      },
    },
    themes: {
      default: "light",
      list: [
        { name: "light", class: "", color: "#ffffff" },
        { name: "dark", class: "dark", color: "#1c1917" },
      ],
    },
    backgrounds: {
      default: "white",
      values: [
        {
          name: "white",
          value: "#ffffff",
        },
        {
          name: "light",
          value: "#F7F7F7",
        },
        {
          name: "dark",
          value: "#090F18",
        },
        {
          name: "black",
          value: "#000000",
        },
      ],
    },
  },

  decorators: [
    withThemeByClassName({
      themes: {
        light: "",
        dark: "dark",
      },
      defaultTheme: "light",
    }),
  ],

  tags: ["autodocs"],
};

export default preview;
