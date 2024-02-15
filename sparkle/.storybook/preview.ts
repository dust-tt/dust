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
          "Exemple",
        ], // Define your order here
      },
    },
    themes: {
      default: "light",
      list: [
        { name: "light", class: "theme-twt", color: "#00aced" },
        { name: "dark", class: "theme-fb", color: "#3b5998" },
      ],
    },
  },
  decorators: [
    withThemeByClassName({
      themes: {
        light: "",
        dark: "s-dark s-bg-slate-800",
      },
      defaultTheme: "light",
    }),
  ],
};

export default preview;
