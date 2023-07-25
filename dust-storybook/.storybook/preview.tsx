import type { Preview } from "@storybook/react";
import { themes } from "@storybook/theming";

const preview: Preview = {
  parameters: {
    actions: { argTypesRegex: "^on[A-Z].*" },
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/,
      },
    },
    darkMode: {
      darkClass: ["dark"],
      lightClass: ["light"],
      stylePreview: true,
      dark: { ...themes.dark, appBg: "#292C2E" },
      light: { ...themes.normal, appBg: "white" },
    },
    backgrounds: {
      values: [{ name: "dark", value: "#1B1C1D" }],
    },
  },
};

export default preview;
