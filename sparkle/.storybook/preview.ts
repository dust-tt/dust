import "../src/styles/fonts.css";
import "../src/styles/tailwind.css";

import { withThemeByClassName } from "@storybook/addon-themes";
import type { Preview } from "@storybook/react";
import { create } from "storybook/theming/create";

const preview: Preview = {
  parameters: {
    // Surface axe violations as warnings in the test widget without failing
    // runs.
    a11y: { test: "todo" },
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
            ["Dust Logo", "Platform Logos"],
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
        // Swatches mirror --color-background in each theme (see the canvas decorator below).
        { name: "light", class: "", color: "#ffffff" },
        { name: "dark", class: "dark", color: "#141211" },
      ],
    },
  },

  decorators: [
    (Story) => {
      // Paint the canvas with the product's background token so components sit on the surface
      // they ship on. The variable follows the theme class set by withThemeByClassName below.
      const background = "var(--color-background)";

      // Update the document and every story canvas on a docs page (one per story).
      document.documentElement.style.backgroundColor = background;
      document
        .querySelectorAll<HTMLElement>(".docs-story")
        .forEach((canvas) => {
          canvas.style.backgroundColor = background;
        });

      return Story();
    },
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
