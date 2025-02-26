import { withThemeByClassName } from "@storybook/addon-themes";
import type { Preview } from "@storybook/react";

const preview: Preview = {
  parameters: {
    actions: { argTypesRegex: "^on[A-Z].*" },
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
      default: "white",
      values: [
        {
          name: "white",
          value: "#ffffff",
        },
        {
          name: "light",
          value: "#F5F7FB",
        },
        {
          name: "dark",
          value: "#111729",
        },
        {
          name: "black",
          value: "#000000",
        },
      ],
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
};

export default preview;
