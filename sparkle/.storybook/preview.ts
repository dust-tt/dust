import "../src/styles/fonts.css";
import "../src/styles/global.css";

import { withThemeByClassName } from "@storybook/addon-themes";
import type { Preview } from "@storybook/react";

const preview: Preview = {
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/,
      },
    },
    options: {
      storySort: {
        order: [
          "Assets",
          "Primitives",
          "Components",
          "Modules",
          "Styles",
          "Example",
        ], // Define your order here
      },
    },
    themes: {
      default: "light",
      list: [
        { name: "light", class: "", color: "#ffffff" },
        { name: "dark", class: "s-dark", color: "#000000" },
      ],
    },
    backgrounds: {
      options: {
        white: {
          name: "white",
          value: "#ffffff",
        },

        light: {
          name: "light",
          value: "#F7F7F7",
        },

        dark: {
          name: "dark",
          value: "#090F18",
        },

        black: {
          name: "black",
          value: "#000000",
        },
      },
    },
  },

  decorators: [
    (Story, context) => {
      const isDark = context.globals.theme === "dark";
      const background = isDark ? "#000000" : "#ffffff";

      // Update both document and storybook-docs background
      document.documentElement.style.backgroundColor = background;
      document
        .querySelector(".docs-story")
        ?.setAttribute("style", `background-color: ${background}`);

      return Story();
    },
    withThemeByClassName({
      themes: {
        light: "",
        dark: "s-dark",
      },
      defaultTheme: "light",
    }),
  ],

  tags: ["autodocs"],

  initialGlobals: {
    backgrounds: {
      value: "white",
    },
  },
};

export default preview;
