/** @type {import('tailwindcss').Config} */
const colors = require("tailwindcss/colors");

module.exports = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    fontFamily: {
      roboto: ["Roboto", "sans-serif"],
    },
    extend: {
      colors: {
        brand: {
          DEFAULT: colors.emerald[500],
          dark: colors.emerald[500],
        },
        action: {
          500: { DEFAULT: colors.blue[500], dark: colors.blue[500] },
          400: { DEFAULT: colors.blue[400], dark: colors.blue[600] },
          200: { DEFAULT: colors.blue[200], dark: colors.blue[800] },
          300: { DEFAULT: colors.blue[300], dark: colors.blue[700] },
          100: { DEFAULT: colors.blue[100], dark: colors.blue[900] },
          600: { DEFAULT: colors.blue[600], dark: colors.blue[400] },
          700: { DEFAULT: colors.blue[700], dark: colors.blue[300] },
          800: { DEFAULT: colors.blue[800], dark: colors.blue[200] },
          900: { DEFAULT: colors.blue[900], dark: colors.blue[100] },
          950: { DEFAULT: colors.blue[950], dark: colors.blue[50] },
          50: { DEFAULT: colors.blue[50], dark: colors.blue[950] },
        },
        success: {
          DEFAULT: colors.emerald[500],
          dark: colors.emerald[400],
        },
        warning: {
          DEFAULT: colors.red[500],
          dark: colors.red[400],
        },
        structure: {
          0: { DEFAULT: colors.white, dark: colors.black },
          50: { DEFAULT: colors.slate[50], dark: colors.slate[900] },
          100: { DEFAULT: colors.slate[100], dark: colors.slate[800] },
          200: { DEFAULT: colors.slate[200], dark: colors.slate[700] },
          300: { DEFAULT: colors.slate[300], dark: colors.slate[600] },
        },
        element: {
          900: { DEFAULT: colors.slate[900], dark: colors.slate[50] },
          800: { DEFAULT: colors.slate[800], dark: colors.slate[200] },
          700: { DEFAULT: colors.slate[500], dark: colors.slate[300] },
          500: { DEFAULT: colors.slate[300], dark: colors.slate[500] },
          600: { DEFAULT: colors.slate[400], dark: colors.slate[400] },
        },
      },
    },
  },
  darkMode: "class",
  variants: {
    extend: {
      backgroundColor: ["dark"],
    },
  },
  plugins: [require("@tailwindcss/forms")],
};
