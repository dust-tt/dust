import type { Config } from "tailwindcss";

const config: Config = {
  // This prevent tailwind from purging the classes that are not used in the html.
  content: [],
  theme: {
    extend: {
      backgroundImage: {
        "gradient-radial": "radial-gradient(var(--tw-gradient-stops))",
        "gradient-conic":
          "conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))",
      },
    },
  },
  plugins: [],
  safelist: [
    {
      pattern: /./, // This matches all class names.
    },
  ],
};
export default config;
