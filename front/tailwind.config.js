/** @type {import('tailwindcss').Config} */
import { black, blue, emerald, red, slate, white } from "tailwindcss/colors";

export const content = [
  "./pages/**/*.{js,ts,jsx,tsx}",
  "./components/**/*.{js,ts,jsx,tsx}",
];
export const theme = {
  fontFamily: {
    // roboto: ["Roboto", "sans-serif"],
    objektiv: ["'objektiv-mk1'", "sans-serif"],
  },
  extend: {
    colors: {
      brand: {
        DEFAULT: emerald[500],
        dark: emerald[500],
      },
      action: {
        500: { DEFAULT: blue[500], dark: blue[500] },
        400: { DEFAULT: blue[400], dark: blue[600] },
        200: { DEFAULT: blue[200], dark: blue[800] },
        300: { DEFAULT: blue[300], dark: blue[700] },
        100: { DEFAULT: blue[100], dark: blue[900] },
        600: { DEFAULT: blue[600], dark: blue[400] },
        700: { DEFAULT: blue[700], dark: blue[300] },
        800: { DEFAULT: blue[800], dark: blue[200] },
        900: { DEFAULT: blue[900], dark: blue[100] },
        950: { DEFAULT: blue[950], dark: blue[50] },
        50: { DEFAULT: blue[50], dark: blue[950] },
      },
      success: {
        DEFAULT: emerald[500],
        dark: emerald[400],
      },
      warning: {
        DEFAULT: red[500],
        dark: red[400],
      },
      structure: {
        0: { DEFAULT: white, dark: black },
        50: { DEFAULT: slate[50], dark: slate[900] },
        100: { DEFAULT: slate[100], dark: slate[800] },
        200: { DEFAULT: slate[200], dark: slate[700] },
        300: { DEFAULT: slate[300], dark: slate[600] },
      },
      element: {
        900: { DEFAULT: slate[900], dark: slate[50] },
        800: { DEFAULT: slate[800], dark: slate[200] },
        700: { DEFAULT: slate[500], dark: slate[300] },
        500: { DEFAULT: slate[300], dark: slate[500] },
        600: { DEFAULT: slate[400], dark: slate[400] },
      },
    },
  },
};
export const darkMode = "class";
export const variants = {
  extend: {
    backgroundColor: ["dark"],
  },
};
export const plugins = [require("@tailwindcss/forms")];
