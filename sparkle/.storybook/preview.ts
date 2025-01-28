import { withThemeByClassName } from "@storybook/addon-themes";
import type { Preview } from "@storybook/react";
import "../src/styles/tailwind.css";

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
        { name: "dark", class: "s-dark", color: "#0f172a" },
      ],
    },
  },
  decorators: [
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
